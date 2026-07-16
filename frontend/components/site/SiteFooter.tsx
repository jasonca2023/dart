import Link from "next/link";
import { Logo } from "../ui/Logo";

// Hallmark footer — Previous: index-column groups (the AI-footer shape).
// This build: Ft5 Statement — one closing display sentence, then a quiet meta
// row. Knobs: sentence width=16ch · wordmark under sentence · no rule above
// meta (tonal shift only — atmospheric avoids hairlines where it can).
export function SiteFooter() {
  return (
    <footer className="mx-auto max-w-[var(--page-max)] px-5 pb-10 pt-20 sm:px-8">
      <p className="max-w-[16ch] text-balance font-display text-[clamp(2rem,5vw,3.25rem)] font-light leading-[1.05] tracking-[-0.02em] text-linen">
        Aim at a product. Let it fly.
      </p>
      <div className="mt-12 flex flex-col gap-4 text-[13px] text-dusk sm:flex-row sm:items-baseline sm:justify-between">
        <Logo className="text-linen" />
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <Link
            href="/auth"
            className="text-moth transition-colors duration-150 ease-out hover:text-linen focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-linen"
          >
            Log in
          </Link>
          <Link
            href="/auth?mode=signup"
            className="text-moth transition-colors duration-150 ease-out hover:text-linen focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-linen"
          >
            Sign up
          </Link>
          <span>© 2026 Dart</span>
        </div>
      </div>
    </footer>
  );
}
