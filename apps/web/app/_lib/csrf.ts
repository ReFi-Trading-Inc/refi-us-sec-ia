import type { NextResponse } from "next/server";
import { type NextRequest } from "next/server";

const CSRF_COOKIE = "csrf_v1";
const CSRF_HEADER = "x-csrf-token";

export function validateCsrfToken(request: NextRequest): boolean {
  const cookieToken = request.cookies.get(CSRF_COOKIE)?.value;
  const headerToken = request.headers.get(CSRF_HEADER);
  if (!cookieToken || !headerToken) return false;
  // Constant-time comparison prevents timing attacks on token comparison.
  if (cookieToken.length !== headerToken.length) return false;
  let mismatch = 0;
  for (let i = 0; i < cookieToken.length; i++) {
    mismatch |= cookieToken.charCodeAt(i) ^ headerToken.charCodeAt(i);
  }
  return mismatch === 0;
}

export function setCsrfCookie(response: NextResponse, token: string): void {
  response.cookies.set(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: true,
    sameSite: "lax",
    path: "/us",
    maxAge: 60 * 60 * 8,
  });
}
