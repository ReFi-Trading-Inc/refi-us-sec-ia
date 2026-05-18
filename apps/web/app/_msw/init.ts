// Browser-side MSW bootstrap. Only starts when running outside production AND
// the data adapter is set to "mock". Production builds never load this code path.
let started = false;

export async function initMsw(): Promise<void> {
  if (started) return;
  if (typeof window === "undefined") return;

  const env = process.env["NEXT_PUBLIC_REFI_ENV"];
  const adapter = process.env["NEXT_PUBLIC_REFI_DATA_ADAPTER"] ?? "mock";
  if (env === "prod" || adapter !== "mock") return;

  const [{ setupWorker }, { handlers }] = await Promise.all([
    import("msw/browser"),
    import("@refi/api-clients/mocks"),
  ]);

  const worker = setupWorker(...handlers);
  await worker.start({
    onUnhandledRequest: "bypass",
    serviceWorker: { url: "/mockServiceWorker.js" },
  });
  started = true;
}
