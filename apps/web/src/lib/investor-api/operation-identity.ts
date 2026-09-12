/** One logical browser action, including all recovery attempts, has one ID.
 * The backend durably binds its scoped key to the exact request and receipt.
 * No credentials/body are retained here. New actions must supply a new ID.
 */
import { createHash } from "node:crypto";

export const OPERATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
export function operationIdFrom(headers: Headers): string | null {
  const value = headers.get("Idempotency-Key");
  return value && OPERATION_ID_PATTERN.test(value) ? value : null;
}
export function operationKey(
  operation: string,
  accountId: string,
  operationId: string,
  connectionId = "",
): string {
  if (
    typeof operationId !== "string" ||
    !OPERATION_ID_PATTERN.test(operationId)
  )
    throw new Error("Invalid logical operation ID");
  return createHash("sha256")
    .update(JSON.stringify([operation, accountId, connectionId, operationId]))
    .digest("hex");
}
