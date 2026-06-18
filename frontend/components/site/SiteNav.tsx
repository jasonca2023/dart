import Link from "next/link";
import { Logo } from "../ui/Logo";
import { ButtonLink } from "../ui/Button";
import { AccountMenu } from "../app/AccountMenu";
import { LtxKeyMenu } from "../app/LtxKeyMenu";

const LINKS = [
  { href: "/#pipeline", label: "Pipeline" },
  { href: "/#moods", label: "Ad moods" },
  { href: "/#dashboard", label: "Dashboard" },
  { href: "/dashboard", label: "Generate" },
];

export function SiteNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-ash bg-parchment/85 backdrop-blur-sm">
      <nav className="mx-auto flex h-14 max-w-[var(--page-max)] items-center gap-6 px-5 sm:px-8">
        <Logo />
        <ul className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="rounded-full px-3 py-1.5 text-[14px] text-driftwood transition-colors duration-150 ease-out hover:text-ink"
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="ml-auto flex items-center gap-2">
          <LtxKeyMenu />
          <AccountMenu />
          <ButtonLink href="/dashboard" variant="primary" size="sm">
            Start free
          </ButtonLink>
        </div>
      </nav>
    </header>
  );
}
