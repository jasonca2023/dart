"use client";

import { useEffect, useId, useState } from "react";

type Theme = "bloom" | "night";

const KEY = "dart-theme";

// Animated sun ⇄ moon toggle. The morph lives in globals.css and is driven by
// :root[data-theme], so the icon always reflects the real page theme — this
// component only flips the attribute, persists the choice, and labels itself.
export function ThemeToggle({
  className = "text-driftwood hover:text-ink",
}: {
  className?: string;
}) {
  const id = useId();
  const [theme, setTheme] = useState<Theme>("bloom");

  // The no-FOUC script in layout.tsx stamps <html data-theme> before paint;
  // the server render can't know it, so sync local state after mount. Kept
  // watching (not a one-shot check) because that same script's self-healing
  // MutationObserver can correct <html data-theme> slightly after mount (a
  // ~200ms window on the signed-in app where something clears the attribute
  // and the script restores it) — a one-shot read here could land inside
  // that window, read the wrong value, and never notice the DOM self-heal
  // afterward: the icon would then permanently show the wrong state, and a
  // click would silently do nothing (setting the theme to what it already
  // visually is) before starting to work "backwards" on the next click.
  // Watching data-theme directly makes this component's own state a pure
  // reflection of the DOM, so it can't diverge no matter what changed it.
  useEffect(() => {
    const sync = () => {
      setTheme(document.documentElement.dataset.theme === "night" ? "night" : "bloom");
    };
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => mo.disconnect();
  }, []);

  const toggle = () => {
    const next: Theme = theme === "night" ? "bloom" : "night";
    const apply = () => {
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem(KEY, next);
      } catch {
        // Blocked storage just loses persistence, not the toggle itself.
      }
      // No setTheme here — the MutationObserver above is now the single
      // source of truth for this component's state, so it'll pick up this
      // exact change (and nothing can leave it stale after).
    };
    // View Transition: snapshot the page before/after and crossfade the WHOLE
    // viewport as one image. Per-element CSS transitions fundamentally can't
    // switch a theme in unison — every component has its own duration/easing
    // for its own hover/press feedback, so some elements always visibly settle
    // before others (measured spreads of 80–475ms across this app across three
    // rounds of tuning). A single full-page crossfade can't desync by
    // construction. Falls back to an instant flip where unsupported, and skips
    // the animation entirely for reduced-motion users.
    const canAnimate =
      "startViewTransition" in document &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (canAnimate) {
      (
        document as Document & {
          startViewTransition: (cb: () => void) => void;
        }
      ).startViewTransition(apply);
    } else {
      apply();
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={
        theme === "night" ? "Switch to light theme" : "Switch to dark theme"
      }
      className={
        "theme-toggle grid size-10 place-items-center rounded-full transition-colors duration-150 ease-out active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 " +
        className
      }
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
        <mask id={id}>
          <rect width="24" height="24" fill="#fff" />
          <circle className="tt-bite" cx="12" cy="12" r="7" fill="#000" />
        </mask>
        <circle
          className="tt-core"
          cx="12"
          cy="12"
          r="8"
          fill="currentColor"
          mask={`url(#${id})`}
        />
        <g
          className="tt-rays"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        >
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
            <line
              key={a}
              x1="12"
              y1="2.6"
              x2="12"
              y2="5"
              transform={`rotate(${a} 12 12)`}
            />
          ))}
        </g>
      </svg>
    </button>
  );
}
