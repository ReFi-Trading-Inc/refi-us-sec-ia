'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <p className="text-charcoal-400 font-mono text-sm">Error</p>
        <h1 className="mt-2 text-charcoal-100 text-xl font-medium">Something went wrong</h1>
        {error.digest && (
          <p className="mt-1 text-charcoal-400 font-mono text-xs">{error.digest}</p>
        )}
        <button
          onClick={reset}
          className="mt-4 text-mint-300 text-sm underline hover:no-underline"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
