#!/usr/bin/env python3
"""Validate and serve the self-contained Investor API alpha.2 handoff."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import threading
import urllib.error
import urllib.request
from collections.abc import Sequence
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, ClassVar

VERSION = "v1.1.0-alpha.2"
EXPECTED_FILES = {
    "contract.json",
    "openapi.json",
    "schemas.json",
    "examples.json",
    "capabilities.json",
    "connection.dev.json",
    "README.md",
    "tools/conformance.py",
    "bundle.json",
}
AUTHORIZATION = "Bearer fixture-google-oidc"
USER_ASSERTION = "fixture-user-assertion"
CORRELATION = "corr_contract_fixture"
REQUIRED_README_SECTIONS = {
    "## Package map",
    "## Capability and external-input register",
    "## Current Dev handoff state and responsibilities",
    "## Verify before integration",
    "## System ownership boundary",
    "## Token and key direction",
    "## Required frontend integration order",
    "## Alpaca environment and credential rules",
    "## Percentage allocation and subscription meaning",
    "## HTTP state, idempotency and concurrency",
    "## Pagination, polling and SSE",
    "## Error handling and escalation",
    "## Delivery truth",
}
REQUIRED_STANDALONE_COMMANDS = {
    "python3 tools/conformance.py validate",
    "python3 tools/conformance.py self-test",
    "python3 tools/conformance.py serve --host 127.0.0.1 --port 8765",
    "python3 tools/conformance.py probe --base-url http://127.0.0.1:8765",
}


def _default_root() -> Path:
    candidate = Path(__file__).resolve().parents[1]
    if (candidate / "bundle.json").is_file():
        return candidate
    return Path(__file__).resolve().parents[2] / "contracts/frontend/v1.1.0-alpha.2"


def _load(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise TypeError(f"{path}: expected an object")
    return value


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _resolve(schema: dict[str, Any], definitions: dict[str, Any]) -> dict[str, Any]:
    reference = schema.get("$ref")
    if isinstance(reference, str) and reference.startswith("#/$defs/"):
        return definitions[reference.rsplit("/", 1)[-1]]
    return schema


def _validate_value(
    value: Any, schema: dict[str, Any], definitions: dict[str, Any], path: str
) -> list[str]:
    schema = _resolve(schema, definitions)
    if "oneOf" in schema:
        matches = [
            not _validate_value(value, item, definitions, path)
            for item in schema["oneOf"]
        ]
        return [] if sum(matches) == 1 else [f"{path}: expected exactly one variant"]
    if "anyOf" in schema:
        if any(
            not _validate_value(value, item, definitions, path)
            for item in schema["anyOf"]
        ):
            return []
        return [f"{path}: no allowed variant matched"]
    if "const" in schema and value != schema["const"]:
        return [f"{path}: constant differs"]
    if "enum" in schema and value not in schema["enum"]:
        return [f"{path}: enum value is not allowed"]
    kind = schema.get("type")
    if kind == "object":
        if not isinstance(value, dict):
            return [f"{path}: expected object"]
        errors = [
            f"{path}: missing {name}"
            for name in schema.get("required", [])
            if name not in value
        ]
        properties = schema.get("properties", {})
        if schema.get("additionalProperties") is False:
            errors.extend(
                f"{path}: unexpected {name}" for name in value if name not in properties
            )
        for name, item in value.items():
            if name in properties:
                errors.extend(
                    _validate_value(
                        item, properties[name], definitions, f"{path}.{name}"
                    )
                )
        return errors
    if kind == "array":
        if not isinstance(value, list):
            return [f"{path}: expected array"]
        errors: list[str] = []
        if len(value) < schema.get("minItems", 0):
            errors.append(f"{path}: too few items")
        if "maxItems" in schema and len(value) > schema["maxItems"]:
            errors.append(f"{path}: too many items")
        if schema.get("uniqueItems") and len(
            {json.dumps(v, sort_keys=True) for v in value}
        ) != len(value):
            errors.append(f"{path}: duplicate items")
        for index, item in enumerate(value):
            errors.extend(
                _validate_value(
                    item, schema.get("items", {}), definitions, f"{path}[{index}]"
                )
            )
        return errors
    if kind == "string":
        if not isinstance(value, str):
            return [f"{path}: expected string"]
        errors = []
        if len(value) < schema.get("minLength", 0):
            errors.append(f"{path}: string too short")
        if "maxLength" in schema and len(value) > schema["maxLength"]:
            errors.append(f"{path}: string too long")
        if "pattern" in schema and re.fullmatch(schema["pattern"], value) is None:
            errors.append(f"{path}: pattern mismatch")
        return errors
    if kind == "integer" and (not isinstance(value, int) or isinstance(value, bool)):
        return [f"{path}: expected integer"]
    if kind == "boolean" and not isinstance(value, bool):
        return [f"{path}: expected boolean"]
    if kind == "null" and value is not None:
        return [f"{path}: expected null"]
    if kind == "integer" and "minimum" in schema and value < schema["minimum"]:
        return [f"{path}: below minimum"]
    return []


def _closed_objects(schema: Any, path: str = "$defs") -> list[str]:
    errors: list[str] = []
    if isinstance(schema, dict):
        if (
            schema.get("type") == "object"
            and schema.get("additionalProperties") is not False
        ):
            errors.append(f"{path}: object is not closed")
        for key, value in schema.items():
            errors.extend(_closed_objects(value, f"{path}.{key}"))
    elif isinstance(schema, list):
        for index, value in enumerate(schema):
            errors.extend(_closed_objects(value, f"{path}[{index}]"))
    return errors


def _references(value: Any, path: str = "$") -> list[tuple[str, str]]:
    references: list[tuple[str, str]] = []
    if isinstance(value, dict):
        for key, item in value.items():
            child = f"{path}.{key}"
            if key == "$ref" and isinstance(item, str):
                references.append((child, item))
            else:
                references.extend(_references(item, child))
    elif isinstance(value, list):
        for index, item in enumerate(value):
            references.extend(_references(item, f"{path}[{index}]"))
    return references


def _local_reference_exists(document: dict[str, Any], reference: str) -> bool:
    if not reference.startswith("#/"):
        return False
    current: Any = document
    for raw_part in reference[2:].split("/"):
        part = raw_part.replace("~1", "/").replace("~0", "~")
        if not isinstance(current, dict) or part not in current:
            return False
        current = current[part]
    return True


def _validate_local_references(
    document: dict[str, Any], document_name: str
) -> list[str]:
    return [
        f"{document_name} reference is unresolved or external: {path} -> {reference}"
        for path, reference in _references(document)
        if not _local_reference_exists(document, reference)
    ]


def _validate_bundle_manifest(bundle: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if set(bundle) != {
        "schema_version",
        "package_id",
        "contract_version",
        "generator",
        "source",
        "contract_implemented",
        "connected_alpha_verified",
        "readiness_states",
        "package_content_sha256",
        "artifacts",
    }:
        errors.append("bundle schema fields differ")
    if bundle.get("schema_version") != "2.0":
        errors.append("bundle schema version differs")
    if bundle.get("package_id") != f"{VERSION}-frontend-handoff":
        errors.append("bundle package ID differs")
    if bundle.get("generator") != {
        "path": "scripts/contracts/build_investor_alpha_handoff.py",
        "version": "2",
    }:
        errors.append("bundle generator identity differs")
    source = bundle.get("source")
    if not isinstance(source, dict) or set(source) != {
        "path",
        "sha256",
        "revision",
        "revision_kind",
    }:
        errors.append("bundle source identity is malformed")
    else:
        if source.get("path") != (
            "contracts/frontend/investor-api-v1.1.0-alpha.2.json"
        ):
            errors.append("bundle source path differs")
        if source.get("revision_kind") != "contract_content_sha256":
            errors.append("bundle source revision kind differs")
        digest = source.get("sha256")
        if (
            not isinstance(digest, str)
            or re.fullmatch(r"[0-9a-f]{64}", digest) is None
            or source.get("revision") != digest
        ):
            errors.append("bundle immutable source revision is malformed")
    digest = bundle.get("package_content_sha256")
    if not isinstance(digest, str) or re.fullmatch(r"[0-9a-f]{64}", digest) is None:
        errors.append("bundle package content digest is malformed")
    return errors


def _validate_fixture_safety(
    bundle_root: Path, examples: dict[str, Any]
) -> list[str]:
    errors: list[str] = []
    private_markers = (
        "-----BEGIN " + "PRIVATE KEY-----",
        "-----BEGIN " + "RSA PRIVATE KEY-----",
        "-----BEGIN " + "EC PRIVATE KEY-----",
    )
    jwt = re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b")
    email = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
    for path in sorted(bundle_root.rglob("*")):
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        if any(marker in text for marker in private_markers):
            errors.append(f"private key material is present: {path.name}")
        if jwt.search(text):
            errors.append(f"JWT-like credential is present: {path.name}")
        for address in email.findall(text):
            if address not in {
                "refinity-dev-investor-bff-sa@refinity-dev.iam.gserviceaccount.com"
            } and not address.lower().endswith("@example.invalid"):
                errors.append(f"non-synthetic email is present: {path.name}")

    forbidden_pii_keys = {
        "address",
        "date_of_birth",
        "dob",
        "first_name",
        "last_name",
        "phone",
        "sin",
        "social_security_number",
        "ssn",
        "tax_id",
    }

    def inspect(value: Any, path: str) -> None:
        if isinstance(value, dict):
            for key, item in value.items():
                child = f"{path}.{key}"
                if key.lower() in forbidden_pii_keys:
                    errors.append(f"raw PII fixture field is present: {child}")
                if key in {"api_key", "api_secret"} and item != "fixture-only":
                    errors.append(f"broker credential fixture is not synthetic: {child}")
                inspect(item, child)
        elif isinstance(value, list):
            for index, item in enumerate(value):
                inspect(item, f"{path}[{index}]")

    inspect(examples, "examples")
    return errors


def _validate_capability_register(
    capabilities: dict[str, Any],
    connection: dict[str, Any],
    contract: dict[str, Any],
    definitions: dict[str, Any],
) -> list[str]:
    errors: list[str] = []
    expected_capability_fields = {
        "capability_id",
        "status",
        "owner",
        "availability_scope",
        "later_gates",
        "depends_on_bindings",
        "frontend_development_required",
        "claim",
    }
    expected_binding_fields = {
        "binding_id",
        "kind",
        "value",
        "value_type",
        "owner",
        "status",
        "delivery",
        "later_gates",
        "required_for",
        "sensitive",
        "include_in_connection_addendum",
        "blocks_frontend_development",
        "value_state",
        "current_state",
        "required_action",
        "acceptance_condition",
    }
    expected_top_level = {
        "schema_version",
        "contract_version",
        "readiness_states",
        "contract_implemented",
        "connected_alpha_verified",
        "frontend_development",
        "routes",
        "schemas",
        "connected_capabilities",
        "binding_register",
        "explicitly_deferred",
    }
    if set(capabilities) != expected_top_level:
        errors.append("capability register top-level fields differ")
    if capabilities.get("schema_version") != "2.1":
        errors.append("capability register schema version differs")
    if capabilities.get("contract_version") != VERSION:
        errors.append("capability register contract version differs")
    if capabilities.get("contract_implemented") is not True:
        errors.append("capabilities do not mark the boundary implemented")
    if capabilities.get("connected_alpha_verified") is not False:
        errors.append("capabilities falsely claim connected verification")
    expected_readiness = {
        "frontend_contract_ready": True,
        "backend_services_provisioned": True,
        "backend_connected_release_ready": False,
        "external_trust_bound": False,
        "connected_alpaca_verified": False,
        "connected_alpha_verified": False,
    }
    if capabilities.get("readiness_states") != expected_readiness:
        errors.append("independent readiness states differ")
    if capabilities.get("explicitly_deferred") != [
        "snaptrade",
        "amr_enforcement",
        "reusable_kyc_provider",
        "blockchain_audit_anchor",
        "staging_environment",
        "production_environment",
    ]:
        errors.append("explicitly deferred capability inventory differs")

    expected_routes = [
        {
            "method": item["method"],
            "path": item["path"],
            "operation_id": item["operation_id"],
            "status": "implemented",
            "runtime_owner": item["runtime_owner"],
        }
        for item in contract["routes"]
    ]
    if capabilities.get("routes") != expected_routes:
        errors.append("capability route implementation inventory differs")
    expected_schemas = [
        {"name": name, "status": "implemented"} for name in sorted(definitions)
    ]
    if capabilities.get("schemas") != expected_schemas:
        errors.append("capability schema implementation inventory differs")

    capability_items = capabilities.get("connected_capabilities")
    if not isinstance(capability_items, list) or not capability_items:
        errors.append("connected capabilities must be a non-empty array")
        capability_items = []
    capability_ids: set[str] = set()
    allowed_statuses = {"available", "pending_backend", "pending_external"}
    allowed_scopes = {"package", "source_and_local_runtime", "connected_dev"}
    atd = re.compile(r"^ATD-[0-9]{3}[A-Z]?$")
    for index, item in enumerate(capability_items):
        where = f"connected_capabilities[{index}]"
        if not isinstance(item, dict):
            errors.append(f"{where}: must be an object")
            continue
        if set(item) != expected_capability_fields:
            errors.append(f"{where}: fields differ")
        capability_id = item.get("capability_id")
        if not isinstance(capability_id, str) or not capability_id:
            errors.append(f"{where}: capability_id is required")
        elif capability_id in capability_ids:
            errors.append(f"{where}: duplicate capability_id")
        else:
            capability_ids.add(capability_id)
        status = item.get("status")
        gates = item.get("later_gates")
        if status not in allowed_statuses:
            errors.append(f"{where}: status is invalid")
        if item.get("availability_scope") not in allowed_scopes:
            errors.append(f"{where}: availability scope is invalid")
        if not isinstance(gates, list) or any(
            not isinstance(gate, str) or atd.fullmatch(gate) is None
            for gate in gates or []
        ):
            errors.append(f"{where}: later_gates are invalid")
        elif status == "available" and gates:
            errors.append(f"{where}: available capability has a later gate")
        elif status != "available" and not gates:
            errors.append(f"{where}: pending capability lacks a later gate")
        if item.get("frontend_development_required") is True and status != "available":
            errors.append(f"{where}: frontend development depends on pending work")
        if not isinstance(item.get("owner"), str) or not item.get("owner"):
            errors.append(f"{where}: owner is required")
        if not isinstance(item.get("claim"), str) or not item.get("claim"):
            errors.append(f"{where}: bounded claim is required")
        dependencies = item.get("depends_on_bindings")
        if not isinstance(dependencies, list) or any(
            not isinstance(binding_id, str) for binding_id in dependencies or []
        ):
            errors.append(f"{where}: depends_on_bindings must be an array")

    binding_items = capabilities.get("binding_register")
    if not isinstance(binding_items, list) or not binding_items:
        errors.append("binding register must be a non-empty array")
        binding_items = []
    binding_ids: set[str] = set()
    for index, item in enumerate(binding_items):
        where = f"binding_register[{index}]"
        if not isinstance(item, dict):
            errors.append(f"{where}: must be an object")
            continue
        allowed_fields = expected_binding_fields | {"required_fields"}
        if not expected_binding_fields <= set(item) or not set(item) <= allowed_fields:
            errors.append(f"{where}: fields differ")
        binding_id = item.get("binding_id")
        if not isinstance(binding_id, str) or not binding_id:
            errors.append(f"{where}: binding_id is required")
        elif binding_id in binding_ids:
            errors.append(f"{where}: duplicate binding_id")
        else:
            binding_ids.add(binding_id)
        if item.get("kind") not in {
            "external_input",
            "backend_output",
            "joint_binding",
        }:
            errors.append(f"{where}: kind is invalid")
        if item.get("status") not in {"pending_backend", "pending_external"}:
            errors.append(f"{where}: pending status is invalid")
        value_state = item.get("value_state")
        if value_state not in {
            "not_supplied",
            "selected_not_operational",
            "provisioned_not_enabled",
        }:
            errors.append(f"{where}: value state is invalid")
        elif value_state == "not_supplied" and item.get("value") is not None:
            errors.append(f"{where}: unsupplied binding has a value")
        elif value_state != "not_supplied" and item.get("value") is None:
            errors.append(f"{where}: known binding lacks its selected value")
        if item.get("blocks_frontend_development") is not False:
            errors.append(f"{where}: incorrectly blocks frontend development")
        if not isinstance(item.get("later_gates"), list) or not item["later_gates"]:
            errors.append(f"{where}: later_gates are required")
        elif any(atd.fullmatch(str(gate)) is None for gate in item["later_gates"]):
            errors.append(f"{where}: later_gates are invalid")
        required_for = item.get("required_for")
        if (
            not isinstance(required_for, list)
            or not required_for
            or any(not isinstance(value, str) for value in required_for)
        ):
            errors.append(f"{where}: required_for is required")
        if not isinstance(item.get("value_type"), str) or not item.get("value_type"):
            errors.append(f"{where}: value_type is required")
        if not isinstance(item.get("owner"), str) or not item.get("owner"):
            errors.append(f"{where}: owner is required")
        if not isinstance(item.get("delivery"), str) or not item.get("delivery"):
            errors.append(f"{where}: delivery is required")
        for field in ("current_state", "required_action", "acceptance_condition"):
            if not isinstance(item.get(field), str) or not item.get(field):
                errors.append(f"{where}: {field} is required")
        if not isinstance(item.get("sensitive"), bool) or not isinstance(
            item.get("include_in_connection_addendum"), bool
        ):
            errors.append(f"{where}: delivery flags must be boolean")
        if item.get("sensitive") is True and (
            item.get("include_in_connection_addendum") is not False
            or item.get("delivery") != "protected_local_bootstrap"
        ):
            errors.append(f"{where}: sensitive value has an unsafe delivery policy")
        required_fields = item.get("required_fields")
        if required_fields is not None and (
            not isinstance(required_fields, list)
            or not required_fields
            or len(set(required_fields)) != len(required_fields)
        ):
            errors.append(f"{where}: required_fields are invalid")

    for index, item in enumerate(capability_items):
        if not isinstance(item, dict):
            continue
        dependencies = item.get("depends_on_bindings")
        if not isinstance(dependencies, list) or any(
            not isinstance(binding_id, str) for binding_id in dependencies
        ):
            continue
        unknown = set(dependencies) - binding_ids
        if unknown:
            errors.append(
                f"connected_capabilities[{index}]: unknown binding dependencies"
            )
    for index, item in enumerate(binding_items):
        if not isinstance(item, dict):
            continue
        required_for = item.get("required_for")
        if not isinstance(required_for, list) or any(
            not isinstance(capability_id, str) for capability_id in required_for
        ):
            continue
        unknown = set(required_for) - capability_ids
        if unknown:
            errors.append(f"binding_register[{index}]: unknown capabilities")

    frontend = capabilities.get("frontend_development")
    required_capabilities = {
        item["capability_id"]
        for item in capability_items
        if isinstance(item, dict)
        and isinstance(item.get("capability_id"), str)
        and item.get("frontend_development_required") is True
    }
    if not isinstance(frontend, dict) or set(frontend) != {
        "ready",
        "required_capability_ids",
        "required_binding_ids",
        "must_not_wait_for_binding_ids",
    }:
        errors.append("frontend development declaration is malformed")
    else:
        required_ids = frontend.get("required_capability_ids")
        must_not_wait = frontend.get("must_not_wait_for_binding_ids")
        if (
            frontend.get("ready") is not True
            or not isinstance(required_ids, list)
            or any(not isinstance(value, str) for value in required_ids or [])
            or set(required_ids or []) != required_capabilities
            or frontend.get("required_binding_ids") != []
            or not isinstance(must_not_wait, list)
            or any(not isinstance(value, str) for value in must_not_wait or [])
            or set(must_not_wait or []) != binding_ids
        ):
            errors.append("frontend development is incorrectly blocked or incomplete")

    if set(connection) != {
        "schema_version",
        "contract_version",
        "environment",
        "binding_status",
        "logical_values",
        "issuance_observations",
        "connection_bindings",
        "frontend_required_actions",
        "backend_pending_deliverables",
        "backend_owner_inputs_not_requested_from_frontend",
        "frontend_development_blockers",
        "rules",
    }:
        errors.append("connection template fields differ")
    if connection.get("schema_version") != "2.1":
        errors.append("connection template schema version differs")
    if connection.get("contract_version") != VERSION:
        errors.append("connection template contract version differs")
    if connection.get("environment") != "refinity-dev":
        errors.append("connection template environment differs")
    if connection.get("binding_status") != "pending_external_and_backend":
        errors.append("connection template binding status differs")
    if connection.get("logical_values") != {
        "project_id": "refinity-dev",
        "project_number": "182665799543",
        "region": "us-west1",
        "identity_result_issuer": "urn:refinity:identity-ccid:dev",
        "identity_result_audience": "urn:refinity:frontend-bff:dev",
        "bff_assertion_issuer": "urn:refinity:bff:dev",
        "bff_assertion_audience": "urn:refinity:investor-api:dev",
        "identity_ccid_google_oidc_audience": "https://identity-ccid.dev.refi.internal",
        "investor_api_google_oidc_audience": "https://investor-api.dev.refi.internal",
        "frontend_bff_base_url": "https://bff-dev.refi.trading",
        "backend_identity_jwks_path": "/.well-known/jwks.json",
        "wif_pool_id": "refinity-dev-frontend-system",
        "wif_pool_resource_name": "projects/182665799543/locations/global/workloadIdentityPools/refinity-dev-frontend-system",
        "planned_wif_provider_id": "frontend-system-oidc",
        "bff_service_account": "refinity-dev-investor-bff-sa@refinity-dev.iam.gserviceaccount.com",
    }:
        errors.append("connection template logical values differ")
    if connection.get("issuance_observations") != {
        "observed_at": "2026-09-03",
        "frontend_bff_base_http_status": 200,
        "frontend_bff_jwks_http_status": 503,
        "wif_pool_state": "ACTIVE",
        "wif_provider_count": 0,
        "identity_ccid_cloud_run_ready": True,
        "identity_ccid_feature_state": "disabled",
        "identity_ccid_public_jwks_http_status": 403,
        "investor_api_cloud_run_ready": True,
        "investor_api_feature_state": "disabled",
    }:
        errors.append("connection issuance observations differ")
    if connection.get("frontend_development_blockers") != []:
        errors.append("connection template blocks deterministic frontend work")
    connection_bindings = connection.get("connection_bindings")
    if not isinstance(connection_bindings, dict) or set(connection_bindings) != binding_ids:
        errors.append("connection bindings differ from binding register")
    else:
        for item in binding_items:
            if not isinstance(item, dict) or not isinstance(
                item.get("binding_id"), str
            ):
                continue
            binding_id = item["binding_id"]
            expected = {key: value for key, value in item.items() if key != "binding_id"}
            if connection_bindings[binding_id] != expected:
                errors.append(f"connection binding differs: {binding_id}")
    expected_frontend_actions = {
        item["binding_id"]
        for item in binding_items
        if isinstance(item, dict)
        and "frontend-system" in str(item.get("owner"))
        and item.get("status") == "pending_external"
    }
    if set(connection.get("frontend_required_actions") or []) != expected_frontend_actions:
        errors.append("frontend required actions differ from binding ownership")
    expected_backend_deliverables = {
        item["binding_id"]
        for item in binding_items
        if isinstance(item, dict) and item.get("kind") == "backend_output"
    }
    if set(connection.get("backend_pending_deliverables") or []) != expected_backend_deliverables:
        errors.append("backend pending deliverables differ from binding ownership")
    expected_backend_inputs = {
        item["binding_id"]
        for item in binding_items
        if isinstance(item, dict) and item.get("owner") == "backend-owner"
    }
    if set(connection.get("backend_owner_inputs_not_requested_from_frontend") or []) != expected_backend_inputs:
        errors.append("backend-owner input list differs from binding ownership")
    rules = connection.get("rules")
    if not isinstance(rules, list) or len(rules) != 4 or any(
        not isinstance(rule, str) or not rule for rule in rules
    ):
        errors.append("connection interpretation rules differ")
    return errors


def validate_bundle(root: Path | None = None) -> list[str]:
    bundle_root = root or _default_root()
    errors: list[str] = []
    try:
        bundle = _load(bundle_root / "bundle.json")
        contract = _load(bundle_root / "contract.json")
        openapi = _load(bundle_root / "openapi.json")
        schemas = _load(bundle_root / "schemas.json")
        examples = _load(bundle_root / "examples.json")
        capabilities = _load(bundle_root / "capabilities.json")
        connection = _load(bundle_root / "connection.dev.json")
        readme = (bundle_root / "README.md").read_text(encoding="utf-8")
    except (OSError, TypeError, ValueError, json.JSONDecodeError) as exc:
        return [str(exc)]
    actual_files = {
        str(path.relative_to(bundle_root))
        for path in bundle_root.rglob("*")
        if path.is_file()
    }
    if actual_files != EXPECTED_FILES:
        errors.append("package file inventory differs")
    errors.extend(_validate_bundle_manifest(bundle))
    errors.extend(_validate_local_references(openapi, "openapi.json"))
    errors.extend(_validate_local_references(schemas, "schemas.json"))
    errors.extend(_validate_fixture_safety(bundle_root, examples))
    for section in sorted(REQUIRED_README_SECTIONS):
        if section not in readme:
            errors.append(f"README section is absent: {section}")
    for command in sorted(REQUIRED_STANDALONE_COMMANDS):
        if command not in readme:
            errors.append(f"README standalone command is absent: {command}")
    if "scripts/contracts/" in readme or "repository root" in readme.lower():
        errors.append("README verification depends on repository-only paths")
    for token in (
        "connected_alpha_verified=false",
        "identity_ccid_base_url",
        "investor_api_base_url",
        "wif_provider_name",
        "wif_allowed_audiences",
        "wif_allowed_subjects",
        "support.integration_contact",
        "support.security_contact",
        "support.trading_operations_contact",
        "support.escalation_channel",
    ):
        if token not in readme:
            errors.append(f"README handoff requirement is absent: {token}")
    if bundle.get("contract_version") != VERSION:
        errors.append("bundle version differs")
    if contract.get("contract_version") != VERSION:
        errors.append("contract version differs")
    if examples.get("contract_version") != VERSION:
        errors.append("examples version differs")
    if openapi.get("info", {}).get("version") != VERSION:
        errors.append("OpenAPI version differs")
    if schemas.get("$id") != (
        f"https://contracts.refi.trading/investor/{VERSION}/schemas.json"
    ):
        errors.append("schema identifier version differs")
    if not readme.startswith(f"# ReFinity frontend integration package {VERSION}\n"):
        errors.append("README version differs")
    if bundle.get("connected_alpha_verified") is not False:
        errors.append("bundle falsely claims connected Alpha verification")
    expected_readiness = {
        "frontend_contract_ready": True,
        "backend_services_provisioned": True,
        "backend_connected_release_ready": False,
        "external_trust_bound": False,
        "connected_alpaca_verified": False,
        "connected_alpha_verified": False,
    }
    if bundle.get("readiness_states") != expected_readiness:
        errors.append("bundle independent readiness states differ")
    artifact_records = bundle.get("artifacts")
    if not isinstance(artifact_records, list) or any(
        not isinstance(item, dict) or set(item) != {"path", "sha256"}
        for item in artifact_records
    ):
        errors.append("bundle artifact inventory is malformed")
        artifact_records = []
    artifacts = {item["path"]: item["sha256"] for item in artifact_records}
    if len(artifacts) != len(artifact_records):
        errors.append("bundle artifact inventory contains duplicate paths")
    if set(artifacts) != EXPECTED_FILES - {"bundle.json"}:
        errors.append("bundle artifact inventory differs from package files")
    for name, expected in artifacts.items():
        path = bundle_root / name
        if (
            not isinstance(expected, str)
            or re.fullmatch(r"[0-9a-f]{64}", expected) is None
            or not path.is_file()
            or _sha256(path) != expected
        ):
            errors.append(f"artifact hash differs: {name}")
    content_digest = hashlib.sha256(
        json.dumps(artifact_records, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    if bundle.get("package_content_sha256") != content_digest:
        errors.append("package content digest differs")
    expected_routes = {
        (item["method"].lower(), item["path"]): item for item in contract["routes"]
    }
    actual_routes = {
        (method, path): operation
        for path, path_item in openapi.get("paths", {}).items()
        for method, operation in path_item.items()
        if method in {"get", "post", "patch", "delete"}
    }
    if set(actual_routes) != set(expected_routes):
        errors.append("OpenAPI routes differ from contract.json")
    expected_global_servers = [
        {
            "url": "http://127.0.0.1:8765",
            "description": "Deterministic local contract simulator",
        },
        {
            "url": "https://investor-api.refinity-dev.invalid",
            "description": "Typed Dev placeholder; use connection.dev.json for binding status",
        },
    ]
    if openapi.get("servers") != expected_global_servers:
        errors.append("OpenAPI global Investor API servers differ")
    serialized_openapi = json.dumps(openapi, sort_keys=True)
    if "#/$defs/" in serialized_openapi:
        errors.append("OpenAPI contains JSON Schema-local references")
    for reference in re.findall(r'"\$ref": "#/components/schemas/([^\"]+)"', serialized_openapi):
        if reference not in openapi.get("components", {}).get("schemas", {}):
            errors.append(f"OpenAPI schema reference is unresolved: {reference}")
    for key in set(actual_routes) & set(expected_routes):
        operation, source = actual_routes[key], expected_routes[key]
        if operation.get("operationId") != source["operation_id"]:
            errors.append(f"operation ID differs: {key}")
        if operation.get("x-implementation-status") != "implemented":
            errors.append(f"route not marked implemented: {key}")
        expected_operation_servers = (
            [
                {
                    "url": "http://127.0.0.1:8765",
                    "description": "Deterministic local contract simulator",
                },
                {
                    "url": "https://identity-ccid.refinity-dev.invalid",
                    "description": "Typed identity-ccid Dev placeholder; use connection.dev.json for binding status",
                },
            ]
            if source["runtime_owner"] == "identity-ccid"
            else None
        )
        if operation.get("servers") != expected_operation_servers:
            errors.append(f"operation-level runtime servers differ: {key}")
        if source["request_schema"]:
            request_content = (
                operation.get("requestBody", {})
                .get("content", {})
                .get("application/json", {})
            )
            reference = request_content.get("schema", {}).get("$ref")
            if reference != f"#/components/schemas/{source['request_schema']}":
                errors.append(f"request schema differs: {key}")
            if request_content.get("example") != examples["requests"].get(
                source["request_schema"]
            ):
                errors.append(f"request example differs: {key}")
        success = operation.get("responses", {}).get(str(source["success_status"]), {})
        content_type = (
            "text/event-stream" if key[1].endswith("/events") else "application/json"
        )
        if content_type not in success.get("content", {}):
            errors.append(f"success response differs: {key}")
        expected_cache = (
            "#/components/headers/PublicJwksCache"
            if key[1] == "/.well-known/jwks.json"
            else "#/components/headers/PrivateNoStore"
        )
        if (
            success.get("headers", {}).get("Cache-Control", {}).get("$ref")
            != expected_cache
        ):
            errors.append(f"success cache policy differs: {key}")
        parameters = {
            (item.get("in"), item.get("name")): item
            for item in operation.get("parameters", [])
        }
        if source["runtime_owner"] == "investor-api":
            if operation.get("security") != [
                {"googleOidc": [], "userAssertion": []}
            ]:
                errors.append(f"dual authentication differs: {key}")
        elif key[1] == "/.well-known/jwks.json":
            if operation.get("security") != []:
                errors.append("JWKS endpoint must be public")
        elif operation.get("security") != [{"googleOidc": []}]:
            errors.append(f"BFF authentication differs: {key}")
        mutating = key[0] in {"post", "patch", "delete"}
        idempotency = parameters.get(("header", "Idempotency-Key"))
        if source["runtime_owner"] == "investor-api" and mutating:
            if not idempotency or idempotency.get("required") is not True:
                errors.append(f"idempotency header differs: {key}")
        elif idempotency:
            errors.append(f"unexpected idempotency header: {key}")
        if (
            key[0] == "patch"
            and parameters.get(("header", "If-Match"), {}).get("required")
            is not True
        ):
            errors.append(f"If-Match header differs: {key}")
        if key[1].endswith("/events") and (
            "header",
            "Last-Event-ID",
        ) not in parameters:
            errors.append("SSE resume header is absent")
        expected_error_statuses = {
            str(value)
            for value in contract["error_profiles"][source["error_profile"]][
                "statuses"
            ]
            if str(value) in {"400", "401", "404", "409", "422", "429", "503"}
        }
        actual_error_statuses = set(operation.get("responses", {})) - {
            str(source["success_status"])
        }
        if actual_error_statuses != expected_error_statuses:
            errors.append(f"error statuses differ: {key}")
    definitions = schemas.get("$defs", {})
    for route in contract.get("routes", []):
        for key in ("request_schema", "response_schema"):
            schema_name = route.get(key)
            if schema_name and schema_name not in definitions:
                errors.append(
                    f"contract route schema is unresolved: {route.get('operation_id')} {key}"
                )
    errors.extend(_closed_objects(definitions))
    credentials = definitions.get("BrokerageCredentials", {}).get("properties", {})
    for name in ("api_key", "api_secret"):
        if credentials.get(name, {}).get("writeOnly") is not True:
            errors.append(f"{name} is not write-only")
    if "acr" in definitions.get("BffAssertionClaims", {}).get("properties", {}):
        errors.append("BFF claims incorrectly permit acr")
    for item in contract["routes"]:
        request_name = item["request_schema"]
        if request_name:
            errors.extend(
                _validate_value(
                    examples["requests"][request_name],
                    definitions[request_name],
                    definitions,
                    f"requests.{request_name}",
                )
            )
        response_name = item["response_schema"]
        if response_name == "AccountEventStream":
            continue
        response_example = examples["responses"].get(response_name)
        if response_example is None and response_name.endswith("PageEnvelope"):
            response_example = actual_routes[(item["method"].lower(), item["path"])][
                "responses"
            ][str(item["success_status"])]["content"]["application/json"]["example"]
        errors.extend(
            _validate_value(
                response_example,
                definitions[response_name],
                definitions,
                f"responses.{response_name}",
            )
        )
    errors.extend(
        _validate_value(
            examples["responses"]["AccountEvent"],
            definitions["AccountEvent"],
            definitions,
            "responses.AccountEvent",
        )
    )
    for name, error_example in examples.get("errors", {}).items():
        errors.extend(
            _validate_value(
                error_example,
                definitions["ErrorEnvelope"],
                definitions,
                f"errors.{name}",
            )
        )
    errors.extend(
        _validate_capability_register(
            capabilities,
            connection,
            contract,
            definitions,
        )
    )
    return errors


def _error(code: str, message: str = "request could not be completed") -> bytes:
    return json.dumps(
        {"error": {"code": code, "message": message, "correlation_id": CORRELATION}},
        separators=(",", ":"),
    ).encode()


class SimulatorHandler(BaseHTTPRequestHandler):
    root = _default_root()
    idempotency: ClassVar[dict[str, tuple[str, bytes]]] = {}
    idempotency_lock: ClassVar[threading.Lock] = threading.Lock()

    def log_message(self, _format: str, *_args: Any) -> None:
        return

    def _reply(
        self, status: int, body: bytes, content_type: str = "application/json"
    ) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "private, no-store")
        self.send_header("X-Correlation-Id", CORRELATION)
        self.end_headers()
        self.wfile.write(body)

    def _route(self) -> tuple[dict[str, Any], dict[str, str]] | None:
        contract = _load(self.root / "contract.json")
        path = self.path.split("?", 1)[0]
        for route in contract["routes"]:
            if route["method"] != self.command:
                continue
            names = re.findall(r"\{([^}]+)\}", route["path"])
            pattern = "^" + re.sub(r"\{[^}]+\}", r"([^/]+)", route["path"]) + "$"
            match = re.fullmatch(pattern, path)
            if match:
                return route, dict(zip(names, match.groups(), strict=True))
        return None

    def _handle(self) -> None:
        matched = self._route()
        if matched is None:
            self._reply(404, _error("RESOURCE_NOT_FOUND", "resource not found"))
            return
        route, parameters = matched
        public_jwks = route["path"] == "/.well-known/jwks.json"
        if not public_jwks and self.headers.get("Authorization") != AUTHORIZATION:
            self._reply(401, _error("AUTHENTICATION_FAILED", "authentication failed"))
            return
        if (
            route["runtime_owner"] == "investor-api"
            and self.headers.get("X-Refinity-User-Assertion") != USER_ASSERTION
        ):
            self._reply(401, _error("AUTHENTICATION_FAILED", "authentication failed"))
            return
        examples = _load(self.root / "examples.json")
        if parameters.get("account_id") == examples["ids"]["foreign_account"]:
            self._reply(404, _error("RESOURCE_NOT_FOUND", "resource not found"))
            return
        length = int(self.headers.get("Content-Length", "0"))
        request_body = self.rfile.read(length) if length else b""
        if route["request_schema"]:
            try:
                parsed_body = json.loads(request_body) if request_body else None
            except json.JSONDecodeError:
                self._reply(422, _error("VALIDATION_ERROR", "request is invalid"))
                return
            definitions = _load(self.root / "schemas.json")["$defs"]
            if _validate_value(
                parsed_body,
                definitions[route["request_schema"]],
                definitions,
                "request",
            ):
                self._reply(422, _error("VALIDATION_ERROR", "request is invalid"))
                return
        if route["runtime_owner"] == "investor-api" and self.command in {
            "POST",
            "PATCH",
            "DELETE",
        }:
            key = self.headers.get("Idempotency-Key")
            if not key:
                self._reply(
                    422, _error("VALIDATION_ERROR", "Idempotency-Key is required")
                )
                return
            if self.command == "PATCH" and not self.headers.get("If-Match"):
                self._reply(422, _error("VALIDATION_ERROR", "If-Match is required"))
                return
            fingerprint = hashlib.sha256(request_body).hexdigest()
            with self.idempotency_lock:
                previous = self.idempotency.get(key)
            if previous and previous[0] != fingerprint:
                self._reply(409, _error("IDEMPOTENCY_KEY_REUSED"))
                return
            if previous:
                self._reply(route["success_status"], previous[1])
                return
        operation = _load(self.root / "openapi.json")["paths"][route["path"]][
            self.command.lower()
        ]
        response = operation["responses"][str(route["success_status"])]
        if route["response_schema"] == "AccountEventStream":
            body = response["content"]["text/event-stream"]["example"].encode()
            if self.headers.get("Last-Event-ID"):
                first_line = body.splitlines()[0].decode()
                event_id = first_line.removeprefix("id: ")
                if self.headers["Last-Event-ID"] != event_id:
                    self._reply(422, _error("VALIDATION_ERROR", "event cursor is invalid"))
                    return
                body = b""
            self._reply(route["success_status"], body, "text/event-stream")
            return
        body = json.dumps(
            response["content"]["application/json"]["example"], separators=(",", ":")
        ).encode()
        if route["runtime_owner"] == "investor-api" and self.command in {
            "POST",
            "PATCH",
            "DELETE",
        }:
            with self.idempotency_lock:
                self.idempotency[self.headers["Idempotency-Key"]] = (
                    hashlib.sha256(request_body).hexdigest(),
                    body,
                )
        self._reply(route["success_status"], body)

    do_GET = _handle
    do_POST = _handle
    do_PATCH = _handle
    do_DELETE = _handle


def _request(
    base_url: str,
    method: str,
    path: str,
    body: dict[str, Any] | None = None,
    *,
    headers_override: dict[str, str] | None = None,
) -> tuple[int, bytes]:
    headers = {
        "Authorization": AUTHORIZATION,
        "X-Refinity-User-Assertion": USER_ASSERTION,
        "X-Correlation-Id": CORRELATION,
    }
    raw = None
    if body is not None:
        raw = json.dumps(body, separators=(",", ":")).encode()
        headers["Content-Type"] = "application/json"
        headers["Idempotency-Key"] = (
            f"fixture_{hashlib.sha256(path.encode()).hexdigest()[:24]}"
        )
    if headers_override:
        for name, value in headers_override.items():
            if value:
                headers[name] = value
            else:
                headers.pop(name, None)
    request = urllib.request.Request(
        base_url + path, data=raw, headers=headers, method=method
    )
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read()


def probe(
    base_url: str = "http://127.0.0.1:8765", root: Path | None = None
) -> list[str]:
    bundle_root = root or _default_root()
    examples = _load(bundle_root / "examples.json")
    account, requests = examples["ids"]["account"], examples["requests"]
    journey = (
        ("GET", "/api/v1/investor/onboarding/status", None, 200),
        ("GET", "/api/v1/investor/accounts", None, 200),
        (
            "POST",
            f"/api/v1/investor/accounts/{account}/brokerage-connections",
            requests["BrokerageConnectionRequest"],
            202,
        ),
        ("GET", f"/api/v1/investor/accounts/{account}/valuation", None, 200),
        (
            "POST",
            f"/api/v1/investor/accounts/{account}/allocation-previews",
            requests["AllocationPreviewRequest"],
            201,
        ),
        (
            "POST",
            f"/api/v1/investor/accounts/{account}/actions",
            requests["AccountActionRequest"],
            202,
        ),
        ("GET", f"/api/v1/investor/accounts/{account}/records", None, 200),
        ("GET", f"/api/v1/investor/accounts/{account}/events", None, 200),
    )
    errors = []
    for method, path, body, expected in journey:
        status, response = _request(base_url, method, path, body)
        if status != expected:
            errors.append(f"{method} {path}: expected {expected}, got {status}")
        if b"fixture-only" in response:
            errors.append(f"{method} {path}: credential echoed")
    foreign = examples["ids"]["foreign_account"]
    status, body = _request(base_url, "GET", f"/api/v1/investor/accounts/{foreign}")
    if status != 404 or foreign.encode() in body:
        errors.append("foreign-account response is not the uniform redacted 404")

    status, body = _request(
        base_url,
        "GET",
        f"/api/v1/investor/accounts/{account}",
        headers_override={"Authorization": ""},
    )
    if status != 401 or b"fixture-user-assertion" in body:
        errors.append("missing BFF authentication did not fail closed")
    status, body = _request(
        base_url,
        "GET",
        f"/api/v1/investor/accounts/{account}",
        headers_override={"X-Refinity-User-Assertion": ""},
    )
    if status != 401 or account.encode() in body:
        errors.append("missing user assertion did not fail closed")

    create_path = f"/api/v1/investor/accounts/{account}/brokerage-connections"
    create_body = requests["BrokerageConnectionRequest"]
    replay_headers = {"Idempotency-Key": "fixture_replay_key_0001"}
    first = _request(
        base_url,
        "POST",
        create_path,
        create_body,
        headers_override=replay_headers,
    )
    replay = _request(
        base_url,
        "POST",
        create_path,
        create_body,
        headers_override=replay_headers,
    )
    if first != replay or first[0] != 202:
        errors.append("identical idempotent replay was not stable")
    changed = json.loads(json.dumps(create_body))
    changed["account_environment"] = (
        "live" if changed["account_environment"] == "paper" else "paper"
    )
    status, body = _request(
        base_url,
        "POST",
        create_path,
        changed,
        headers_override=replay_headers,
    )
    if status != 409 or b"fixture-only" in body:
        errors.append("changed idempotent replay did not fail safely")

    invalid = json.loads(json.dumps(create_body))
    invalid["unexpected"] = "must-be-rejected"
    status, body = _request(base_url, "POST", create_path, invalid)
    if status != 422 or b"fixture-only" in body or b"unexpected" in body:
        errors.append("closed request validation did not redact input")

    event_path = f"/api/v1/investor/accounts/{account}/events"
    status, body = _request(base_url, "GET", event_path)
    if status == 200 and body:
        event_id = body.splitlines()[0].decode().removeprefix("id: ")
        resumed_status, resumed_body = _request(
            base_url,
            "GET",
            event_path,
            headers_override={"Last-Event-ID": event_id},
        )
        if resumed_status != 200 or resumed_body:
            errors.append("SSE resume duplicated the acknowledged event")
    return errors


def _serve(root: Path, host: str, port: int) -> None:
    SimulatorHandler.root = root
    server = ThreadingHTTPServer((host, port), SimulatorHandler)
    print(f"serving {VERSION} deterministic simulator at http://{host}:{port}")
    server.serve_forever()


def _self_test(root: Path) -> list[str]:
    errors = validate_bundle(root)
    if errors:
        return errors
    SimulatorHandler.root, SimulatorHandler.idempotency = root, {}
    server = ThreadingHTTPServer(("127.0.0.1", 0), SimulatorHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        errors.extend(probe(f"http://127.0.0.1:{server.server_port}", root))
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
    return errors


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("validate", "serve", "probe", "self-test"))
    parser.add_argument("--bundle-root", type=Path, default=_default_root())
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--base-url", default="http://127.0.0.1:8765")
    args = parser.parse_args(argv)
    if args.command == "serve":
        _serve(args.bundle_root, args.host, args.port)
        return 0
    errors = (
        validate_bundle(args.bundle_root)
        if args.command == "validate"
        else probe(args.base_url, args.bundle_root)
        if args.command == "probe"
        else _self_test(args.bundle_root)
    )
    if errors:
        for error in errors:
            print(error)
        return 1
    print(f"{VERSION} {args.command} passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
