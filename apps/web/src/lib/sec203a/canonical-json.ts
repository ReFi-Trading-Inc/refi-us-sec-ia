/**
 * Canonical (key-sorted, undefined-dropping) JSON serialization.
 *
 * ONE implementation, shared by the Investor Profile v2 immutable-version
 * hash (`answersSnapshotHash`, FNV-1a provenance) and the compliance
 * attestation evidence digest (`evidence_sha256`). Byte-identical output for
 * the same value is the property both depend on; changing this function is a
 * provenance-breaking change and must be versioned, never silently edited.
 */
export function stableSerialize(v: unknown): string {
  if (Array.isArray(v)) {
    return "[" + v.map(stableSerialize).join(",") + "]";
  }
  if (v !== null && typeof v === "object") {
    return (
      "{" +
      Object.entries(v as Record<string, unknown>)
        .filter(([, val]) => val !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, val]) => JSON.stringify(k) + ":" + stableSerialize(val))
        .join(",") +
      "}"
    );
  }
  return v === undefined ? "null" : JSON.stringify(v);
}
