"use client";

// The signed-in nav links. The active destination gets a soft sand highlight (no
// outline) that slides between links instead of jumping — one absolutely
// positioned pill, measured from the active link and transitioned on left/width.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const LINKS: { href: string; label: string }[] = [
  { href: "/", label: "Dashboard" },
  { href: "/ads", label: "Ads" },
];

// Navigating between Dashboard and Ads remounts this component (separate pages),
// so the slide has to survive a remount: the pill's last position is stashed in
// sessionStorage, the fresh mount renders it there first, then animates to the
// newly measured spot.
const POS_KEY = "dart:nav-pill";

function storedPill(): { left: number; width: number } | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(POS_KEY) || "null");
    return v && typeof v.left === "number" && typeof v.width === "number" ? v : null;
  } catch {
    return null;
  }
}

export function AppNav() {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement | null>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(storedPill);

  const activeIndex = LINKS.findIndex(({ href }) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href),
  );

  // Measure the active link and slide the pill under it. Re-measures on path
  // change and on resize (font metrics/layout can shift the offsets).
  useEffect(() => {
    let raf = 0;
    const measure = () => {
      const nav = navRef.current;
      const el = nav?.querySelectorAll("a")[activeIndex];
      if (!nav || !el) {
        setPill(null);
        return;
      }
      const navBox = nav.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      const next = { left: box.left - navBox.left, width: box.width };
      try {
        sessionStorage.setItem(POS_KEY, JSON.stringify(next));
      } catch {
        /* fine — the slide just won't survive a remount */
      }
      // Let the stored (old) position paint first so the move transitions.
      raf = requestAnimationFrame(() => setPill(next));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      cancelAnimationFrame(raf);
    };
  }, [activeIndex]);

  return (
    <nav ref={navRef} className="relative hidden items-center gap-1 sm:flex">
      {pill && activeIndex !== -1 && (
        <span
          aria-hidden
          className="absolute top-0 h-full rounded-full bg-sand transition-[left,width] duration-300 ease-out motion-reduce:transition-none"
          style={{ left: pill.left, width: pill.width }}
        />
      )}
      {LINKS.map(({ href, label }, i) => {
        const active = i === activeIndex;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={
              "relative rounded-full px-3 py-1.5 text-[14px] text-ink transition-colors duration-150 ease-out " +
              (active ? "" : "hover:text-driftwood")
            }
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
