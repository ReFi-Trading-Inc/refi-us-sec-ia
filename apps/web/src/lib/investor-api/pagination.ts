/**
 * Bounded, cursor-preserving pagination over the contract's `Page`
 * (`has_more`, `next_cursor`). The BFF never fetches an unbounded set: a hard
 * page cap is required, cursors are forwarded exactly, and a malformed page
 * (has_more without a cursor, a repeated cursor, an over-long cursor) fails
 * closed instead of looping or truncating silently.
 */
export const CONTRACT_MAX_PAGE_SIZE = 100;
export const CONTRACT_MAX_CURSOR_LENGTH = 512;

export interface ContractPage {
  has_more: boolean;
  next_cursor: string | null;
}

export class PaginationError extends Error {
  constructor(
    readonly reason:
      | "has_more_without_cursor"
      | "cursor_repeated"
      | "cursor_invalid"
      | "page_cap_exceeded",
  ) {
    super(`pagination failed closed: ${reason}`);
    this.name = "PaginationError";
  }
}

/** A browser-supplied cursor is opaque but must still be well-formed. */
export function validateCursor(raw: string | null): string | undefined {
  if (raw === null || raw === "") return undefined;
  if (raw.length > CONTRACT_MAX_CURSOR_LENGTH) {
    throw new PaginationError("cursor_invalid");
  }
  return raw;
}

export interface CollectedPages<T> {
  items: T[];
  /** True when the cap stopped collection before the upstream ran out. */
  truncated: boolean;
  nextCursor: string | null;
}

/**
 * Collect up to `maxPages` pages. Stops when `has_more` is false. If the cap
 * is reached with more remaining, returns `truncated: true` and the cursor to
 * continue from — the caller decides whether that is acceptable for its view.
 */
export async function collectPages<T>(
  fetchPage: (cursor: string | undefined) => Promise<{
    items: T[];
    page: ContractPage;
  }>,
  options: { maxPages: number },
): Promise<CollectedPages<T>> {
  if (!Number.isInteger(options.maxPages) || options.maxPages < 1) {
    throw new PaginationError("page_cap_exceeded");
  }
  const items: T[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined = undefined;
  for (let n = 0; n < options.maxPages; n++) {
    const res = await fetchPage(cursor);
    items.push(...res.items);
    if (!res.page.has_more) {
      return { items, truncated: false, nextCursor: null };
    }
    const next = res.page.next_cursor;
    if (next === null || next === "") {
      throw new PaginationError("has_more_without_cursor");
    }
    if (next.length > CONTRACT_MAX_CURSOR_LENGTH) {
      throw new PaginationError("cursor_invalid");
    }
    if (seen.has(next) || next === cursor) {
      throw new PaginationError("cursor_repeated");
    }
    seen.add(next);
    cursor = next;
  }
  return { items, truncated: true, nextCursor: cursor ?? null };
}
