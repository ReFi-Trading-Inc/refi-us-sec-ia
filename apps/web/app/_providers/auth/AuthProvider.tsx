"use client";

/**
 * Session context for the /us surface, read from the BFF's own session
 * projection (`GET /api/v1/investor/session`, 401 when there is no verified
 * `us_session_v1` cookie). C1b-2 rows 1–3: the legacy browser-direct
 * `/auth/session`, `/auth/refresh`, `/auth/revoke-all` calls (mock-only) are
 * retired. The BFF cookie is the only session; there is no client refresh —
 * expiry means sign in again. Sign-out clears the cookie through the BFF.
 *
 * Identity itself is email-first via identity-ccid once the connection
 * package lands (GAP-IDENTITY-018); wallets are optional linked identifiers,
 * never the login, and never appear here.
 */
import { createContext, useCallback, useContext, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export interface SessionView {
  authId: string;
  accountId?: string;
  issuedAt: string;
  expiresAt: string;
}

export type AuthContextValue = {
  status: "loading" | "authenticated" | "unauthenticated";
  /** The BFF session subject (opaque). Never a wallet or email. */
  authId?: string;
  /** Claimed account id from the session link; every account-scoped read re-authorizes it server-side. */
  accountId?: string;
  signOut: () => Promise<void>;
  refetchSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
export const SESSION_QUERY_KEY = ["investor", "session"] as const;

async function readSession(): Promise<SessionView | null> {
  const res = await fetch("/api/v1/investor/session", {
    credentials: "include",
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`session read failed: ${String(res.status)}`);
  const body = (await res.json()) as { data: SessionView | null };
  return body.data;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const qc = useQueryClient();
  const sessionQuery = useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: readSession,
    staleTime: 30_000,
    retry: false,
  });

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/v1/investor/session", {
        method: "DELETE",
        credentials: "include",
      });
    } finally {
      qc.clear();
      router.replace("/us");
    }
  }, [qc, router]);

  const refetchSession = useCallback(async () => {
    await sessionQuery.refetch();
  }, [sessionQuery]);

  const value = useMemo<AuthContextValue>(() => {
    const session = sessionQuery.data ?? null;
    const status: AuthContextValue["status"] = sessionQuery.isPending
      ? "loading"
      : session
        ? "authenticated"
        : "unauthenticated";
    return {
      status,
      ...(session ? { authId: session.authId } : {}),
      ...(session?.accountId ? { accountId: session.accountId } : {}),
      signOut,
      refetchSession,
    };
  }, [sessionQuery.data, sessionQuery.isPending, signOut, refetchSession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
