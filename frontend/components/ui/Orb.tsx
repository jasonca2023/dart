import type { CSSProperties } from "react";

interface OrbProps {
  /** The ad's real accent color — the orb's gradient is mixed from it, so the
   * preview genuinely reflects the palette the render will use. Falls back to the
   * base ember↔violet wash (see `.orb` in globals.css) when omitted. */
  accent?: string;
  className?: string;
  float?: boolean;
}

// Decorative only — never a surface, never holds text (Hallmark orb rule).
export function Orb({ accent, className, float = true }: OrbProps) {
  const style = accent
    ? ({
        "--hot": accent,
        "--cool": `color-mix(in oklab, ${accent} 58%, white)`,
      } as CSSProperties)
    : undefined;
  return (
    <span
      aria-hidden
      style={style}
      className={`orb ${float ? "orb-float" : ""} ${className ?? ""}`}
    />
  );
}
