"use client";

// The signed-in nav links. Client-side only to read the current path — the active
// destination gets a soft sand highlight (no outline), the rest stay plain.

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS: { href: string; label: string }[] = [
  { href: "/", label: "Dashboard" },
  { href: "/ads", label: "Ads" },
];

export function AppNav() {
  const pathname = usePathname();
  return (
    <nav className="hidden items-center gap-1 sm:flex">
      {LINKS.map(({ href, label }) => {
        const active =
          href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={
              "rounded-full px-3 py-1.5 text-[14px] transition-colors duration-150 ease-out " +
              (active
                ? "bg-sand text-ink"
                : "text-ink hover:text-driftwood")
            }
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
