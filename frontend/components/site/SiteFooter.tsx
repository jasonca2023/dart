import Link from "next/link";
import { Logo } from "../ui/Logo";

const GROUPS = [
  {
    heading: "Product",
    links: [
      { href: "/#pipeline", label: "Pipeline" },
      { href: "/#moods", label: "Ad moods" },
      { href: "/#dashboard", label: "Dashboard" },
    ],
  },
  {
    heading: "Account",
    links: [
      { href: "/auth", label: "Log in" },
      { href: "/auth", label: "Sign up" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-ash">
      <div className="mx-auto max-w-[var(--page-max)] px-5 py-14 sm:px-8">
        <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-4 text-[14px] leading-relaxed text-driftwood">
              A one-click ad factory. One product photo in, one on-brand animated
              ad out.
            </p>
          </div>
          <div className="flex gap-16">
            {GROUPS.map((g) => (
              <div key={g.heading}>
                <p className="t-caption text-fog">{g.heading}</p>
                <ul className="mt-4 flex flex-col gap-2.5">
                  {g.links.map((l) => (
                    <li key={l.label}>
                      <Link
                        href={l.href}
                        className="text-[14px] text-driftwood transition-colors duration-150 ease-out hover:text-ink"
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-12 flex flex-col gap-2 border-t border-ash pt-6 text-[12px] text-fog sm:flex-row sm:items-center sm:justify-between">
          <span>© {2026} Dart.</span>
          <span className="font-mono">Built for merchants who ship.</span>
        </div>
      </div>
    </footer>
  );
}
