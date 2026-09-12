# Investor API contract — start here

**Implement [v1.1.0-alpha.4](v1.1.0-alpha.4/README.md) next.** The entire issued
package is vendored byte-for-byte, including its tools. Its source/hash and
adoption status are in [TARGET.json](TARGET.json).

**Copied is not activated:** current code generation, imports and
[CURRENT.json](CURRENT.json) still select alpha.3. That pointer describes the
existing frontend selection, not the latest backend release. Keep them together
until the first item in [the current integration checklist](../../../../docs/integration-roadmap.md)
updates the client, validators, tests and response adapters atomically.
Do not start new alpha.3 integration or flip only the pointer.

Alpha.2 is historical test material; alpha.3 is a temporary implementation
dependency. Preserve both until adoption updates their import/test paths. Move
superseded versions into a clearly labelled archive in that same verified slice;
do not break existing clients by moving them in this copy/documentation step.

Read alpha.4 [MIGRATION.md](v1.1.0-alpha.4/MIGRATION.md),
[FUNDING.md](v1.1.0-alpha.4/FUNDING.md) and the exact schemas/examples before
implementation. [INTEGRATION.md](v1.1.0-alpha.4/INTEGRATION.md) is immutable
issuance-time guidance: its old source observations and assignments do not mean
we must rebuild already completed modules or wait for a new GCP project/identity.
The mutable checklist supplies current ownership, deployed facts, backend gaps
and the owner-approved **development-only simulated KYC pass** exception.
That exception never turns test evidence into real Socure acceptance.

Never edit issued files to correct wording or add deployment facts. Use an
overlay here/checklist for current operational status; a public wire change must
be issued by the backend as a verified successor package.

From the frontend repository root:

```bash
python3 packages/api-clients/contracts/investor-api/v1.1.0-alpha.4/tools/conformance.py validate
python3 packages/api-clients/contracts/investor-api/v1.1.0-alpha.4/tools/conformance.py self-test
```

These prove package integrity/conformance, not active frontend adoption, live
authentication, broker execution or full Alpha readiness.
