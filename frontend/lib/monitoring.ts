// Error monitoring (Sentry) — browser-only and fully env-gated.
//
// No NEXT_PUBLIC_SENTRY_DSN → every export here is inert AND the Sentry SDK is
// never even downloaded: the import is dynamic and only runs when a DSN is
// present, so users of a monitoring-off deploy pay zero bytes and zero cost.
// The DSN is inlined by `next build`, so set it in the deploy environment.
//
// This uses the browser SDK (@sentry/react), not @sentry/nextjs: the app runs
// on Cloudflare Workers via OpenNext, where the Next.js SDK's server-side Node
// instrumentation is unreliable. Client errors — the uncaught crashes users
// actually hit (a failed WebGL mount, a render throwing) — are captured here;
// backend faults are captured by the FastAPI SDK on Render.

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

type SentryModule = typeof import("@sentry/react");

let sentry: SentryModule | null = null;
// A single in-flight init promise shared by every caller: the layout mounts
// <Monitoring/> which kicks this off, and other call sites can await the SAME
// promise instead of racing a second init (or firing before the async import
// + init has actually finished).
let initPromise: Promise<void> | null = null;

export function initMonitoring(): Promise<void> {
  if (!DSN || typeof window === "undefined") return Promise.resolve();
  if (!initPromise) {
    initPromise = (async () => {
      // Only now — with a DSN present — is the SDK actually fetched.
      const Sentry = await import("@sentry/react");
      Sentry.init({
        dsn: DSN,
        environment: process.env.NEXT_PUBLIC_SENTRY_ENV ?? "production",
        // Errors only by default — no performance tracing, no session replay —
        // to keep quota and payload weight low. Turn these up later if wanted.
        tracesSampleRate: 0,
        // Don't attach the user's IP or other default PII to events.
        sendDefaultPii: false,
      });
      sentry = Sentry;
    })();
  }
  return initPromise;
}

// Report a caught exception (e.g. from an error boundary). No-op until
// initMonitoring has finished with a DSN, so it's always safe to call.
export function reportError(error: unknown): void {
  sentry?.captureException(error);
}
