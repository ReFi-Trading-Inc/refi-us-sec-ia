"""Bounded image-only Cloud Run promotion; no Terraform or broker operations."""
import json
import os
import re
import subprocess
import time
from datetime import datetime
from urllib.error import HTTPError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

PROJECT = "refinity-dev"
REGION = "us-west1"
SERVICE = "refi-frontend-integration"
JOB = "refi-frontend-runtime-check"
BUCKET = "refinity-dev-frontend-releases"
IMAGE = "us-west1-docker.pkg.dev/refinity-dev/refi-frontend/web"
ORIGIN = "https://refi-frontend-integration-182665799543.us-west1.run.app"


def gcloud(*args, parse=False):
    result = subprocess.run(
        ["gcloud", *args, "--project", PROJECT, "--quiet"],
        check=True, text=True, stdout=subprocess.PIPE,
    ).stdout.strip()
    return json.loads(result) if parse else result


def request(url, method="GET", data=None, authenticated=True):
    headers = {}
    if authenticated:
        # Captured only in memory. Never print tokens or API response bodies.
        headers["Authorization"] = "Bearer " + gcloud("auth", "print-access-token")
    if data is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(data).encode()
    with urlopen(Request(url, data=data, headers=headers, method=method), timeout=45) as response:
        body = response.read()
        return json.loads(body) if body else None


def object_url(name):
    return f"https://storage.googleapis.com/storage/v1/b/{BUCKET}/o/{quote(name, safe='')}"


def read_object(name):
    try:
        return request(object_url(name) + "?alt=media")
    except HTTPError as error:
        if error.code == 404:
            return None
        raise


def put_object(name, data, generation=None):
    params = {"uploadType": "media", "name": name}
    if generation is not None:
        params["ifGenerationMatch"] = generation
    return request(
        f"https://storage.googleapis.com/upload/storage/v1/b/{BUCKET}/o?{urlencode(params)}",
        "POST", data,
    )


def validate_source(branch, sha, build_id):
    if branch != "integration/refinity-dev":
        raise ValueError("Only integration/refinity-dev may deploy")
    if not re.fullmatch(r"[a-f0-9]{40}", sha):
        raise ValueError("A full Git source SHA is required")
    if not re.fullmatch(r"[a-f0-9-]{36}", build_id):
        raise ValueError("A Cloud Build ID is required")


def newer_than(candidate, previous):
    if not previous or candidate["build_id"] == previous["build_id"]:
        return True
    return datetime.fromisoformat(candidate["created_at"].replace("Z", "+00:00")) > datetime.fromisoformat(
        previous["created_at"].replace("Z", "+00:00")
    )


def traffic_revisions(service):
    result = {}
    for target in service["status"].get("traffic", []):
        if target.get("percent", 0):
            result[target["revisionName"]] = target["percent"]
    if sum(result.values()) != 100:
        raise ValueError("Cannot preserve current traffic: expected 100% resolved revisions")
    return result


def describe_service():
    return gcloud("run", "services", "describe", SERVICE, "--region", REGION, "--format=json", parse=True)


def set_traffic(revisions):
    gcloud("run", "services", "update-traffic", SERVICE, "--region", REGION,
           "--to-revisions", ",".join(f"{revision}={percent}" for revision, percent in revisions.items()))


def smoke(origin):
    # No authenticated session, onboarding, credentials, or trade submission.
    keys = []
    for path in ["/api/health", "/.well-known/jwks.json", "/.well-known/identity-bridge-jwks.json"]:
        body = request(origin + path, authenticated=False)
        if "jwks" in path:
            if not body.get("keys") or not all(key.get("kid") for key in body["keys"]):
                raise ValueError("Invalid public JWKS")
            keys.append(body["keys"])
    if keys[0] == keys[1]:
        raise ValueError("Investor and bridge signing keys must remain separate")
    for path, expected in [("/api/v1/investor/session", 401), ("/api/v1/investor/dashboard", 401), ("/api/demo/session", 404)]:
        try:
            request(origin + path, authenticated=False)
        except HTTPError as error:
            if error.code == expected:
                continue
            raise
        raise ValueError(f"Anonymous boundary unexpectedly succeeded: {path}")
    print("HTTP health, separate JWKS and anonymous refusal checks passed", flush=True)


