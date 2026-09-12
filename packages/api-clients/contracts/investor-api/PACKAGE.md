# Selected Investor API package

Start at [README.md](README.md). The active client and [CURRENT.json](CURRENT.json)
select **v1.1.0-alpha.4**; only historical tests read [archive](archive/README.md).

| Field                    | Value                                                                   |
| ------------------------ | ----------------------------------------------------------------------- |
| Package content SHA-256  | `a6db935b6a398bff00a7ccee4cb268ee565249bbd75c23e36594c9f6b698e7c3`      |
| Source contract SHA-256  | `47b670f366b09280fe90c0e01d53f7d616f8d145ca823c314f9dbae060a11be3`      |
| Backend source checkout  | `07ae53bee3dbfd436206f9fd2a41b1fc6e28605c`                              |
| Source directory         | Separate ReFinity repository: `contracts/frontend/v1.1.0-alpha.4`       |
| Connected Alpha verified | No; see [current status](../../../../docs/alpha4-integration-status.md) |

The whole directory is byte-identical, including tools and issuance-time docs.
Package tests verify file sets and artifact hashes; the bundled conformance tool
validates schemas/examples and its self-test exercises loopback, not live users.

`package.ts` reads bundle/contract; `validation.ts` reads schemas; generated types
come from OpenAPI. Connection JSON is documentation, never runtime configuration.
Deployment bindings come from reviewed server configuration and separate keys.

Alpha.4 adds nullable capital-feasibility evidence to preview/recommendations and
corrects recommendation summary/detail shapes. Exact decimal strings and unknown,
incomplete, stale and superseded states are preserved. Alpha.3's validated error
continuation and exact-consent acknowledgment behavior remain supported.
