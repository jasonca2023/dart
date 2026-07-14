import Link from "next/link";
import { Logo } from "../ui/Logo";
import { ButtonLink } from "../ui/Button";
import { AccountMenu } from "../app/AccountMenu";

// Hallmark nav — Previous: N1a (wordmark + inline links + button-right +
// full-width hairline border, the AI default). This build: N5 Floating pill,
// because Dart's landing is restrained editorial-minimal and a detached,
// blur-backed pill reads as deliberate chrome rather than the template, while
// keeping the three section anchors + auth. Knobs: width=inset-to-page-max ·
// backdrop=blur+saturate · anchor=top.
const LINKS = [
  { href: "/#pipeline", label: "Pipeline" },
  { href: "/#moods", label: "Ad moods" },
  { href: "/#dashboard", label: "Dashboard" },
];

export function SiteNav() {
  return (
    <header className="sticky top-0 z-50 px-4 pt-3 sm:px-6 sm:pt-4">
      <nav className="mx-auto flex h-14 max-w-[var(--page-max)] items-center gap-6 rounded-full border border-ash bg-parchment/80 pl-5 pr-2 shadow-[var(--shadow-ring)] backdrop-blur-md backdrop-saturate-[1.4] sm:pl-6 sm:pr-3">
        <Logo />
        <ul className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="rounded-full px-3 py-1.5 text-[14px] text-driftwood transition-colors duration-150 ease-out hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="ml-auto flex items-center gap-2">
          <AccountMenu />
          <ButtonLink href="/auth?mode=signup" variant="primary" size="sm">
            Sign up
          </ButtonLink>
        </div>
      </nav>
    </header>
  );
}
