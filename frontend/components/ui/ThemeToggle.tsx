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
  // the server render can't know it, so sync local state after mount.
  useEffect(() => {
    if (document.documentElement.dataset.theme === "night") setTheme("night");
  }, []);

  const toggle = () => {
    const next: Theme = theme === "night" ? "bloom" : "night";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Blocked storage just loses persistence, not the toggle itself.
    }
    setTheme(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={
        theme === "night" ? "Switch to light theme" : "Switch to dark theme"
      }
      className={
        "theme-toggle grid size-9 place-items-center rounded-full transition-colors duration-150 ease-out active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 " +
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
