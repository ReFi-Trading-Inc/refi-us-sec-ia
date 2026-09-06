/**
 * SERVER-ONLY session → account link for demo personas — the demo analogue of
 * the `AuthSessionLink` the identity exchange would write.
 *
 * Keyed by the VERIFIED session subject (the JWT `sub` the BFF checked), never
 * by anything the browser sends: not the persona label, not the display
 * cookie, not a query string. Consulted only when `REFI_ENV=demo`, and every
 * account-scoped read still re-authorizes the claim against `listAccounts`.
 * Deliberately separate from the persona registry so the BFF auth path never
 * imports anything cookie-adjacent.
 */
export const DEMO_PERSONA_ACCOUNT_LINK: Readonly<
  Partial<Record<string, string>>
> = {
  "demo-invited-01": "acct_demo_invited_01",
  "demo-admitted-01": "acct_demo_admitted_01",
};
