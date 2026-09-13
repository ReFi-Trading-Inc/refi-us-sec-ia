"use client";

/**
 * Route authority for `/us/product/*`.
 *
 * `AuthProvider` PROJECTS session status; it does not gate anything. Mounting
 * a surface inside it therefore proves nothing about the viewer, and the
 * product surfaces must not render investor state — brokerage status, fixture
 * account state, subscription state, or any identity-verification claim — to
 * someone whose session has not been established.
 *
 * The three states, per founder directive 2026-09-12:
 *
 *   loading         neutral, and product actions are NOT initialised. Children
 *                   do not mount, so no adapter read is issued while we still
 *                   do not know who is asking.
 *   unauthenticated redirect to the canonical `/us` entry (the same
 *                   destination `AuthProvider.signOut` uses). No second login
 *                   flow is invented here. Nothing investor-shaped renders in
 *                   the meantime.
 *   authenticated   children mount and may initialise.
 *
 * This is deliberately a render gate, not a security boundary: every
 * account-scoped read is re-authorised server-side regardless. It exists so
 * the UI cannot *assert* things about a viewer it has not identified.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../_providers/auth/AuthProvider";
import { Panel, StatusPanel } from "./primitives";

export function ProductAuthGate({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const router = useRouter();
  const unauthenticated = auth.status === "unauthenticated";

  useEffect(() => {
    if (unauthenticated) {
      router.replace("/us");
    }
  }, [unauthenticated, router]);

  if (auth.status === "loading") {
    return (
      <Panel aria-busy="true" data-testid="product-auth-loading">
        <span className="sr-only">Checking your session</span>
        <div className="h-3 w-40 animate-pulse rounded-app-input bg-charcoal-400 motion-reduce:animate-none" />
      </Panel>
    );
  }

  if (unauthenticated) {
    // Rendered only for the moment before the redirect lands. It states the
    // requirement and nothing else — no brokerage, subscription, account or
    // identity-verification claim can appear on this branch.
    return (
      <StatusPanel
        tone="info"
        title="Sign in to continue"
        data-testid="product-sign-in-required"
      >
        <p>Taking you to the ReFi sign-in page.</p>
      </StatusPanel>
    );
  }

  return <>{children}</>;
}
