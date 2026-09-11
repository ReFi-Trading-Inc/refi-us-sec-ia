# v1.1.0-alpha.3 package — upstream defects recorded (not patched)

The vendored package stays byte-for-byte (`bundle.json.package_content_sha256`
= `5eca1200f6af807093ea0986f835235e2da478b69478e621fd54954ba1d77608` is the
digest authority). Defects in Daniel's artifacts are recorded here for the
integration channel and are never repaired inside the vendored directory.

| #   | Artifact                                                 | Defect                                                                                                                          | Impact                                                               | Action                                                                                                                                     |
| --- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `v1.1.0-alpha.3/INTEGRATION.md` Appendix A sample packet | `"contract_version": "v1.1.0-alpha.3"` is paired with `"package_content_sha256": "c1b53c90…"`, which is the **alpha.2** digest. | A packet copied from the sample would misreport the vendored digest. | Our Appendix A packet skeleton uses the alpha.3 digest from `bundle.json`/`CURRENT.json`. Report to Daniel; do not edit the vendored file. |
