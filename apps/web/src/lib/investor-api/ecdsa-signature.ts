/**
 * ECDSA signature encodings for ES256 (P-256).
 *
 * JOSE (RFC 7518 §3.4) requires the raw fixed-width concatenation `r || s`
 * (2 × 32 bytes for P-256). Cloud KMS `asymmetricSign` — and most HSMs —
 * return the ASN.1 DER `SEQUENCE { INTEGER r, INTEGER s }` encoding, whose
 * integers are variable-length (leading zeros stripped, a 0x00 pad added when
 * the top bit is set). Handing a DER signature to a JWT verifier fails
 * verification, silently and only in production, so the conversion is
 * explicit here and pinned by contract assertions in both directions.
 */

export const P256_COORDINATE_BYTES = 32;

function stripLeadingZeros(bytes: Uint8Array): Uint8Array {
  let i = 0;
  while (i < bytes.length - 1 && bytes[i] === 0) i++;
  return bytes.subarray(i);
}

function padToWidth(bytes: Uint8Array, width: number): Uint8Array {
  const trimmed = stripLeadingZeros(bytes);
  if (trimmed.length > width) {
    throw new Error(
      `ECDSA integer is ${String(trimmed.length)} bytes; exceeds ${String(width)}`,
    );
  }
  const out = new Uint8Array(width);
  out.set(trimmed, width - trimmed.length);
  return out;
}

/** Parse one DER INTEGER at `offset`; returns its value bytes and the next offset. */
function readDerInteger(
  der: Uint8Array,
  offset: number,
): { value: Uint8Array; next: number } {
  if (der[offset] !== 0x02) {
    throw new Error("DER: expected INTEGER");
  }
  const len = der[offset + 1];
  if (len === undefined || len & 0x80) {
    throw new Error("DER: unsupported INTEGER length encoding");
  }
  const start = offset + 2;
  const end = start + len;
  if (end > der.length) throw new Error("DER: INTEGER overruns buffer");
  return { value: der.subarray(start, end), next: end };
}

/**
 * DER `SEQUENCE { INTEGER r, INTEGER s }` → JOSE `r || s` (64 bytes for P-256).
 */
export function derToJose(
  der: Uint8Array,
  coordinateBytes: number = P256_COORDINATE_BYTES,
): Uint8Array {
  if (der[0] !== 0x30) throw new Error("DER: expected SEQUENCE");
  const seqLen = der[1];
  if (seqLen === undefined || seqLen & 0x80) {
    throw new Error("DER: unsupported SEQUENCE length encoding");
  }
  if (seqLen + 2 !== der.length) {
    throw new Error("DER: SEQUENCE length does not match buffer");
  }
  const r = readDerInteger(der, 2);
  const s = readDerInteger(der, r.next);
  if (s.next !== der.length) throw new Error("DER: trailing bytes");
  const out = new Uint8Array(coordinateBytes * 2);
  out.set(padToWidth(r.value, coordinateBytes), 0);
  out.set(padToWidth(s.value, coordinateBytes), coordinateBytes);
  return out;
}

function toDerInteger(value: Uint8Array): Uint8Array {
  const trimmed = stripLeadingZeros(value);
  const needsPad = (trimmed[0] ?? 0) & 0x80;
  const body = needsPad
    ? new Uint8Array([0x00, ...trimmed])
    : new Uint8Array(trimmed);
  return new Uint8Array([0x02, body.length, ...body]);
}

/**
 * JOSE `r || s` → DER `SEQUENCE { INTEGER r, INTEGER s }`. Used by tests and by
 * the local verification step that proves a KMS signature round-trips.
 */
export function joseToDer(
  jose: Uint8Array,
  coordinateBytes: number = P256_COORDINATE_BYTES,
): Uint8Array {
  if (jose.length !== coordinateBytes * 2) {
    throw new Error(
      `JOSE signature must be ${String(coordinateBytes * 2)} bytes, got ${String(jose.length)}`,
    );
  }
  const r = toDerInteger(jose.subarray(0, coordinateBytes));
  const s = toDerInteger(jose.subarray(coordinateBytes));
  const seqLen = r.length + s.length;
  if (seqLen > 0x7f) throw new Error("DER: SEQUENCE too long for short form");
  return new Uint8Array([0x30, seqLen, ...r, ...s]);
}

/** True when `sig` is already the fixed-width JOSE form for the curve. */
export function isJoseForm(
  sig: Uint8Array,
  coordinateBytes: number = P256_COORDINATE_BYTES,
): boolean {
  return sig.length === coordinateBytes * 2;
}
