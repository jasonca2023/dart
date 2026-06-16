type Tone = "cinematic" | "energetic" | "luxe" | "playful" | "calm";

interface OrbProps {
  tone?: Tone;
  className?: string;
  float?: boolean;
}

// Decorative only — never a surface, never holds text (Hallmark orb rule).
export function Orb({ tone = "cinematic", className, float = true }: OrbProps) {
  return (
    <span
      aria-hidden
      data-tone={tone}
      className={`orb ${float ? "orb-float" : ""} ${className ?? ""}`}
    />
  );
}
