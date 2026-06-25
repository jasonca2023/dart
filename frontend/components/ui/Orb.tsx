import type { CSSProperties } from "react";

type Tone = "cinematic" | "energetic" | "luxe" | "playful" | "calm";

interface OrbProps {
  tone?: Tone;
  /** When set, the orb takes the ad's real accent color (overrides `tone`), so
   * the preview genuinely reflects the palette the render will use. */
  accent?: string;
  className?: string;
  float?: boolean;
}

// Decorative only — never a surface, never holds text (Hallmark orb rule).
export function Orb({ tone = "cinematic", accent, className, float = true }: OrbProps) {
  const style = accent
    ? ({
        "--hot": accent,
        "--cool": `color-mix(in oklab, ${accent} 58%, white)`,
      } as CSSProperties)
    : undefined;
  return (
    <span
      aria-hidden
      data-tone={tone}
      style={style}
      className={`orb ${float ? "orb-float" : ""} ${className ?? ""}`}
    />
  );
}
