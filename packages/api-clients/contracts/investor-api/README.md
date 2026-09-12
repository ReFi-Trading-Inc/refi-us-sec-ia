# Investor API contract — start here

**Use [v1.1.0-alpha.4](v1.1.0-alpha.4/README.md).** Generated client, validators,
runtime imports, examples and CURRENT.json now select this version. The complete
issued package is unchanged and verified against its artifact hashes.
[TARGET.json](TARGET.json) retains source provenance, not a different selection.

Old alpha.2/alpha.3 packages are in [archive](archive/README.md), for reference
and history tests only. Do not use them for new integration.

Read [MIGRATION.md](v1.1.0-alpha.4/MIGRATION.md),
[FUNDING.md](v1.1.0-alpha.4/FUNDING.md) and the closed schemas/examples.
[INTEGRATION.md](v1.1.0-alpha.4/INTEGRATION.md) is immutable issuance-time guidance;
the [active checklist](../../../../docs/integration-roadmap.md) and
[implementation status](../../../../docs/alpha4-integration-status.md) contain
current ownership, operational facts and remaining gates. Automated SP500-following
is the Alpha target; a separately labelled, off-by-default development KYC source
is owner-approved. It is not Socure proof.

Client adoption is **not connected Alpha acceptance**. Real login, exact backend
trust activation, independent admission/membership and end-to-end acceptance
remain open. No operational connection addendum is claimed by this local pointer.
Never modify issued package bytes to add deployment facts or new endpoints.

From this repository root:

```bash
python3 packages/api-clients/contracts/investor-api/v1.1.0-alpha.4/tools/conformance.py validate
python3 packages/api-clients/contracts/investor-api/v1.1.0-alpha.4/tools/conformance.py self-test
```

These prove package integrity/conformance, not live authentication or execution.
