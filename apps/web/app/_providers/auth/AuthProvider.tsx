"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useRouter } from "next/navigation";
import {
  useSession,
  useSessionRefresh,
  useSignOut,
  type AuthSession,
  type KycStatusValue,
} from "@refi/api-clients";

export type AuthContextValue = {
  status: "loading" | "authenticated" | "unauthenticated";
  account_id?: string;
  wallet_id?: string;
  roles: string[];
  kyc_status?: KycStatusValue;
  signOut: () => Promise<void>;
  refetchSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const REFRESH_THRESHOLD_SECONDS = 5 * 60;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const sessionQuery = useSession();
  const refresh = useSessionRefresh();
  const signOutMutation = useSignOut();
  const refreshScheduledFor = useRef<number | null>(null);

  const session: AuthSession | undefined = sessionQuery.data;

  // Schedule an auto-refresh when the session is close to expiring.
  useEffect(() => {
    if (!session || session.status !== "authenticated") return;
    const expiresIn = session.expires_in_seconds;
    if (typeof expiresIn !== "number") return;

    const refreshInMs = Math.max(
      0,
      (expiresIn - REFRESH_THRESHOLD_SECONDS) * 1000,
    );
    const scheduledAt = Date.now() + refreshInMs;
    if (refreshScheduledFor.current === scheduledAt) return;
    refreshScheduledFor.current = scheduledAt;

    const t = setTimeout(() => {
      refresh.mutate();
    }, refreshInMs);
    return () => {
      clearTimeout(t);
      refreshScheduledFor.current = null;
    };
  }, [session, refresh]);

  // React to a global 401 dispatched by the API client.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => {
      void sessionQuery.refetch();
    };
    window.addEventListener("auth:unauthorized", handler);
    return () => window.removeEventListener("auth:unauthorized", handler);
  }, [sessionQuery]);

  const signOut = useCallback(async () => {
    try {
      await signOutMutation.mutateAsync();
    } finally {
      router.replace("/us");
      await sessionQuery.refetch();
    }
  }, [signOutMutation, router, sessionQuery]);

  const refetchSession = useCallback(async () => {
    await sessionQuery.refetch();
  }, [sessionQuery]);

  const value = useMemo<AuthContextValue>(() => {
    const isLoading = sessionQuery.isLoading || sessionQuery.isPending;
    const status: AuthContextValue["status"] = isLoading
      ? "loading"
      : session?.status === "authenticated"
        ? "authenticated"
        : "unauthenticated";
    return {
      status,
      account_id: session?.account_id,
      wallet_id: session?.wallet_id,
      roles: session?.roles ?? [],
      kyc_status: session?.kyc_status,
      signOut,
      refetchSession,
    };
  }, [
    session,
    sessionQuery.isLoading,
    sessionQuery.isPending,
    signOut,
    refetchSession,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
