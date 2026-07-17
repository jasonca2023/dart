"use client";

// The signed-in nav links. The active destination gets a soft sand highlight (no
// outline) that slides between links instead of jumping — one absolutely
// positioned pill, measured from the active link and transitioned on left/width.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Menu } from "../icons";

// useLayoutEffect fires before paint in the browser but warns during SSR;
// AppNav is server-rendered, so swap in useEffect there (it never runs
// server-side anyway — this just silences the render-pass warning).
const useBrowserLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

const LINKS: { href: string; label: string }[] = [
  { href: "/", label: "Dashboard" },
  { href: "/ads", label: "Ads" },
];

// Below `sm` the header has no room for the full pill nav (logo + links +
// theme toggle + account chip all fighting for ~280px), so mobile gets a
// menu button that opens the same two destinations as a dropdown instead of
// losing navigation entirely.
function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative sm:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Navigation menu"
        className={
          "grid size-10 place-items-center rounded-full text-[18px] transition-colors duration-150 ease-out " +
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink " +
          (open ? "bg-sand text-ink" : "text-driftwood hover:text-ink")
        }
      >
        <Menu />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-2 w-40 rounded-[14px] border border-ash bg-white p-1 shadow-[var(--shadow-elevated)]"
        >
          {LINKS.map(({ href, label }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                role="menuitem"
                href={href}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={
                  "block rounded-[10px] px-3 py-2 text-[13px] transition-colors duration-150 ease-out " +
                  (active ? "bg-sand text-ink" : "text-ink hover:bg-sand")
                }
              >
                {label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

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
  // Starts null (matching the server render — sessionStorage doesn't exist
  // there, and lazy-initializing from it made the client's hydration pass
  // include a pill the SSR HTML never had: a guaranteed hydration mismatch).
  // The stored position is applied below, before first paint.
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  useBrowserLayoutEffect(() => {
    const stored = storedPill();
    if (stored) setPill(stored);
  }, []);

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
    <>
      <nav ref={navRef} className="relative hidden items-center gap-1 sm:flex">
        {pill && activeIndex !== -1 && (
          <span
            aria-hidden
            className="absolute top-0 h-full rounded-full bg-sand-2 transition-[left,width] duration-300 ease-out motion-reduce:transition-none"
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
      <MobileNav />
    </>
  );
}
