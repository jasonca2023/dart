import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "../ui/Logo";
import { ButtonLink } from "../ui/Button";
import { AccountMenu } from "./AccountMenu";
import { AuthGate } from "./AuthGate";
import { USING_MOCK } from "@/lib/api";

// Chrome shared by every signed-in screen. Sticky low-height bar, parchment
// canvas — same vocabulary as the marketing nav, fewer destinations.
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <div className="min-h-screen bg-parchment">
        <header className="sticky top-0 z-40 border-b border-ash bg-parchment/85 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-[var(--page-max)] items-center gap-5 px-5 sm:px-8">
          <Logo />
          <nav className="hidden items-center gap-1 sm:flex">
            <Link
              href="/"
              className="rounded-full px-3 py-1.5 text-[14px] text-ink transition-colors duration-150 ease-out hover:text-driftwood"
            >
              Dashboard
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {USING_MOCK && (
              <span
                title="No backend connected — running the local mock pipeline."
                className="hidden items-center gap-1.5 rounded-full border border-ash bg-sand px-2.5 py-1 font-mono text-[11px] text-driftwood sm:inline-flex"
              >
                <span className="size-1.5 rounded-full bg-fog" />
                Demo data
              </span>
            )}
            <AccountMenu />
            <ButtonLink href="/" variant="primary" size="sm">
              New ad
            </ButtonLink>
          </div>
        </div>
      </header>
        <main className="mx-auto max-w-[var(--page-max)] px-5 py-10 sm:px-8">
          {children}
        </main>
      </div>
    </AuthGate>
  );
}