def main():
    build_id, sha, branch = (os.environ[key] for key in ["CB_BUILD_ID", "CB_SOURCE_SHA", "CB_BRANCH"])
    validate_source(branch, sha, build_id)
    build = request(f"https://cloudbuild.googleapis.com/v1/projects/{PROJECT}/locations/{REGION}/builds/{build_id}")
    if build["substitutions"].get("COMMIT_SHA") != sha or build["substitutions"].get("BRANCH_NAME") != branch:
        raise ValueError("Build source substitutions do not match deployment")
    record = {"build_id": build_id, "source_sha": sha, "created_at": build["createTime"]}
    generation = None
    for attempt in range(31):
        try:
            generation = put_object("deployment-lock.json", record, generation=0)["generation"]
            break
        except HTTPError as error:
            if error.code != 412:
                raise
            if attempt == 30:
                raise RuntimeError("Deployment lock busy; inspect owning build before retry or recovery") from None
            print("Waiting for the other frontend deployment (10 seconds)", flush=True)
            time.sleep(10)
    try:
        if not newer_than(record, read_object("deployment-watermark.json")):
            print("Superseded by a newer deployment attempt; no service changes", flush=True)
            return
        # Reserve before mutations: cancellation cannot let an older build win.
        put_object("deployment-watermark.json", record)
        before = describe_service()
        previous_traffic = traffic_revisions(before)
        digest = gcloud("artifacts", "docker", "images", "describe", f"{IMAGE}:{sha}-{build_id}",
                        "--format=value(image_summary.digest)")
        if not re.fullmatch(r"sha256:[a-f0-9]{64}", digest):
            raise ValueError("Registry did not return a valid immutable digest")
        image = IMAGE + "@" + digest
        record.update(image=image, previous_traffic=previous_traffic)
        put_object(f"attempts/{build_id}.json", record)
        gcloud("run", "services", "update", SERVICE, "--region", REGION, "--image", image,
               "--no-traffic", "--tag=candidate")
        candidate = describe_service()
        # Let Cloud Run generate names. An explicit template revision would
        # conflict with later Terraform-owned runtime configuration updates.
        revision = candidate["status"]["latestReadyRevisionName"]
        if revision != candidate["status"]["latestCreatedRevisionName"] or (
                candidate["spec"]["template"]["spec"]["containers"][0]["image"] != image):
            raise ValueError("Ready candidate does not match the requested image")
        record["revision"] = revision
        put_object(f"attempts/{build_id}.json", record)
        candidate_url = next(target["url"] for target in candidate["status"]["traffic"]
                             if target.get("tag") == "candidate" and target.get("revisionName") == revision)
        if traffic_revisions(candidate) != previous_traffic:
            raise ValueError("Candidate deployment unexpectedly changed serving traffic")
        smoke(candidate_url)
        gcloud("run", "jobs", "update", JOB, "--region", REGION, "--image", image)
        for mode in ["write", "read"]:
            gcloud("run", "jobs", "execute", JOB, "--region", REGION,
                   "--args=/app/runtime-probe.cjs," + mode, "--wait")
        try:
            set_traffic({revision: 100})
            smoke(ORIGIN)
            if traffic_revisions(describe_service()) != {revision: 100}:
                raise ValueError("Promoted traffic does not match verified revision")
            record["status"] = "verified"
            put_object(f"releases/{build_id}.json", record)
            put_object("current.json", record)
        except Exception:
            set_traffic(previous_traffic)
            print("Promotion failed; restored previous serving revisions", flush=True)
            raise
        print(json.dumps(record), flush=True)
    finally:
        # Compare-and-delete only OUR lock, even if an operator intervened.
        request(object_url("deployment-lock.json") + "?ifGenerationMatch=" + str(generation), "DELETE")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # URL/response bodies may contain authorization data; never dump them.
        print(f"Deployment failed: {type(error).__name__}" +
              (f" HTTP {error.code}" if isinstance(error, HTTPError) else ""), flush=True)
        raise SystemExit(1)
