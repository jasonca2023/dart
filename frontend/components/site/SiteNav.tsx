import Link from "next/link";
import { Logo } from "../ui/Logo";
import { ButtonLink } from "../ui/Button";

// Hallmark nav — Previous: N5 Floating pill (detached blur pill over parchment).
// This build: N9 Edge-aligned minimal, because the night canvas and the orb own
// the fold — chrome should disappear into it, not float above it. Wordmark
// hard-left, auth pair hard-right, nothing in between; the absence is the
// design. Knobs: CTA=filled linen pill · wordmark=sans · padding=spacious.
export function SiteNav() {
  return (
    <header className="relative z-50 px-5 pt-5 sm:px-8 sm:pt-6">
      <nav className="mx-auto flex max-w-[var(--page-max)] items-center justify-between">
        <Logo className="text-linen" />
        <div className="flex items-center gap-5">
          <Link
            href="/auth"
            className="text-[14px] text-moth transition-colors duration-150 ease-out hover:text-linen focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-linen"
          >
            Log in
          </Link>
          <ButtonLink href="/auth?mode=signup" variant="moon" size="sm">
            Start free
          </ButtonLink>
        </div>
      </nav>
    </header>
  );
}
