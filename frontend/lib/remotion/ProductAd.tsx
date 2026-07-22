import {
  AbsoluteFill,
  Easing,
  Img,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { AdSpec, Scene, Tone } from "../adSpec";
import { FONT_FAMILY } from "./fonts";

export interface ProductAdProps {
  productTitle: string;
  productImage: string;
  price: string;
  audience: string;
  durationInSeconds: number;
  aspectRatio: "16:9" | "1:1" | "4:5" | "9:16";
  accent: string;
  /** Optional brand logo (image URL/data-URL) — overlaid small in a corner. */
  brandLogo?: string;
  /** Whether the logo is a transparent cutout that can be safely knocked out to a
   * flat colour. Undefined keeps the legacy behaviour (knock out); only an
   * explicit `false` (an opaque logo) renders it as-is to avoid a solid block. */
  brandLogoKnockout?: boolean;
  /** Creative direction. When absent, a default banded spec is derived. */
  spec?: AdSpec;
}

// Render frame rate. Kept in sync with lib/render.ts and lib/adSpec.ts (which
// budget scene frames). Timing inside the renderer is authored in 30fps-frames
// and scaled by fps/30, so this only changes smoothness, not motion speed.
// Higher = smoother but ~proportionally slower to render in the browser.
const FPS_APP = 60;

const up = (s: string) => (s || "").toUpperCase();

// Pick readable text (ink or white) for a filled accent — so a yellow CTA isn't
// white-on-yellow.
function readableOn(hex: string): string {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  const r = parseInt(n.slice(0, 2), 16) || 0;
  const g = parseInt(n.slice(2, 4), 16) || 0;
  const b = parseInt(n.slice(4, 6), 16) || 0;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? "#141414" : "#ffffff";
}

// Tone-aware value line for the price moment (the CTA itself lives in the outro,
// where research says it belongs). Avoids "affordable" for luxe.
const PRICE_LEAD: Record<Tone, string> = {
  luxe: "Yours for",
  energetic: "For an affordable",
  techy: "Smart value at",
  calm: "For an affordable",
  playful: "All this for just",
  bold: "Get it for",
};

function useUnit() {
  const { width, height } = useVideoConfig();
  return Math.min(width, height) / 1080;
}

// Shared left margin so kicker / headline / price / CTA all hang off one column —
// the consistent baseline reads as "designed", not centered-by-default.
function margin(u: number, portrait: boolean) {
  return (portrait ? 76 : 124) * u;
}

// --- Type fitting ---------------------------------------------------------
// Every mood sizes headlines from copy it is handed at render time, and real
// product titles run long ("2026 Model HDMI DVD Player for TV"), so a bad
// estimate clips the ad. These used to be a dozen different magic numbers
// scattered per mood; they are now one pair of constants and three helpers.
//
// The numbers are average glyph advances in ems, measured generously on
// purpose: type set a little small is barely noticeable, type that overflows
// the frame is a broken ad. Uppercase runs noticeably wider than mixed case.
const CHAR_EM_UPPER = 0.68;
const CHAR_EM_MIXED = 0.56;

// Per-glyph em-advances for the heavy uppercase grotesque the display type uses.
// A char-count × average estimate underestimates words packed with wide caps
// (M, W, G, O), so those still overflowed and clipped. These are measured a
// touch generously on purpose — type set a hair small is invisible; type that
// runs off the frame is a broken ad.
const UPPER_ADV: Record<string, number> = {
  A: 0.73, B: 0.70, C: 0.75, D: 0.77, E: 0.65, F: 0.62, G: 0.79, H: 0.79,
  I: 0.30, J: 0.56, K: 0.72, L: 0.60, M: 0.95, N: 0.80, O: 0.81, P: 0.66,
  Q: 0.82, R: 0.72, S: 0.68, T: 0.64, U: 0.78, V: 0.73, W: 1.02, X: 0.72,
  Y: 0.70, Z: 0.66,
  "0": 0.70, "1": 0.48, "2": 0.68, "3": 0.68, "4": 0.72, "5": 0.68, "6": 0.70,
  "7": 0.64, "8": 0.70, "9": 0.70,
  " ": 0.34, ".": 0.32, ",": 0.32, "$": 0.70, "%": 0.92, "&": 0.85, "-": 0.44,
  "'": 0.26, "!": 0.34, "?": 0.60, "/": 0.46, ":": 0.32, "+": 0.60,
};
const UPPER_ADV_DEFAULT = 0.74;

// Total em-advance of a string as it would render in uppercase.
function upperAdvance(text: string): number {
  let w = 0;
  for (const ch of (text || "").toUpperCase()) w += UPPER_ADV[ch] ?? UPPER_ADV_DEFAULT;
  return Math.max(0.5, w);
}

// The widest single word's advance — the binding constraint when a block wraps
// (a long word like "UNCOMPROMISING" may not overflow its own line).
function widestWordAdvance(text: string): number {
  return (text || "").split(/\s+/).filter(Boolean).reduce((mx, wd) => Math.max(mx, upperAdvance(wd)), 0.5);
}

// Largest size at which `chars` characters span at most `avail` px, bounded by
// `cap`. A count-based bound (no glyphs known) — used for conservative floors.
function fitChars(avail: number, chars: number, cap: number, upper = false): number {
  return Math.min(cap, avail / Math.max(1, chars * (upper ? CHAR_EM_UPPER : CHAR_EM_MIXED)));
}

// For text pinned to ONE line (a price, a nowrap value): the whole string fits.
// Uppercase uses the real per-glyph table so wide words don't clip.
function fitLine(avail: number, text: string, cap: number, upper = false): number {
  if (upper) return Math.min(cap, avail / upperAdvance(text));
  return fitChars(avail, (text || "").length, cap, upper);
}

// For a block allowed to WRAP: the whole string has to fit across `lines`
// lines, AND no single word may overflow its line.
function fitBlock(avail: number, text: string, cap: number, lines = 2, upper = false): number {
  if (upper) {
    return Math.min(cap, (avail * lines) / upperAdvance(text), avail / widestWordAdvance(text));
  }
  return Math.min(
    fitChars(avail * lines, (text || "").length, cap, upper),
    fitChars(avail, longestWord(text), cap, upper),
  );
}

function longestWord(text: string): number {
  return (text || "").split(/\s+/).reduce((mx, w) => Math.max(mx, w.length), 1);
}

interface SceneProps {
  spec: AdSpec;
  scene: Scene;
  productImage: string;
  portrait: boolean;
  /** Wide (16:9) gets the horizontal hero layouts; square/vertical stack. */
  wide: boolean;
  /** Brand logo — only the outro renders it, as the end-card sign-off. */
  brandLogo?: string;
  brandLogoKnockout?: boolean;
}


// ===========================================================================
// Kinetic treatment (energetic mood only). A purpose-built motion vocabulary —
// overshoot pop, blur-to-focus, line-wipe, character stagger, a virtual camera
// push with parallax, and a color-flood price slam — mapped onto the SAME spec
// scene list (hook/hero/feature/price/outro) so timing, duration and formats
// still come from buildAdSpec. Only tone === "energetic" takes this path; the
// other five moods render unchanged through SceneView above.
// ===========================================================================

// Overshoot pop: a spring that shoots a little past 1 and settles (vs the shipped
// high-damping ease-out). This is what makes a word/price "punch". `delay` is
// authored in 30fps-frames and scaled to the real fps so timing holds at any
// frame rate (springs themselves are already time-based).
function usePop(delay: number, damping = 14) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay * (fps / 30), fps, config: { damping, stiffness: 120, mass: 0.8 } });
}

// Character-stagger reveal — each glyph pops up in turn (typed energy, not a
// block fade).
const CharStagger: React.FC<{
  text: string;
  delay: number;
  per: number;
  fontSize: number;
  weight: number;
  color: string;
  letterSpacing?: number;
}> = ({ text, delay, per, fontSize, weight, color, letterSpacing = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const k = fps / 30;
  return (
    <div style={{ display: "flex", flexWrap: "wrap" }}>
      {(text || "").split("").map((ch, i) => {
        const s = spring({ frame: frame - (delay + i * per) * k, fps, config: { damping: 15, stiffness: 120, mass: 0.8 } });
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              whiteSpace: "pre",
              opacity: interpolate(s, [0, 0.6], [0, 1], { extrapolateRight: "clamp" }),
              transform: `translateY(${interpolate(s, [0, 1], [fontSize * 0.5, 0])}px) scale(${interpolate(s, [0, 1], [0.7, 1])})`,
              color,
              fontSize,
              fontWeight: weight,
              letterSpacing,
              lineHeight: 1,
            }}
          >
            {ch}
          </span>
        );
      })}
    </div>
  );
};

// K1 · Flash hook — product punches in out of a blur (blur-to-focus keeps the
// eye resolving the image) while a tracked kicker char-staggers and a rule wipes.
const KFlashHook: React.FC<SceneProps> = ({ spec, productImage, portrait }) => {
  const u = useUnit();
  const k = useVideoConfig().fps / 30;
  const { panel, accent, text } = spec.palette;
  const pop = usePop(2, 17);
  const blur = interpolate(pop, [0, 1], [20, 0]);
  const scale = interpolate(pop, [0, 1], [1.16, 1.03]);
  const frame = useCurrentFrame();
  const rule = interpolate(frame, [10 * k, 22 * k], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const m = margin(u, portrait);
  return (
    <AbsoluteFill style={{ backgroundColor: panel, overflow: "hidden" }}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <Img
          src={productImage}
          crossOrigin="anonymous"
          style={{
            width: portrait ? "82%" : "62%",
            maxHeight: portrait ? "62%" : "76%",
            objectFit: "contain",
            filter: `blur(${blur}px) drop-shadow(0 30px 60px rgba(0,0,0,0.5))`,
            transform: `scale(${scale})`,
            opacity: interpolate(pop, [0, 0.4], [0, 1], { extrapolateRight: "clamp" }),
          }}
        />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          backgroundImage: portrait
            ? `linear-gradient(to top, ${panel} 2%, ${panel}cc 20%, ${panel}00 46%)`
            : `linear-gradient(to right, ${panel} 0%, ${panel}cc 22%, ${panel}00 46%)`,
        }}
      />
      <AbsoluteFill style={{ justifyContent: portrait ? "flex-end" : "center", padding: portrait ? `0 ${m}px ${64 * u}px` : `0 ${m}px` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 * u }}>
          <div style={{ width: interpolate(rule, [0, 1], [0, 70 * u]), height: 5 * u, backgroundColor: accent, flexShrink: 0 }} />
          <CharStagger text={up(spec.eyebrow)} delay={6} per={1.4} fontSize={(portrait ? 24 : 30) * u} weight={800} color={text} letterSpacing={5 * u} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// K2 · Kinetic hero — headline words slam in (overshoot + line-wipe) while the
// product holds behind a VIRTUAL CAMERA push and a parallax wordmark; an accent
// bar sweeps across. Depth + rhythm the flat cards never had.
const KHero: React.FC<SceneProps> = ({ spec, scene, productImage, portrait }) => {
  const u = useUnit();
  const { fps, width } = useVideoConfig();
  const frame = useCurrentFrame();
  const k = fps / 30;
  const { panel, accent, text } = spec.palette;
  const p = interpolate(frame, [0, scene.frames], [0, 1], { extrapolateRight: "clamp" });
  const cam = interpolate(p, [0, 1], [1.0, 1.12]);
  const bgX = interpolate(p, [0, 1], [40 * u, -90 * u]);
  const prodX = interpolate(p, [0, 1], [10 * u, -22 * u]);
  // Wipe reveal: a glowing accent edge sweeps across ONCE, revealing the product
  // as it passes, then continues off-frame and fades. The line now has a purpose
  // (it IS the reveal) and never parks on screen.
  const rev = interpolate(frame, [4 * k, 22 * k], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const barPos = rev * 114; // % across the frame; ends off the right edge
  const prodClip = `inset(0 ${Math.max(0, 100 - rev * 118)}% 0 0)`;
  const barOpacity = interpolate(rev, [0, 0.06, 0.82, 1], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const words = up(spec.headline).split(" ").filter(Boolean);
  // Fit the slam to ANY headline: cap the size so the longest word can't overflow
  // the column (condensed caps advance ~0.5em/char). Long product-title headlines
  // then wrap across lines instead of clipping.
  const avail = width - 2 * margin(u, portrait);
  const hlSize = fitBlock(avail, spec.headline, (portrait ? 90 : 118) * u, 3);
  // Product sits in the upper band, the slam hangs off the bottom over a strong
  // scrim — so the headline is legible in EVERY format (a centered headline over
  // a centered product goes unreadable on square/landscape).
  const scrim = `linear-gradient(to top, ${panel} 10%, ${panel}e6 32%, ${panel}00 62%)`;
  return (
    <AbsoluteFill style={{ backgroundColor: panel, overflow: "hidden" }}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: "4%" }}>
        <div
          style={{
            transform: `translateX(${bgX}px) scale(${cam * 1.04})`,
            color: text,
            opacity: 0.05,
            fontSize: 340 * u,
            fontWeight: 800,
            whiteSpace: "nowrap",
            letterSpacing: -6 * u,
          }}
        >
          {up(words[0] || "NEW")}
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: portrait ? "8%" : "5%" }}>
        <Img
          src={productImage}
          crossOrigin="anonymous"
          style={{
            width: portrait ? "78%" : "54%",
            maxHeight: portrait ? "56%" : "64%",
            objectFit: "contain",
            filter: "drop-shadow(0 34px 64px rgba(0,0,0,0.55))",
            transform: `translateX(${prodX}px) scale(${cam})`,
            clipPath: prodClip,
          }}
        />
      </AbsoluteFill>
      <div
        style={{
          position: "absolute",
          top: "-4%",
          bottom: "-4%",
          left: `${barPos}%`,
          width: 6 * u,
          marginLeft: -3 * u,
          backgroundColor: accent,
          opacity: barOpacity,
          filter: `blur(${1.2 * u}px)`,
          boxShadow: `0 0 ${28 * u}px ${accent}, 0 0 ${8 * u}px ${accent}`,
        }}
      />
      <AbsoluteFill style={{ backgroundImage: scrim }} />
      <AbsoluteFill style={{ justifyContent: "flex-end", padding: `0 ${margin(u, portrait)}px ${(portrait ? 90 : 64) * u}px` }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignContent: "flex-start", gap: `${hlSize * 0.04}px ${hlSize * 0.24}px`, maxWidth: "100%" }}>
          {words.map((w, i) => {
            const s = spring({ frame: frame - (6 + i * 4) * k, fps, config: { damping: 14, stiffness: 120, mass: 0.8 } });
            const accentWord = i === words.length - 1;
            return (
              <div key={i} style={{ overflow: "hidden", clipPath: `inset(0 ${interpolate(s, [0, 1], [100, 0])}% 0 0)`, paddingBottom: hlSize * 0.04 }}>
                <span
                  style={{
                    display: "inline-block",
                    transform: `translateY(${interpolate(s, [0, 1], [22, 0])}px) scale(${interpolate(s, [0, 1], [1.1, 1])})`,
                    transformOrigin: "left bottom",
                    color: accentWord ? accent : text,
                    fontSize: hlSize,
                    fontWeight: 800,
                    letterSpacing: -2 * u,
                    lineHeight: 0.9,
                  }}
                >
                  {w}
                </span>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// K3 · Feature pin — a call-out chip WIPES in and pins to the product with a
// connector dot; the product ken-burns behind it. The product is annotated.
const KFeature: React.FC<SceneProps> = ({ spec, scene, productImage, portrait }) => {
  const u = useUnit();
  const { onStage, accent } = spec.palette;
  const frame = useCurrentFrame();
  const kb = interpolate(frame, [0, scene.frames], [1.0, 1.06], { extrapolateRight: "clamp" });
  const chip = usePop(6, 16);
  return (
    <AbsoluteFill style={{ backgroundColor: onStage, overflow: "hidden" }}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <Img
          src={productImage}
          crossOrigin="anonymous"
          style={{
            width: portrait ? "74%" : "56%",
            maxHeight: portrait ? "64%" : "78%",
            objectFit: "contain",
            filter: "drop-shadow(0 30px 60px rgba(0,0,0,0.5))",
            transform: `scale(${kb})`,
          }}
        />
      </AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: portrait ? "34%" : "42%",
          width: 14 * u,
          height: 14 * u,
          marginLeft: -7 * u,
          borderRadius: "50%",
          backgroundColor: accent,
          opacity: chip,
          boxShadow: `0 0 0 ${6 * u}px ${accent}33`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: margin(u, portrait),
          bottom: (portrait ? 130 : 110) * u,
          transform: `translateX(${interpolate(chip, [0, 1], [-40 * u, 0])}px)`,
          clipPath: `inset(0 ${interpolate(chip, [0, 1], [100, 0])}% 0 0)`,
          backgroundColor: accent,
          color: readableOn(accent),
          padding: `${20 * u}px ${28 * u}px`,
          borderRadius: 3 * u,
          display: "flex",
          flexDirection: "column",
          gap: 8 * u,
          maxWidth: "66%",
        }}
      >
        <span style={{ fontSize: (portrait ? 17 : 20) * u, letterSpacing: 3 * u, fontWeight: 800, opacity: 0.8 }}>{up(scene.label || spec.eyebrow)}</span>
        <span style={{ fontSize: (portrait ? 40 : 52) * u, fontWeight: 800, lineHeight: 0.98, letterSpacing: -0.5 * u }}>{scene.value || spec.subhead}</span>
      </div>
    </AbsoluteFill>
  );
};

// K4 · Price slam — THE SIGNATURE MOMENT. An accent field floods up, the price
// punches in oversized on heavy overshoot and settles (tabular), a value tag
// drops in above. The beat the ad is remembered by.
const KPrice: React.FC<SceneProps> = ({ spec, scene, portrait }) => {
  const u = useUnit();
  const { accent } = spec.palette;
  const ink = readableOn(accent);
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const k = fps / 30;
  const flood = interpolate(frame, [0, 9 * k], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const slam = usePop(7, 13);
  const lead = usePop(4, 17);
  const rule = interpolate(frame, [20 * k, 32 * k], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill
      style={{
        backgroundColor: accent,
        justifyContent: "center",
        alignItems: "center",
        overflow: "hidden",
        // The number's line box is shorter than its glyphs, so without a gap the
        // digits ride up over the lead line.
        gap: 12 * u,
        clipPath: `inset(0 0 ${interpolate(flood, [0, 1], [100, 0])}% 0)`,
      }}
    >
      <div
        style={{
          opacity: interpolate(lead, [0, 0.6], [0, 1], { extrapolateRight: "clamp" }),
          transform: `translateY(${interpolate(lead, [0, 1], [-20, 0])}px)`,
          color: ink,
          fontSize: (portrait ? 26 : 34) * u,
          fontWeight: 800,
          letterSpacing: 7 * u,
        }}
      >
        {up(PRICE_LEAD[spec.tone])}
      </div>
      <div
        style={{
          transform: `scale(${interpolate(slam, [0, 1], [0.3, 1])})`,
          color: ink,
          fontSize: fitLine(width - 2 * margin(u, portrait), scene.value ?? "", (portrait ? 220 : 320) * u),
          fontWeight: 800,
          lineHeight: 1,
          letterSpacing: -8 * u,
          whiteSpace: "nowrap",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {scene.value}
      </div>
      <div style={{ marginTop: 18 * u, width: interpolate(rule, [0, 1], [0, 200 * u]), height: 6 * u, backgroundColor: ink }} />
    </AbsoluteFill>
  );
};

// K5 · CTA card — a color flood carries out of the price into the sign-off:
// brand logo (knockout) or title, plus a CTA pill that pops. Continuity, not a cut.
const KOutro: React.FC<SceneProps> = ({ spec, portrait, brandLogo, brandLogoKnockout }) => {
  const u = useUnit();
  const { width } = useVideoConfig();
  const { panel, accent, text } = spec.palette;
  const m = margin(u, portrait);
  const title = usePop(3, 18);
  const pill = usePop(10, 15);
  const logoIn = usePop(3, 18);
  // Fit the sign-off title so a long product-title headline can't overflow.
  const titleSize = fitBlock(width - 2 * m, up(spec.headline), (portrait ? 74 : 104) * u, 3, true);
  if (brandLogo) {
    const knockout = brandLogoKnockout !== false;
    // Knock the mark out to whatever reads on the panel: white on a dark panel,
    // black on a light one (a plain invert-to-white would vanish on light bg).
    const knockoutFilter =
      readableOn(panel) === "#ffffff" ? "brightness(0) invert(1)" : "brightness(0)";
    return (
      <AbsoluteFill style={{ backgroundColor: panel, justifyContent: "center", alignItems: "center", flexDirection: "column", gap: 42 * u, padding: `0 ${m}px`, overflow: "hidden" }}>
        <Img
          src={brandLogo}
          crossOrigin="anonymous"
          style={{
            height: (portrait ? 60 : 84) * u,
            width: "auto",
            maxWidth: "66%",
            objectFit: "contain",
            opacity: interpolate(logoIn, [0, 0.6], [0, 1], { extrapolateRight: "clamp" }),
            transform: `scale(${interpolate(logoIn, [0, 1], [0.7, 1])})`,
            ...(knockout ? { filter: knockoutFilter } : {}),
          }}
        />
        <div
          style={{
            transform: `scale(${interpolate(pill, [0, 1], [0.6, 1])})`,
            padding: `${18 * u}px ${40 * u}px`,
            backgroundColor: accent,
            color: readableOn(accent),
            fontSize: 30 * u,
            fontWeight: 800,
            letterSpacing: 1 * u,
            borderRadius: 6 * u,
          }}
        >
          {`${up(spec.cta)}  →`}
        </div>
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ backgroundColor: panel, justifyContent: "center", alignItems: "flex-start", padding: `0 ${m}px`, overflow: "hidden" }}>
      <div
        style={{
          opacity: interpolate(title, [0, 0.6], [0, 1], { extrapolateRight: "clamp" }),
          transform: `translateY(${interpolate(title, [0, 1], [30, 0])}px)`,
          color: text,
          fontSize: titleSize,
          fontWeight: 800,
          lineHeight: 0.92,
          letterSpacing: -2 * u,
          maxWidth: "16ch",
          marginBottom: 40 * u,
        }}
      >
        {up(spec.headline)}
      </div>
      <div
        style={{
          transform: `scale(${interpolate(pill, [0, 1], [0.6, 1])})`,
          transformOrigin: "left",
          padding: `${18 * u}px ${40 * u}px`,
          backgroundColor: accent,
          color: readableOn(accent),
          fontSize: (portrait ? 26 : 30) * u,
          fontWeight: 800,
          letterSpacing: 1 * u,
          borderRadius: 6 * u,
        }}
      >
        {`${up(spec.cta)}  →`}
      </div>
    </AbsoluteFill>
  );
};

// Dispatch a spec scene to its kinetic beat (energetic only).
const KineticBeat: React.FC<SceneProps> = (props) => {
  switch (props.scene.type) {
    case "hook":
      return <KFlashHook {...props} />;
    case "feature":
      return <KFeature {...props} />;
    case "price":
      return <KPrice {...props} />;
    case "outro":
      return <KOutro {...props} />;
    case "benefit":
      return <KFlashHook {...props} />;
    default:
      return <KHero {...props} />;
  }
};

// ===========================================================================
// LUXE — slow, editorial, restrained. The opposite of energetic: no overshoot,
// no color-flood, no wipe. Everything eases in-out slowly; the serif tracks in
// (letter-spacing contracts); thin gold hairlines draw; a soft specular light
// glides over the product; beats cross-dissolve (content fades up over the
// shared panel). Research: luxury reads through slow ease-in-out and restraint.
// ===========================================================================

const EASE_LUX = Easing.inOut(Easing.ease);

// Slow eased 0..1 over [delay, delay+dur], authored at 30fps and fps-scaled.
function useSlow(delay: number, dur: number) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const k = fps / 30;
  return interpolate(frame, [delay * k, (delay + dur) * k], [0, 1], {
    easing: EASE_LUX,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

// Serif headline that TRACKS IN: the line fades up while its letter-spacing
// contracts from wide to set — an unhurried, couture reveal (never per-word pop).
const LuxeSerif: React.FC<{
  text: string;
  size: number;
  color: string;
  delay: number;
  u: number;
  maxWidth?: number | string;
  align?: "left" | "center";
}> = ({ text, size, color, delay, u, maxWidth, align = "left" }) => {
  const a = useSlow(delay, 34);
  return (
    <div
      style={{
        opacity: a,
        transform: `translateY(${interpolate(a, [0, 1], [size * 0.16, 0])}px)`,
        letterSpacing: interpolate(a, [0, 1], [size * 0.12, -size * 0.012]),
        color,
        fontWeight: 600,
        fontSize: size,
        lineHeight: 1.04,
        maxWidth,
        textAlign: align,
        textWrap: "balance",
      }}
    >
      {text}
    </div>
  );
};

// A soft specular highlight that glides once across the frame — light catching a
// premium surface. Subtle (low opacity, blurred, skewed).
const Specular: React.FC<{ u: number; delay?: number }> = ({ u, delay = 0 }) => {
  const g = useSlow(delay, 46);
  return (
    <div
      style={{
        position: "absolute",
        top: "-25%",
        bottom: "-25%",
        left: `${interpolate(g, [0, 1], [-45, 125])}%`,
        width: "38%",
        background: "linear-gradient(105deg, transparent, #ffffff 50%, transparent)",
        opacity: 0.1,
        filter: `blur(${18 * u}px)`,
        transform: "skewX(-12deg)",
        pointerEvents: "none",
      }}
    />
  );
};

// Small tracked gold kicker, slow fade + tracking-in.
const LuxeKicker: React.FC<{ text: string; accent: string; u: number; delay: number; align?: "left" | "center" }> = ({
  text,
  accent,
  u,
  delay,
  align = "left",
}) => {
  const a = useSlow(delay, 30);
  if (!text) return null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16 * u,
        opacity: a,
        justifyContent: align === "center" ? "center" : "flex-start",
      }}
    >
      <span style={{ width: interpolate(a, [0, 1], [0, 40 * u]), height: 1 * u, backgroundColor: accent }} />
      <span style={{ color: accent, fontSize: 15 * u, fontWeight: 600, letterSpacing: interpolate(a, [0, 1], [8 * u, 4 * u]) }}>
        {up(text)}
      </span>
    </div>
  );
};

// L1 · Hook — a lit gallery still-life. A thin gold frame contains the negative
// space so it reads as curated, not empty; the product sits in a warm pool of
// light on a soft horizon; a gold kicker + serif line anchor the lower-left.
const LuxeHook: React.FC<SceneProps> = ({ spec, scene, productImage, portrait }) => {
  const u = useUnit();
  const frame = useCurrentFrame();
  const { panel, accent, text } = spec.palette;
  const darkPanel = readableOn(panel) === "#ffffff";
  const enter = useSlow(0, 30);
  const draw = useSlow(6, 34);
  const line = useSlow(16, 26);
  const kb = interpolate(frame, [0, scene.frames], [1.0, 1.05], { extrapolateRight: "clamp", easing: EASE_LUX });
  // Warm pool of light on a dark panel; a soft dark vignette on a light one — so
  // the product is lit from behind rather than floating on flat colour.
  const pool = darkPanel ? "rgba(255,244,226,0.16)" : "rgba(38,28,14,0.07)";
  // A soft horizon the product rests on, low and wide.
  const horizon = darkPanel ? "rgba(255,240,214,0.12)" : "rgba(30,22,10,0.05)";
  const inset = interpolate(draw, [0, 1], [(portrait ? 30 : 44) * u, (portrait ? 42 : 60) * u]);
  const dim = darkPanel ? `${text}88` : `${text}aa`;
  return (
    <AbsoluteFill style={{ backgroundColor: panel, overflow: "hidden" }}>
      {/* pool of light behind the product + a low horizon it sits on */}
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 58% 52% at 50% 44%, ${pool}, transparent 66%)`, opacity: enter }} />
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 70% 26% at 50% 66%, ${horizon}, transparent 72%)`, opacity: enter }} />
      {/* thin gold gallery frame — contains the composition */}
      <div style={{ position: "absolute", top: inset, left: inset, right: inset, bottom: inset, border: `${1 * u}px solid ${accent}`, opacity: draw * 0.6, pointerEvents: "none" }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingBottom: portrait ? "6%" : "4%" }}>
        <div style={{ position: "relative", opacity: enter, transform: `scale(${kb})` }}>
          <Img
            src={productImage}
            crossOrigin="anonymous"
            style={{
              width: portrait ? "86%" : "66%",
              maxHeight: portrait ? "62%" : "74%",
              objectFit: "contain",
              filter: "drop-shadow(0 34px 64px rgba(0,0,0,0.5))",
            }}
          />
        </div>
      </AbsoluteFill>
      {/* Specular clipped to a centred zone over the product — a surface glint. */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingBottom: portrait ? "6%" : "4%", pointerEvents: "none" }}>
        <div style={{ position: "relative", width: portrait ? "86%" : "66%", height: portrait ? "62%" : "74%", overflow: "hidden" }}>
          <Specular u={u} delay={4} />
        </div>
      </AbsoluteFill>
      {/* kicker + a quiet serif line, anchored inside the frame at lower-left */}
      <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "flex-start", padding: `0 0 ${(portrait ? 78 : 74) * u}px ${inset + (portrait ? 22 : 30) * u}px` }}>
        <LuxeKicker text={spec.eyebrow} accent={accent} u={u} delay={10} align="left" />
        {spec.subhead ? (
          <div style={{ marginTop: 16 * u, color: dim, fontWeight: 600, fontSize: (portrait ? 26 : 30) * u, lineHeight: 1.15, letterSpacing: -0.3 * u, maxWidth: portrait ? "80%" : "42%", opacity: line }}>
            {spec.subhead}
          </div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// L2 · Hero — editorial: an oversized serif headline tracks in up top, a thin
// gold hairline draws, and the product rests on a light stage strip below.
const LuxeHero: React.FC<SceneProps> = ({ spec, scene, productImage, portrait }) => {
  const u = useUnit();
  const { width } = useVideoConfig();
  const { panel, stage, accent, text, onStage } = spec.palette;
  const rule = useSlow(12, 26);
  const m = margin(u, portrait);
  const frame = useCurrentFrame();
  const kb = interpolate(frame, [0, scene.frames], [1.04, 1.0], { extrapolateRight: "clamp", easing: EASE_LUX });
  const size = fitBlock(width - 2 * m, spec.headline, (portrait ? 72 : 100) * u, 3);
  const topH = portrait ? "50%" : "54%";
  return (
    <AbsoluteFill style={{ backgroundColor: panel }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: topH, padding: `0 ${m}px`, display: "flex", flexDirection: "column", justifyContent: "center", overflow: "hidden" }}>
        <LuxeKicker text={spec.eyebrow} accent={accent} u={u} delay={2} />
        <div style={{ height: 20 * u }} />
        <LuxeSerif text={spec.headline} size={size} color={text} delay={5} u={u} maxWidth={portrait ? "16ch" : "15ch"} />
      </div>
      <div style={{ position: "absolute", top: topH, left: 0, right: 0, bottom: 0, overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, left: m, width: interpolate(rule, [0, 1], [0, 200 * u]), height: 1.5 * u, backgroundColor: accent, zIndex: 2 }} />
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", backgroundColor: stage, backgroundImage: `linear-gradient(176deg, ${onStage}08, ${stage} 60%)` }}>
          <Img
            src={productImage}
            crossOrigin="anonymous"
            style={{ width: portrait ? "72%" : "48%", maxHeight: "82%", objectFit: "contain", transform: `scale(${kb})`, filter: "drop-shadow(0 22px 40px rgba(0,0,0,0.16))" }}
          />
          <Specular u={u} delay={6} />
        </AbsoluteFill>
      </div>
    </AbsoluteFill>
  );
};

// L3 · Price — understated value, never a slam: a tracked gold lead, a large
// serif figure that fades and settles (no overshoot), a fine gold rule.
const LuxePrice: React.FC<SceneProps> = ({ spec, scene, portrait }) => {
  const u = useUnit();
  const { width } = useVideoConfig();
  const { panel, accent, text } = spec.palette;
  const lead = useSlow(2, 28);
  // The number no longer just fades up — it LIFTS from behind the rule, masked,
  // like a card being turned over. The rule draws first so there is something
  // for the digits to emerge from, and a specular pass crosses them once they
  // land. Slow and deliberate, but an actual moment rather than an opacity ramp.
  // Timed so the number is fully landed with room to sit — the scene is only
  // ~2s and a reveal that finishes at the cut isn't a reveal.
  const rule = useSlow(4, 16);
  const lift = useSlow(9, 26);
  const m = margin(u, portrait);
  const value = scene.value ?? "";
  const size = fitLine(width - 2 * m, value, (portrait ? 150 : 210) * u);
  return (
    <AbsoluteFill style={{ backgroundColor: panel, justifyContent: "center", alignItems: "flex-start", padding: `0 ${m}px`, overflow: "hidden" }}>
      <div style={{ opacity: lead, color: accent, fontSize: (portrait ? 20 : 24) * u, fontWeight: 600, letterSpacing: interpolate(lead, [0, 1], [8 * u, 4 * u]), marginBottom: 22 * u }}>
        {up(PRICE_LEAD[spec.tone])}
      </div>
      <div style={{ width: interpolate(rule, [0, 1], [0, size * value.length * 0.5]), height: 1.5 * u, backgroundColor: accent, marginBottom: 18 * u }} />
      {/* The mask: digits translate up from fully below the clip edge. */}
      <div style={{ position: "relative", overflow: "hidden", paddingBottom: size * 0.08 }}>
        <div
          style={{
            transform: `translateY(${interpolate(lift, [0, 1], [110, 0])}%)`,
            color: text,
            fontWeight: 600,
            fontSize: size,
            lineHeight: 1,
            letterSpacing: -4 * u,
            whiteSpace: "nowrap",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// L4 · Outro — a quiet sign-off: logo (knockout, panel-aware) or the serif name,
// a drawn gold hairline, and a tracked "SHOP NOW" link (no loud filled button).
const LuxeOutro: React.FC<SceneProps> = ({ spec, portrait, brandLogo, brandLogoKnockout }) => {
  const u = useUnit();
  const { width } = useVideoConfig();
  const { panel, accent, text } = spec.palette;
  const m = margin(u, portrait);
  const inn = useSlow(3, 32);
  const rule = useSlow(14, 24);
  const cta = useSlow(20, 24);
  const size = fitBlock(width - 2 * m, spec.headline, (portrait ? 66 : 92) * u, 3);
  const knockoutFilter = readableOn(panel) === "#ffffff" ? "brightness(0) invert(1)" : "brightness(0)";
  return (
    <AbsoluteFill style={{ backgroundColor: panel, justifyContent: "center", alignItems: "center", flexDirection: "column", padding: `0 ${m}px` }}>
      {brandLogo ? (
        <Img
          src={brandLogo}
          crossOrigin="anonymous"
          style={{ height: (portrait ? 56 : 78) * u, width: "auto", maxWidth: "64%", objectFit: "contain", opacity: inn, ...(brandLogoKnockout !== false ? { filter: knockoutFilter } : {}) }}
        />
      ) : (
        <div style={{ opacity: inn, transform: `translateY(${interpolate(inn, [0, 1], [14, 0])}px)`, color: text, fontWeight: 600, fontSize: size, lineHeight: 1.02, letterSpacing: -1 * u, textAlign: "center", maxWidth: "16ch" }}>
          {spec.headline}
        </div>
      )}
      <div style={{ marginTop: 30 * u, width: interpolate(rule, [0, 1], [0, 120 * u]), height: 1.5 * u, backgroundColor: accent }} />
      <div style={{ marginTop: 26 * u, opacity: cta, color: accent, fontSize: (portrait ? 18 : 22) * u, fontWeight: 600, letterSpacing: 5 * u }}>
        {`${up(spec.cta)}  →`}
      </div>
    </AbsoluteFill>
  );
};

// Dispatch a spec scene to its luxe beat (luxe has no feature beat).
const LuxeBeat: React.FC<SceneProps> = (props) => {
  switch (props.scene.type) {
    case "hook":
      return <LuxeHook {...props} />;
    case "price":
      return <LuxePrice {...props} />;
    case "outro":
      return <LuxeOutro {...props} />;
    case "benefit":
      return <LuxeHook {...props} />;
    default:
      return <LuxeHero {...props} />;
  }
};

// ===========================================================================
// TECHY — HUD / terminal. Monospace (JetBrains Mono), a faint measurement grid,
// scanlines, the product framed by HUD corner brackets with a crosshair callout,
// typewriter headlines with a blinking cursor, and a price that counts up like an
// odometer. Snappy and precise — engineered, not athletic. Research: tech reads
// through typewriter/terminal, scanlines, HUD panels and mechanical precision.
// ===========================================================================

// Faint measurement grid.
const TechGrid: React.FC<{ color: string; u: number }> = ({ color, u }) => (
  <AbsoluteFill
    style={{
      backgroundImage: `linear-gradient(${color}12 1px, transparent 1px), linear-gradient(90deg, ${color}12 1px, transparent 1px)`,
      backgroundSize: `${46 * u}px ${46 * u}px`,
    }}
  />
);

// CRT scanline overlay.
const Scanlines: React.FC<{ u: number }> = ({ u }) => (
  <AbsoluteFill
    style={{
      backgroundImage: `repeating-linear-gradient(0deg, rgba(255,255,255,0.035), rgba(255,255,255,0.035) ${1 * u}px, transparent ${1 * u}px, transparent ${4 * u}px)`,
      pointerEvents: "none",
    }}
  />
);

// Monospace typewriter with a blinking block cursor. `cps` = chars/second.
const Typewriter: React.FC<{
  text: string;
  delay: number;
  cps: number;
  size: number;
  color: string;
  cursor: string;
  weight?: number;
  maxWidth?: number | string;
}> = ({ text, delay, cps, size, color, cursor, weight = 500, maxWidth }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const k = fps / 30;
  const n = Math.max(0, Math.floor(((frame - delay * k) * cps) / fps));
  const shown = (text || "").slice(0, n);
  const done = n >= (text || "").length;
  const blink = Math.floor(frame / (fps * 0.4)) % 2 === 0;
  return (
    <div style={{ color, fontSize: size, fontWeight: weight, lineHeight: 1.18, maxWidth, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
      {shown}
      <span style={{ color: cursor, opacity: !done || blink ? 1 : 0 }}>▊</span>
    </div>
  );
};

// HUD corner brackets that frame a region, scaling/fading in.
const HudBrackets: React.FC<{ color: string; u: number; o: number }> = ({ color, u, o }) => {
  const L = 34 * u;
  const t = 2 * u;
  const inset = interpolate(o, [0, 1], [24 * u, 0]);
  const corner = (pos: React.CSSProperties): React.CSSProperties => ({ position: "absolute", width: L, height: L, opacity: o, ...pos });
  return (
    <>
      <div style={{ ...corner({ top: inset, left: inset }), borderTop: `${t}px solid ${color}`, borderLeft: `${t}px solid ${color}` }} />
      <div style={{ ...corner({ top: inset, right: inset }), borderTop: `${t}px solid ${color}`, borderRight: `${t}px solid ${color}` }} />
      <div style={{ ...corner({ bottom: inset, left: inset }), borderBottom: `${t}px solid ${color}`, borderLeft: `${t}px solid ${color}` }} />
      <div style={{ ...corner({ bottom: inset, right: inset }), borderBottom: `${t}px solid ${color}`, borderRight: `${t}px solid ${color}` }} />
    </>
  );
};

// A bright hairline that sweeps top→bottom across its (relative) parent, looping,
// with a soft glow — the "scanning" motion that gives the instrument-panel life.
const ScanSweep: React.FC<{ color: string; u: number; period?: number }> = ({ color, u, period = 2.6 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = (frame % (fps * period)) / (fps * period);
  const y = interpolate(t, [0, 1], [-6, 106]);
  // Fade the line in at the top of its travel and out at the bottom.
  const o = interpolate(t, [0, 0.08, 0.92, 1], [0, 0.9, 0.9, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: `${y}%`, height: 2 * u, backgroundColor: color, opacity: o, boxShadow: `0 0 ${18 * u}px ${2 * u}px ${color}`, pointerEvents: "none" }} />
  );
};

// Parse a price string into a countable number + its prefix/suffix/decimals.
function parsePrice(s: string): { prefix: string; num: number; suffix: string; decimals: number } | null {
  const m = String(s || "").match(/^(\D*)([\d,]+(?:\.\d+)?)(.*)$/);
  if (!m) return null;
  const num = parseFloat(m[2].replace(/,/g, ""));
  if (!Number.isFinite(num)) return null;
  return { prefix: m[1], num, suffix: m[3], decimals: (m[2].split(".")[1] || "").length };
}

// A snappy scene-relative spring for techy (fast, precise, minimal overshoot).
function useSnap(delay: number) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay * (fps / 30), fps, config: { damping: 22, stiffness: 200, mass: 0.6 } });
}

// T1 · Hook — a boot-up: product framed by HUD brackets over a grid + scanlines,
// with a typewriter system line reading the product in.
const TechHook: React.FC<SceneProps> = ({ spec, productImage, portrait }) => {
  const u = useUnit();
  const { panel, text } = spec.palette;
  // On a light "blueprint" panel the neon accent is illegible, so HUD ink drops
  // to the dark text colour; on a dark terminal panel it stays the neon accent.
  const accent = readableOn(panel) === "#ffffff" ? spec.palette.accent : text;
  const o = useSnap(2);
  const m = margin(u, portrait);
  return (
    <AbsoluteFill style={{ backgroundColor: panel, overflow: "hidden" }}>
      <TechGrid color={text} u={u} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "relative", width: portrait ? "80%" : "64%", height: portrait ? "60%" : "74%", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          <HudBrackets color={accent} u={u} o={o} />
          <Img
            src={productImage}
            crossOrigin="anonymous"
            style={{ maxWidth: "84%", maxHeight: "84%", objectFit: "contain", opacity: interpolate(o, [0, 0.6], [0, 1], { extrapolateRight: "clamp" }), filter: "drop-shadow(0 20px 44px rgba(0,0,0,0.5))" }}
          />
          <ScanSweep color={accent} u={u} />
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ justifyContent: "flex-end", padding: portrait ? `0 ${m}px ${70 * u}px` : `0 ${m}px ${60 * u}px` }}>
        <Typewriter text={`> ${up(spec.eyebrow)}`} delay={8} cps={22} size={(portrait ? 20 : 24) * u} color={text} cursor={accent} weight={700} />
      </AbsoluteFill>
      <Scanlines u={u} />
    </AbsoluteFill>
  );
};

// T2 · Hero — an instrument panel. Landscape splits into a framed product bay
// (HUD brackets, crosshair, a sweeping scan line) and a data column where the
// headline types out under a live indicator. Portrait/square stack the two.
const TechHero: React.FC<SceneProps> = ({ spec, scene, productImage, portrait, wide }) => {
  const u = useUnit();
  const { width } = useVideoConfig();
  const { panel, text } = spec.palette;
  const accent = readableOn(panel) === "#ffffff" ? spec.palette.accent : text;
  const dim = readableOn(panel) === "#ffffff" ? `${text}99` : `${text}88`;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const o = useSnap(2);
  const kb = interpolate(frame, [0, scene.frames], [1.0, 1.04], { extrapolateRight: "clamp" });
  const m = margin(u, portrait);
  const cross = interpolate(o, [0, 1], [0, 1]);
  const blink = Math.floor(frame / (fps * 0.5)) % 2 === 0;
  // Text column width drives the headline size — full frame minus a margin when
  // stacked, roughly the right ~44% when split.
  const colW = wide ? width * 0.44 - m : width - 2 * m;
  const size = Math.min(
    fitBlock(colW, spec.headline, (portrait ? 44 : 58) * u, 3),
    fitChars(colW, 11, (portrait ? 44 : 58) * u),
  );

  // The framed product bay + its HUD overlays, reused by both layouts.
  const bay = (
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      <HudBrackets color={accent} u={u} o={o} />
      <Img
        src={productImage}
        crossOrigin="anonymous"
        style={{ maxWidth: "84%", maxHeight: "84%", objectFit: "contain", transform: `scale(${kb})`, filter: "drop-shadow(0 22px 48px rgba(0,0,0,0.5))", opacity: interpolate(o, [0, 0.6], [0, 1], { extrapolateRight: "clamp" }) }}
      />
      <ScanSweep color={accent} u={u} />
      {/* crosshair + status tag pinned near the top-right of the bay; inset more
          in portrait so the label doesn't run off the narrower frame */}
      <div style={{ position: "absolute", top: "16%", right: portrait ? "24%" : "12%", opacity: cross }}>
        <div style={{ width: 26 * u, height: 1.5 * u, backgroundColor: accent, position: "absolute", top: 0, left: -13 * u }} />
        <div style={{ height: 26 * u, width: 1.5 * u, backgroundColor: accent, position: "absolute", top: -13 * u, left: 0 }} />
        <div style={{ position: "absolute", left: 18 * u, top: -8 * u, color: accent, fontSize: 13 * u, fontWeight: 600, letterSpacing: 1 * u, whiteSpace: "nowrap" }}>
          [ SCANNING ]
        </div>
      </div>
    </div>
  );

  // The data column: live indicator, eyebrow, typed headline, subhead, scan bar.
  const dataCol = (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10 * u, marginBottom: 16 * u, opacity: o }}>
        <div style={{ width: 10 * u, height: 10 * u, borderRadius: "50%", backgroundColor: accent, opacity: blink ? 1 : 0.25, boxShadow: `0 0 ${10 * u}px ${accent}` }} />
        <span style={{ color: accent, fontSize: 15 * u, fontWeight: 700, letterSpacing: 3 * u }}>{up(spec.eyebrow)}</span>
      </div>
      <Typewriter text={spec.headline} delay={6} cps={26} size={size} color={text} cursor={accent} weight={700} maxWidth="18ch" />
      {spec.subhead ? (
        <div style={{ color: dim, fontSize: (portrait ? 18 : 20) * u, fontWeight: 500, lineHeight: 1.35, marginTop: 20 * u, maxWidth: "26ch", opacity: interpolate(o, [0.4, 1], [0, 1], { extrapolateLeft: "clamp" }) }}>
          {spec.subhead}
        </div>
      ) : null}
      <div style={{ marginTop: 30 * u, width: wide ? "80%" : "64%", height: 3 * u, backgroundColor: `${text}22`, opacity: o }}>
        <div style={{ width: `${interpolate(frame, [4 * (fps / 30), 40 * (fps / 30)], [0, 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}%`, height: "100%", backgroundColor: accent }} />
      </div>
    </>
  );

  return (
    <AbsoluteFill style={{ backgroundColor: panel, overflow: "hidden" }}>
      <TechGrid color={text} u={u} />
      {wide ? (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "stretch", padding: `${64 * u}px ${m}px` }}>
          <div style={{ width: "52%", position: "relative" }}>{bay}</div>
          <div style={{ width: 1.5 * u, backgroundColor: `${text}22`, margin: `${20 * u}px ${m * 0.5}px` }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>{dataCol}</div>
        </div>
      ) : (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", padding: `${72 * u}px ${m}px ${64 * u}px` }}>
          <div style={{ flex: 1.15, position: "relative", minHeight: 0 }}>{bay}</div>
          <div style={{ marginTop: 28 * u }}>{dataCol}</div>
        </div>
      )}
      <Scanlines u={u} />
    </AbsoluteFill>
  );
};

// T3 · Feature — the spec pinned as a HUD annotation: a crosshair on the product,
// a connector, and a bracketed mono label + value.
const TechFeature: React.FC<SceneProps> = ({ spec, scene, productImage, portrait }) => {
  const u = useUnit();
  const { text, onStage } = spec.palette;
  const accent = readableOn(onStage) === "#ffffff" ? spec.palette.accent : text;
  const frame = useCurrentFrame();
  const o = useSnap(4);
  const kb = interpolate(frame, [0, scene.frames], [1.02, 1.06], { extrapolateRight: "clamp" });
  const m = margin(u, portrait);
  return (
    <AbsoluteFill style={{ backgroundColor: onStage, overflow: "hidden" }}>
      <TechGrid color={text} u={u} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <Img src={productImage} crossOrigin="anonymous" style={{ width: portrait ? "70%" : "50%", maxHeight: portrait ? "56%" : "70%", objectFit: "contain", transform: `scale(${kb})`, filter: "drop-shadow(0 22px 48px rgba(0,0,0,0.5))" }} />
      </AbsoluteFill>
      {/* dot on product + connector to the callout */}
      <div style={{ position: "absolute", left: "50%", top: portrait ? "34%" : "40%", width: 12 * u, height: 12 * u, marginLeft: -6 * u, borderRadius: "50%", backgroundColor: accent, opacity: o, boxShadow: `0 0 0 ${5 * u}px ${accent}33` }} />
      <div style={{ position: "absolute", left: m, bottom: (portrait ? 120 : 108) * u, opacity: o, transform: `translateY(${interpolate(o, [0, 1], [16 * u, 0])}px)` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 * u, color: accent, fontSize: (portrait ? 15 : 18) * u, fontWeight: 700, marginBottom: 10 * u }}>
          <span>{`[ ${up(scene.label || spec.eyebrow)} ]`}</span>
        </div>
        <div style={{ color: text, fontSize: (portrait ? 34 : 44) * u, fontWeight: 700, lineHeight: 1.08, maxWidth: "62%", letterSpacing: -0.5 * u }}>
          {scene.value || spec.subhead}
        </div>
      </div>
      <Scanlines u={u} />
    </AbsoluteFill>
  );
};

// T4 · Price — an odometer: the figure counts up to the price in mono, under a
// system label, with a filling progress bar. Precise, not a slam.
const TechPrice: React.FC<SceneProps> = ({ spec, scene, portrait }) => {
  const u = useUnit();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const k = fps / 30;
  const { panel, text } = spec.palette;
  const accent = readableOn(panel) === "#ffffff" ? spec.palette.accent : text;
  const m = margin(u, portrait);
  const roll = interpolate(frame, [6 * k, 34 * k], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const label = useSnap(2);
  const p = parsePrice(scene.value ?? "");
  let display = scene.value ?? "";
  if (p) {
    const v = p.num * roll;
    const dec = roll >= 1 ? p.decimals : 0;
    display = `${p.prefix}${v.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec })}${p.suffix}`;
  }
  return (
    <AbsoluteFill style={{ backgroundColor: panel, justifyContent: "center", alignItems: "flex-start", padding: `0 ${m}px`, overflow: "hidden" }}>
      <TechGrid color={text} u={u} />
      <div style={{ color: accent, fontSize: (portrait ? 18 : 22) * u, fontWeight: 700, letterSpacing: 3 * u, marginBottom: 18 * u, opacity: label }}>
        {`// ${up(PRICE_LEAD[spec.tone])}`}
      </div>
      <div style={{ color: text, fontWeight: 700, fontSize: (portrait ? 150 : 220) * u, lineHeight: 0.9, letterSpacing: -4 * u, fontVariantNumeric: "tabular-nums" }}>
        {display}
      </div>
      <div style={{ marginTop: 34 * u, width: portrait ? "70%" : "44%", height: 4 * u, backgroundColor: `${text}22` }}>
        <div style={{ width: `${roll * 100}%`, height: "100%", backgroundColor: accent }} />
      </div>
      <Scanlines u={u} />
    </AbsoluteFill>
  );
};

// T5 · Outro — a terminal prompt sign-off: logo/name, then `> shop now_` typing
// with a blinking cursor. Grid + scanlines.
const TechOutro: React.FC<SceneProps> = ({ spec, portrait, brandLogo, brandLogoKnockout }) => {
  const u = useUnit();
  const { width } = useVideoConfig();
  const { panel, text } = spec.palette;
  const accent = readableOn(panel) === "#ffffff" ? spec.palette.accent : text;
  const m = margin(u, portrait);
  const o = useSnap(3);
  const size = Math.min(
    fitBlock(width - 2 * m, spec.headline, (portrait ? 40 : 56) * u, 3),
    fitChars(width - 2 * m, 10, (portrait ? 40 : 56) * u),
  );
  const knockoutFilter = readableOn(panel) === "#ffffff" ? "brightness(0) invert(1)" : "brightness(0)";
  return (
    <AbsoluteFill style={{ backgroundColor: panel, justifyContent: "center", alignItems: "flex-start", padding: `0 ${m}px`, overflow: "hidden" }}>
      <TechGrid color={text} u={u} />
      {brandLogo ? (
        <Img src={brandLogo} crossOrigin="anonymous" style={{ height: (portrait ? 52 : 72) * u, width: "auto", maxWidth: "62%", objectFit: "contain", opacity: o, marginBottom: 34 * u, ...(brandLogoKnockout !== false ? { filter: knockoutFilter } : {}) }} />
      ) : (
        <div style={{ opacity: o, color: text, fontWeight: 700, fontSize: size, lineHeight: 1.1, letterSpacing: -0.5 * u, maxWidth: "20ch", marginBottom: 30 * u }}>
          {spec.headline}
        </div>
      )}
      <Typewriter text={`> ${up(spec.cta)}`} delay={10} cps={20} size={(portrait ? 26 : 32) * u} color={accent} cursor={accent} weight={700} />
      <Scanlines u={u} />
    </AbsoluteFill>
  );
};

const TechyBeat: React.FC<SceneProps> = (props) => {
  switch (props.scene.type) {
    case "hook":
      return <TechHook {...props} />;
    case "feature":
      return <TechFeature {...props} />;
    case "price":
      return <TechPrice {...props} />;
    case "outro":
      return <TechOutro {...props} />;
    case "benefit":
      return <TechHook {...props} />;
    default:
      return <TechHero {...props} />;
  }
};

// ===========================================================================
// CALM — soft, soothing, breathing. Newsreader serif. Nothing snaps: the product
// resolves out of a blur, a big muted colour blob drifts behind it, everything
// breathes (a slow sine drift), and type fades up gently. No hairlines, no hard
// edges, no cuts. Research: calm reads through soft blur, muted palettes, slow
// fluid movement with no hard stops. Distinct from luxe (crisp/editorial) by
// being soft/rounded/hazy rather than sharp.
// ===========================================================================

// Gentle continuous "breathing" drift (deterministic sine on the timeline).
function useBreath(ampPx: number, periodSec = 6) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return Math.sin((frame / fps) * ((2 * Math.PI) / periodSec)) * ampPx;
}

// A large, soft, blurred colour blob that drifts behind the product.
const SoftBlob: React.FC<{ color: string; u: number; delay: number; size?: string }> = ({ color, u, delay, size = "72%" }) => {
  const a = useSlow(delay, 46);
  const by = useBreath(10 * u, 9);
  return (
    <div
      style={{
        position: "absolute",
        width: size,
        aspectRatio: "1 / 1",
        borderRadius: "50%",
        background: `radial-gradient(circle, ${color}, transparent 66%)`,
        opacity: a * 0.34,
        filter: `blur(${56 * u}px)`,
        transform: `translateY(${by}px)`,
      }}
    />
  );
};

// Serif line that resolves gently: soft fade + slight rise, no tracking gimmick.
const CalmLine: React.FC<{ text: string; size: number; color: string; delay: number; u: number; maxWidth?: number | string; align?: "left" | "center"; weight?: number; opacityMax?: number }> = ({
  text,
  size,
  color,
  delay,
  u,
  maxWidth,
  align = "left",
  weight = 600,
  opacityMax = 1,
}) => {
  const a = useSlow(delay, 34);
  return (
    <div style={{ opacity: a * opacityMax, transform: `translateY(${interpolate(a, [0, 1], [18 * u, 0])}px)`, color, fontSize: size, fontWeight: weight, lineHeight: 1.18, letterSpacing: -0.5 * u, maxWidth, textAlign: align, textWrap: "balance" }}>
      {text}
    </div>
  );
};

// C1 · Hook — the product resolves out of a soft blur over a drifting blob;
// a whispered serif kicker breathes in beneath.
const CalmHook: React.FC<SceneProps> = ({ spec, productImage, portrait }) => {
  const u = useUnit();
  const { panel, accent } = spec.palette;
  const foc = useSlow(0, 36);
  const by = useBreath(9 * u, 8);
  const m = margin(u, portrait);
  return (
    <AbsoluteFill style={{ backgroundColor: panel, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
      <SoftBlob color={accent} u={u} delay={2} />
      <Img
        src={productImage}
        crossOrigin="anonymous"
        style={{
          width: portrait ? "74%" : "50%",
          maxHeight: portrait ? "58%" : "70%",
          objectFit: "contain",
          filter: `blur(${interpolate(foc, [0, 1], [16, 0])}px) drop-shadow(0 26px 54px rgba(0,0,0,0.26))`,
          opacity: interpolate(foc, [0, 0.5], [0, 1], { extrapolateRight: "clamp" }),
          transform: `translateY(${by}px) scale(${interpolate(foc, [0, 1], [1.04, 1])})`,
        }}
      />
      <div style={{ position: "absolute", bottom: (portrait ? 76 : 66) * u, left: portrait ? 0 : m, right: portrait ? 0 : "auto", textAlign: portrait ? "center" : "left" }}>
        <CalmLine text={up(spec.eyebrow)} size={(portrait ? 16 : 18) * u} color={accent} delay={10} u={u} align={portrait ? "center" : "left"} weight={600} />
      </div>
    </AbsoluteFill>
  );
};

// C2 · Hero — product resting over a soft blob up top, a gentle serif headline
// breathing in below. Product-forward and unhurried.
const CalmHero: React.FC<SceneProps> = ({ spec, scene, productImage, portrait }) => {
  const u = useUnit();
  const { width } = useVideoConfig();
  const { panel, accent, text, stage } = spec.palette;
  const foc = useSlow(0, 34);
  const by = useBreath(8 * u, 9);
  const m = margin(u, portrait);
  const size = fitBlock(width - 2 * m, spec.headline, (portrait ? 60 : 82) * u, 3);
  const topH = portrait ? "54%" : "58%";
  return (
    <AbsoluteFill style={{ backgroundColor: panel }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: topH, overflow: "hidden", alignItems: "center", justifyContent: "center", display: "flex", backgroundColor: stage }}>
        <SoftBlob color={accent} u={u} delay={2} size="66%" />
        <Img
          src={productImage}
          crossOrigin="anonymous"
          style={{ width: portrait ? "66%" : "44%", maxHeight: "80%", objectFit: "contain", filter: `blur(${interpolate(foc, [0, 1], [12, 0])}px) drop-shadow(0 24px 46px rgba(0,0,0,0.18))`, transform: `translateY(${by}px)`, opacity: interpolate(foc, [0, 0.5], [0, 1], { extrapolateRight: "clamp" }) }}
        />
      </div>
      <div style={{ position: "absolute", top: topH, left: 0, right: 0, bottom: 0, padding: `0 ${m}px`, display: "flex", flexDirection: "column", justifyContent: "center", backgroundColor: panel }}>
        <CalmLine text={up(spec.eyebrow)} size={15 * u} color={accent} delay={4} u={u} weight={600} />
        <div style={{ height: 16 * u }} />
        <CalmLine text={spec.headline} size={size} color={text} delay={8} u={u} maxWidth={portrait ? "16ch" : "15ch"} />
      </div>
    </AbsoluteFill>
  );
};

// C3 · Price — quiet value: a gentle serif lead and a soft serif figure that
// fades and settles. No rule, no slam.
// Calm's price SETTLES rather than lands: each digit drifts down into place on
// its own beat and comes to rest, the whole line riding the mood's breathing
// offset. A reveal made of arrival, not impact — the opposite of bold's stamp.
const CalmDigits: React.FC<{ text: string; size: number; color: string; delay: number; u: number }> = ({ text, size, color, delay, u }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const k = fps / 30;
  return (
    <div style={{ display: "flex", fontVariantNumeric: "tabular-nums" }}>
      {(text || "").split("").map((ch, i) => {
        const t = interpolate(frame, [(delay + i * 2.5) * k, (delay + i * 2.5 + 26) * k], [0, 1], {
          easing: Easing.out(Easing.cubic),
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity: t,
              transform: `translateY(${interpolate(t, [0, 1], [-size * 0.16, 0])}px)`,
              filter: `blur(${interpolate(t, [0, 1], [size * 0.02, 0])}px)`,
              color,
              fontSize: size,
              fontWeight: 600,
              lineHeight: 1,
              letterSpacing: -3 * u,
            }}
          >
            {ch}
          </span>
        );
      })}
    </div>
  );
};

const CalmPrice: React.FC<SceneProps> = ({ spec, scene, portrait }) => {
  const u = useUnit();
  const { width } = useVideoConfig();
  const { panel, accent, text } = spec.palette;
  const by = useBreath(6 * u, 9);
  const m = margin(u, portrait);
  const value = scene.value ?? "";
  const size = fitLine(width - 2 * m, value, (portrait ? 140 : 196) * u);
  return (
    <AbsoluteFill style={{ backgroundColor: panel, justifyContent: "center", alignItems: "flex-start", padding: `0 ${m}px`, overflow: "hidden" }}>
      <SoftBlob color={accent} u={u} delay={0} size="54%" />
      <CalmLine text={PRICE_LEAD[spec.tone]} size={(portrait ? 22 : 27) * u} color={accent} delay={2} u={u} weight={600} />
      <div style={{ height: 14 * u }} />
      <div style={{ transform: `translateY(${by}px)` }}>
        <CalmDigits text={value} size={size} color={text} delay={8} u={u} />
      </div>
    </AbsoluteFill>
  );
};

// C4 · Outro — a calm sign-off: logo/serif name breathing in over a soft blob,
// then a gently rounded, muted CTA pill.
const CalmOutro: React.FC<SceneProps> = ({ spec, portrait, brandLogo, brandLogoKnockout }) => {
  const u = useUnit();
  const { width } = useVideoConfig();
  const { panel, accent, text } = spec.palette;
  const m = margin(u, portrait);
  const inn = useSlow(3, 34);
  const pill = useSlow(16, 30);
  const by = useBreath(6 * u, 9);
  const size = fitBlock(width - 2 * m, spec.headline, (portrait ? 58 : 80) * u, 3);
  const knockoutFilter = readableOn(panel) === "#ffffff" ? "brightness(0) invert(1)" : "brightness(0)";
  return (
    <AbsoluteFill style={{ backgroundColor: panel, justifyContent: "center", alignItems: "center", flexDirection: "column", padding: `0 ${m}px`, overflow: "hidden" }}>
      <SoftBlob color={accent} u={u} delay={0} size="60%" />
      {brandLogo ? (
        <Img src={brandLogo} crossOrigin="anonymous" style={{ height: (portrait ? 54 : 76) * u, width: "auto", maxWidth: "62%", objectFit: "contain", opacity: inn, transform: `translateY(${by}px)`, ...(brandLogoKnockout !== false ? { filter: knockoutFilter } : {}) }} />
      ) : (
        <div style={{ opacity: inn, transform: `translateY(${by}px)`, color: text, fontWeight: 600, fontSize: size, lineHeight: 1.1, letterSpacing: -0.5 * u, textAlign: "center", maxWidth: "16ch" }}>
          {spec.headline}
        </div>
      )}
      <div
        style={{
          marginTop: 40 * u,
          opacity: pill,
          transform: `translateY(${interpolate(pill, [0, 1], [12, 0])}px)`,
          padding: `${16 * u}px ${38 * u}px`,
          borderRadius: 999,
          backgroundColor: accent,
          color: readableOn(accent),
          fontSize: (portrait ? 22 : 26) * u,
          fontWeight: 600,
        }}
      >
        {spec.cta}
      </div>
    </AbsoluteFill>
  );
};

const CalmBeat: React.FC<SceneProps> = (props) => {
  switch (props.scene.type) {
    case "hook":
      return <CalmHook {...props} />;
    case "price":
      return <CalmPrice {...props} />;
    case "outro":
      return <CalmOutro {...props} />;
    case "benefit":
      return <CalmHook {...props} />;
    default:
      return <CalmHero {...props} />;
  }
};

// ===========================================================================
// PLAYFUL — bouncy, fun, toy-like. Bricolage Grotesque. MORE bounce than
// energetic: letters pop in with overshoot AND a little rotation, shapes/dots
// pop around the product, and the price arrives as a SPINNING STICKER BADGE that
// wobbles. Distinct from energetic (which slams/wipes) by being springy, round
// and cheeky rather than athletic.
// ===========================================================================

// Heavy-overshoot bounce (springier than usePop). `delay` in 30fps-frames.
function useBounce(delay: number, damping = 8) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay * (fps / 30), fps, config: { damping, stiffness: 150, mass: 0.85 } });
}

// Per-letter bouncy headline: each glyph pops from 0 with overshoot and a small
// alternating rotation that settles to upright.
const BounceText: React.FC<{ text: string; delay: number; per: number; size: number; color: string; u: number; maxWidth?: number | string; align?: "left" | "center" }> = ({
  text,
  delay,
  per,
  size,
  color,
  u,
  maxWidth,
  align = "left",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const k = fps / 30;
  const words = (text || "").split(" ");
  let idx = 0;
  return (
    // Row gap must exceed the per-letter entry travel (size*0.18 below) or
    // wrapped lines collide mid-animation.
    <div style={{ display: "flex", flexWrap: "wrap", gap: `${size * 0.3}px ${size * 0.28}px`, alignItems: "flex-end", justifyContent: align === "center" ? "center" : "flex-start", maxWidth }}>
      {words.map((w, wi) => (
        <span key={wi} style={{ display: "inline-flex" }}>
          {w.split("").map((ch, ci) => {
            const i = idx++;
            const s = spring({ frame: frame - (delay + i * per) * k, fps, config: { damping: 8, stiffness: 150, mass: 0.85 } });
            const dir = i % 2 === 0 ? 1 : -1;
            return (
              <span
                key={ci}
                style={{
                  display: "inline-block",
                  transformOrigin: "bottom center",
                  transform: `translateY(${interpolate(s, [0, 1], [size * 0.18, 0])}px) scale(${interpolate(s, [0, 1], [0.2, 1])}) rotate(${interpolate(s, [0, 1], [10 * dir, 0])}deg)`,
                  opacity: interpolate(s, [0, 0.5], [0, 1], { extrapolateRight: "clamp" }),
                  color,
                  fontSize: size,
                  fontWeight: 800,
                  lineHeight: 1.0,
                }}
              >
                {ch}
              </span>
            );
          })}
        </span>
      ))}
    </div>
  );
};

// A popping dot/shape at a fixed position.
const PopDot: React.FC<{ left: string; top: string; size: number; color: string; delay: number; ring?: boolean }> = ({ left, top, size, color, delay, ring }) => {
  const s = useBounce(delay, 7);
  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width: size,
        height: size,
        borderRadius: "50%",
        transform: `scale(${s})`,
        ...(ring ? { border: `${size * 0.18}px solid ${color}`, background: "transparent" } : { backgroundColor: color }),
      }}
    />
  );
};

// Playful accent used for TEXT drops to ink on a light panel (bright accents like
// amber are illegible on white); filled shapes/badges keep the true accent.
function playInk(palette: AdSpec["palette"]): string {
  return readableOn(palette.panel) === "#ffffff" ? palette.accent : palette.text;
}

// Product photos are cut-outs on white, so dropping one straight onto a dark
// playful panel shows a hard white rectangle. Playful's answer is a STICKER: the
// photo lives on a fat rounded card in the light stage colour, tilted, with a
// chunky offset shadow — scrapbook, not float. Doubles as the mood's signature.
const StickerCard: React.FC<{
  src: string;
  spec: AdSpec;
  size: string;
  pop: number;
  tilt?: number;
  u: number;
}> = ({ src, spec, size, pop, tilt = -3, u }) => {
  const { stage, accent } = spec.palette;
  return (
    <div
      style={{
        width: size,
        aspectRatio: "1 / 1",
        borderRadius: 46 * u,
        backgroundColor: stage,
        border: `${6 * u}px solid ${accent}`,
        boxShadow: `${12 * u}px ${14 * u}px 0 rgba(0,0,0,0.22)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 22 * u,
        overflow: "hidden",
        transform: `scale(${interpolate(pop, [0, 1], [0.3, 1])}) rotate(${interpolate(pop, [0, 1], [tilt - 10, tilt])}deg)`,
        opacity: interpolate(pop, [0, 0.45], [0, 1], { extrapolateRight: "clamp" }),
      }}
    >
      <Img src={src} crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
    </div>
  );
};

// P1 · Hook — product bounces in with a tilt, dots pop around it, bouncy kicker.
const PlayHook: React.FC<SceneProps> = ({ spec, productImage, portrait }) => {
  const u = useUnit();
  const { panel, accent } = spec.palette;
  const b = useBounce(2, 8);
  const kick = useBounce(10, 9);
  const m = margin(u, portrait);
  return (
    <AbsoluteFill style={{ backgroundColor: panel, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
      <PopDot left="16%" top="24%" size={40 * u} color={accent} delay={8} />
      <PopDot left="80%" top="30%" size={26 * u} color={accent} delay={12} ring />
      <PopDot left="24%" top="72%" size={22 * u} color={accent} delay={14} ring />
      <PopDot left="84%" top="70%" size={34 * u} color={accent} delay={10} />
      <StickerCard src={productImage} spec={spec} size={portrait ? "72%" : "42%"} pop={b} tilt={-4} u={u} />
      <div style={{ position: "absolute", bottom: (portrait ? 78 : 66) * u, left: portrait ? 0 : m, right: portrait ? 0 : "auto", textAlign: portrait ? "center" : "left", opacity: interpolate(kick, [0, 1], [0, 1]) }}>
        <span style={{ color: playInk(spec.palette), fontSize: (portrait ? 20 : 24) * u, fontWeight: 800, letterSpacing: 1 * u }}>{up(spec.eyebrow)}</span>
      </div>
    </AbsoluteFill>
  );
};

// P2 · Hero — headline pops per-letter with wobble; product bounces on a big
// round accent blob; dots scattered.
const PlayHero: React.FC<SceneProps> = ({ spec, scene, productImage, portrait }) => {
  const u = useUnit();
  const { width } = useVideoConfig();
  const { panel, accent, text } = spec.palette;
  const b = useBounce(2, 8);
  const m = margin(u, portrait);
  // Portrait stacks (blob up top, headline below); landscape splits so the
  // headline never has to sit on top of the blob.
  const colW = portrait ? width - 2 * m : (width - 2 * m) * 0.46;
  const size = fitBlock(colW, spec.headline, (portrait ? 66 : 78) * u, 4);
  const art = (
    <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: portrait ? "100%" : "50%", height: portrait ? "56%" : "100%" }}>
      <div style={{ position: "absolute", width: portrait ? "80%" : "84%", aspectRatio: "1/1", borderRadius: "50%", backgroundColor: accent, opacity: 0.9, transform: `scale(${interpolate(b, [0, 1], [0.6, 1])})` }} />
      <StickerCard src={productImage} spec={spec} size={portrait ? "56%" : "58%"} pop={b} tilt={5} u={u} />
    </div>
  );
  return (
    <AbsoluteFill style={{ backgroundColor: panel, overflow: "hidden" }}>
      <AbsoluteFill style={{ flexDirection: portrait ? "column" : "row", alignItems: "center", padding: `${(portrait ? 60 : 40) * u}px ${m}px` }}>
        {art}
        <div style={{ width: portrait ? "100%" : "50%", display: "flex", justifyContent: portrait ? "center" : "flex-start", paddingLeft: portrait ? 0 : 24 * u }}>
          <BounceText text={spec.headline} delay={6} per={0.9} size={size} color={text} u={u} maxWidth={portrait ? "14ch" : "11ch"} align={portrait ? "center" : "left"} />
        </div>
      </AbsoluteFill>
      <PopDot left="6%" top="14%" size={30 * u} color={accent} delay={12} ring />
      <PopDot left="90%" top="78%" size={24 * u} color={accent} delay={16} />
    </AbsoluteFill>
  );
};

// P3 · Feature — a sticker callout badge bounces/tilts in, pinned near the product.
const PlayFeature: React.FC<SceneProps> = ({ spec, scene, productImage, portrait }) => {
  const u = useUnit();
  const { accent, onStage } = spec.palette;
  const b = useBounce(4, 8);
  const wob = useBreath(2, 5);
  const m = margin(u, portrait);
  return (
    <AbsoluteFill style={{ backgroundColor: onStage, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
      <PopDot left="14%" top="20%" size={28 * u} color={accent} delay={10} ring />
      <PopDot left="82%" top="74%" size={30 * u} color={accent} delay={13} />
      <StickerCard src={productImage} spec={spec} size={portrait ? "64%" : "38%"} pop={b} tilt={-5} u={u} />
      <div
        style={{
          position: "absolute",
          left: portrait ? "50%" : m,
          bottom: portrait ? (110 * u) : (86 * u),
          transform: `translateX(${portrait ? "-50%" : "0"}) scale(${interpolate(b, [0, 1], [0.2, 1])}) rotate(${interpolate(b, [0, 1], [-14, -5])}deg) rotate(${wob}deg)`,
          transformOrigin: "center",
          backgroundColor: accent,
          color: readableOn(accent),
          padding: `${18 * u}px ${28 * u}px`,
          borderRadius: 22 * u,
          maxWidth: "66%",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: (portrait ? 15 : 17) * u, fontWeight: 800, opacity: 0.85, marginBottom: 6 * u }}>{up(scene.label || spec.eyebrow)}</div>
        <div style={{ fontSize: (portrait ? 30 : 40) * u, fontWeight: 800, lineHeight: 1.0 }}>{scene.value || spec.subhead}</div>
      </div>
    </AbsoluteFill>
  );
};

// P4 · Price — THE SIGNATURE: a spinning, wobbling STICKER BADGE lands with the
// price. Starburst-ish rounded badge, confetti dots.
const PlayPrice: React.FC<SceneProps> = ({ spec, scene, portrait }) => {
  const u = useUnit();
  const { panel, accent } = spec.palette;
  const b = useBounce(4, 7);
  const wob = useBreath(2.5, 4);
  const spin = interpolate(b, [0, 1], [-40, 0]);
  const { width } = useVideoConfig();
  // Fit the price inside the blob — a long "$1,299.00" must not run off the edge
  // or collide with the lead line above it.
  const blobW = width * (portrait ? 0.7 : 0.42);
  const priceSize = fitLine(blobW * 0.78, scene.value ?? "", (portrait ? 100 : 132) * u);
  return (
    <AbsoluteFill style={{ backgroundColor: panel, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      <PopDot left="18%" top="26%" size={34 * u} color={accent} delay={10} />
      <PopDot left="80%" top="24%" size={24 * u} color={accent} delay={13} ring />
      <PopDot left="22%" top="74%" size={26 * u} color={accent} delay={15} ring />
      <PopDot left="78%" top="76%" size={32 * u} color={accent} delay={11} />
      <div
        style={{
          width: portrait ? "70%" : "42%",
          aspectRatio: "1 / 1",
          borderRadius: "42% 58% 55% 45% / 52% 44% 56% 48%",
          backgroundColor: accent,
          color: readableOn(accent),
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 14 * u,
          boxShadow: `${14 * u}px ${16 * u}px 0 rgba(0,0,0,0.22)`,
          transform: `scale(${interpolate(b, [0, 1], [0.2, 1])}) rotate(${spin + wob}deg)`,
        }}
      >
        <div style={{ fontSize: (portrait ? 22 : 26) * u, fontWeight: 800, opacity: 0.9, letterSpacing: 1 * u }}>{up(PRICE_LEAD[spec.tone])}</div>
        {/* lineHeight > 1 so the tall "$" glyph can't overflow up into the lead. */}
        <div style={{ fontSize: priceSize, fontWeight: 800, lineHeight: 1.2, letterSpacing: -3 * u, whiteSpace: "nowrap" }}>{scene.value}</div>
      </div>
    </AbsoluteFill>
  );
};

// P5 · Outro — bouncy name + a fat rounded CTA pill that pops; dots.
const PlayOutro: React.FC<SceneProps> = ({ spec, portrait, brandLogo, brandLogoKnockout }) => {
  const u = useUnit();
  const { width } = useVideoConfig();
  const { panel, accent, text } = spec.palette;
  const m = margin(u, portrait);
  const inn = useBounce(3, 8);
  const pill = useBounce(12, 7);
  const size = fitBlock(width - 2 * m, spec.headline, (portrait ? 56 : 78) * u, 3);
  const knockoutFilter = readableOn(panel) === "#ffffff" ? "brightness(0) invert(1)" : "brightness(0)";
  return (
    <AbsoluteFill style={{ backgroundColor: panel, justifyContent: "center", alignItems: "center", flexDirection: "column", padding: `0 ${m}px`, overflow: "hidden" }}>
      <PopDot left="14%" top="22%" size={30 * u} color={accent} delay={8} />
      <PopDot left="84%" top="70%" size={26 * u} color={accent} delay={11} ring />
      {brandLogo ? (
        <Img src={brandLogo} crossOrigin="anonymous" style={{ height: (portrait ? 54 : 76) * u, width: "auto", maxWidth: "62%", objectFit: "contain", opacity: interpolate(inn, [0, 0.6], [0, 1], { extrapolateRight: "clamp" }), transform: `scale(${interpolate(inn, [0, 1], [0.6, 1])})`, ...(brandLogoKnockout !== false ? { filter: knockoutFilter } : {}) }} />
      ) : (
        <div style={{ transform: `scale(${interpolate(inn, [0, 1], [0.6, 1])})`, color: text, fontWeight: 800, fontSize: size, lineHeight: 1.02, letterSpacing: -1 * u, textAlign: "center", maxWidth: "15ch" }}>
          {spec.headline}
        </div>
      )}
      <div
        style={{
          marginTop: 40 * u,
          transform: `scale(${interpolate(pill, [0, 1], [0.2, 1])}) rotate(${interpolate(pill, [0, 1], [-6, 0])}deg)`,
          padding: `${18 * u}px ${44 * u}px`,
          borderRadius: 999,
          backgroundColor: accent,
          color: readableOn(accent),
          fontSize: (portrait ? 24 : 28) * u,
          fontWeight: 800,
        }}
      >
        {spec.cta}
      </div>
    </AbsoluteFill>
  );
};

const PlayfulBeat: React.FC<SceneProps> = (props) => {
  switch (props.scene.type) {
    case "hook":
      return <PlayHook {...props} />;
    case "feature":
      return <PlayFeature {...props} />;
    case "price":
      return <PlayPrice {...props} />;
    case "outro":
      return <PlayOutro {...props} />;
    case "benefit":
      return <PlayHook {...props} />;
    default:
      return <PlayHero {...props} />;
  }
};

// ===========================================================================
// BOLD — the loud declarative language.
//
// Deliberately the inverse of every mood above: those all move on springs and
// eases, so bold moves on NOTHING. State changes are hard cuts on a beat — no
// interpolation, no overshoot, no fade. The other levers are scale and crop:
// type is set so large the frame can't contain it, so words run off the edges
// and the viewer reads the fragment. Corners are square everywhere (bold owns
// radius 0 the way playful owns fat radii), and the frame periodically inverts
// ink and accent wholesale rather than transitioning between them.
// ===========================================================================

// A hard on/off switch — no ramp. `delay` in 30fps-frames.
function useCut(delay: number): boolean {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return frame >= delay * (fps / 30);
}

// Which item of a list is showing, advancing on a hard beat. `hold` in
// 30fps-frames. Clamps on the last item instead of looping back.
function useBeatIndex(count: number, hold: number, delay = 0): number {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const k = fps / 30;
  const t = Math.floor((frame - delay * k) / (hold * k));
  return Math.max(0, Math.min(count - 1, t));
}

// Two-frame impact shake on the beat — the only "motion" bold allows itself,
// and it's a jolt, not an ease.
function useSlam(delay: number, amount: number): { x: number; y: number } {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const k = fps / 30;
  const d = frame - delay * k;
  if (d < 0 || d > 3 * k) return { x: 0, y: 0 };
  const step = Math.floor(d / Math.max(1, k * 0.75));
  const dir = step % 2 === 0 ? 1 : -1;
  const decay = 1 - step / 4;
  return { x: amount * dir * decay, y: amount * 0.4 * -dir * decay };
}

// A full-bleed band of repeated text sliding sideways at a constant rate — no
// easing in or out, it's just always moving.
const BoldMarquee: React.FC<{
  text: string;
  size: number;
  ink: string;
  bg: string;
  speed: number;
  tilt?: number;
}> = ({ text, size, ink, bg, speed, tilt = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const reps = Array.from({ length: 8 });
  const cell = `${text} ✦ `;
  return (
    <div
      style={{
        // Relative, not absolute, so the band contributes its height to the
        // wrapper — a bottom-anchored wrapper would otherwise collapse to zero
        // and push the band off-frame.
        position: "relative",
        left: "-10%",
        width: "120%",
        backgroundColor: bg,
        transform: `rotate(${tilt}deg)`,
        overflow: "hidden",
        display: "flex",
        padding: `${size * 0.16}px 0`,
      }}
    >
      <div style={{ display: "flex", whiteSpace: "nowrap", transform: `translateX(${-((frame / fps) * speed) % 50}%)` }}>
        {reps.map((_, i) => (
          <span key={i} style={{ color: ink, fontSize: size, fontWeight: 800, letterSpacing: size * 0.02, lineHeight: 1 }}>
            {cell}
          </span>
        ))}
      </div>
    </div>
  );
};

// Type set past the frame's capacity so it crops at the edges — bold's core
// device. `overflowFactor` > 1 means the word is wider than the frame.
//
// The crop only works on SHORT words, where the missing tail is still
// inferable ("DON'T" reading as "DON'"). A long word cropped at the same ratio
// is just broken — "ENTERTAINMENT" becomes "ENTERTAINME" and the viewer gets
// nothing — so past ~5 characters the overflow ramps down, and by 9 the word is
// scaled to fit inside the frame instead of running past it.
function cropSize(avail: number, word: string, overflowFactor: number): number {
  const n = Math.max(1, word.length);
  const ratio =
    n <= 5
      ? overflowFactor
      : n >= 9
        ? 0.98
        : interpolate(n, [5, 9], [overflowFactor, 0.98]);
  // Size against the word's real per-glyph advance, not char-count × average —
  // otherwise wide words (M/W/G-heavy) overflow and clip on the trailing edge.
  return (avail * ratio) / upperAdvance(word);
}

// B1 · Hook — full accent flood. The hook reads one enormous word at a time on
// hard cuts, and the frame inverts between words.
const BoldHook: React.FC<SceneProps> = ({ spec, scene, portrait }) => {
  const u = useUnit();
  const { width } = useVideoConfig();
  const { panel, accent, text } = spec.palette;
  const words = (scene.text || spec.headline).split(" ").filter(Boolean);
  const i = useBeatIndex(words.length, 11);
  // Odd beats invert the whole frame: accent ground, ink type.
  const inverted = i % 2 === 1;
  const bg = inverted ? accent : panel;
  const ink = inverted ? readableOn(accent) : text;
  const word = words[i] ?? "";
  const slam = useSlam(i * 11, 10 * u);
  const m = margin(u, portrait);
  return (
    // Left-aligned, so the word only ever crops on the trailing edge — cropping
    // both sides eats the first letter and stops being readable.
    <AbsoluteFill style={{ backgroundColor: bg, overflow: "hidden", alignItems: "flex-start", justifyContent: "center", paddingLeft: m }}>
      <div
        style={{
          color: ink,
          // The cap is a sanity bound, not the usual case — short words are meant
          // to run past the frame edge rather than sit politely inside it.
          fontSize: Math.min(cropSize(width - m, word, portrait ? 1.15 : 1.06), (portrait ? 460 : 620) * u),
          fontWeight: 800,
          letterSpacing: -4 * u,
          lineHeight: 0.86,
          whiteSpace: "nowrap",
          textTransform: "uppercase",
          transform: `translate(${slam.x}px, ${slam.y}px)`,
        }}
      >
        {word}
      </div>
    </AbsoluteFill>
  );
};

// B2 · Hero — the product, with the headline oversized on top of it and running
// clean off the left edge. A marquee band pins the bottom.
const BoldHero: React.FC<SceneProps> = ({ spec, productImage, portrait }) => {
  const u = useUnit();
  const { width } = useVideoConfig();
  const { panel, accent, text, stage } = spec.palette;
  const shown = useCut(2);
  const words = spec.headline.split(" ").filter(Boolean);
  const shownWords = words.slice(0, 3);
  // Bind on the WIDEST word by real glyph advance, not the longest by char count
  // — "HDMI" is fewer letters than "MODEL" but wider, and it's what would clip.
  const binder = shownWords.reduce((mx, w) => (upperAdvance(w) > upperAdvance(mx) ? w : mx), shownWords[0] ?? "");
  const m = margin(u, portrait);
  const slam = useSlam(2, 12 * u);
  const bandSize = (portrait ? 30 : 34) * u;
  const cap = (portrait ? 120 : 150) * u;
  // Color-blocked poster: the product lives on a solid `stage` block, so a
  // white-background product photo reads as a deliberate panel rather than a
  // raw box floating on black. The headline owns the opposing block.
  const barIn = useCut(5);
  const kicker = up(spec.eyebrow);
  if (portrait) {
    // Product block on top, type block below.
    const size = Math.min(cropSize(width - 2 * m, binder, 1.0), cap);
    return (
      <AbsoluteFill style={{ backgroundColor: panel, overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "52%", backgroundColor: stage, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          <Img src={productImage} crossOrigin="anonymous" style={{ width: "90%", maxHeight: "88%", objectFit: "contain", opacity: shown ? 1 : 0, transform: `scale(${shown ? 1 : 1.04})` }} />
        </div>
        <div style={{ position: "absolute", top: "52%", left: 0, right: 0, bottom: 0, padding: `${44 * u}px ${m}px`, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 * u, marginBottom: 20 * u, opacity: barIn ? 1 : 0 }}>
            <div style={{ width: 34 * u, height: 8 * u, backgroundColor: accent }} />
            <span style={{ color: text, fontSize: 24 * u, fontWeight: 800, letterSpacing: 2 * u, textTransform: "uppercase" }}>{kicker}</span>
          </div>
          <div style={{ color: text, fontSize: size, fontWeight: 800, lineHeight: 0.86, letterSpacing: -4 * u, textTransform: "uppercase", opacity: shown ? 1 : 0, transform: `translate(${slam.x}px, ${slam.y}px)` }}>
            {words.slice(0, 3).map((w, wi) => (<div key={wi} style={{ whiteSpace: "nowrap" }}>{w}</div>))}
          </div>
        </div>
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0 }}>
          <BoldMarquee text={kicker} size={bandSize} ink={readableOn(accent)} bg={accent} speed={14} />
        </div>
      </AbsoluteFill>
    );
  }
  // Landscape: product block right, headline block left.
  const prodW = 0.44;
  const colW = width * (1 - prodW) - m * 2;
  const size = Math.min(cropSize(colW, binder, 1.0), cap);
  return (
    <AbsoluteFill style={{ backgroundColor: panel, overflow: "hidden" }}>
      {/* product block, solid stage, right */}
      <div style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: `${prodW * 100}%`, backgroundColor: stage, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        <Img src={productImage} crossOrigin="anonymous" style={{ width: "84%", maxHeight: "78%", objectFit: "contain", opacity: shown ? 1 : 0, transform: `scale(${shown ? 1 : 1.04})` }} />
      </div>
      {/* headline block, left */}
      <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: `${(1 - prodW) * 100}%`, padding: `0 ${m}px`, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 * u, marginBottom: 26 * u, opacity: barIn ? 1 : 0 }}>
          <div style={{ width: 46 * u, height: 10 * u, backgroundColor: accent }} />
          <span style={{ color: text, fontSize: 26 * u, fontWeight: 800, letterSpacing: 2 * u, textTransform: "uppercase" }}>{kicker}</span>
        </div>
        <div style={{ color: text, fontSize: size, fontWeight: 800, lineHeight: 0.84, letterSpacing: -5 * u, textTransform: "uppercase", opacity: shown ? 1 : 0, transform: `translate(${slam.x}px, ${slam.y}px)` }}>
          {words.slice(0, 3).map((w, wi) => (<div key={wi} style={{ whiteSpace: "nowrap" }}>{w}</div>))}
        </div>
      </div>
      <div style={{ position: "absolute", bottom: 0, left: 0, width: `${(1 - prodW) * 100}%` }}>
        <BoldMarquee text={kicker} size={bandSize} ink={readableOn(accent)} bg={accent} speed={14} />
      </div>
    </AbsoluteFill>
  );
};

// B3 · Feature — a whole-frame colour flood carrying one claim, cut hard.
const BoldFeature: React.FC<SceneProps> = ({ spec, scene, portrait }) => {
  const u = useUnit();
  const { width } = useVideoConfig();
  const { panel, accent, text } = spec.palette;
  const flipped = useCut(9);
  const bg = flipped ? accent : panel;
  const ink = flipped ? readableOn(accent) : text;
  const value = scene.value || spec.subhead;
  const slam = useSlam(9, 14 * u);
  return (
    <AbsoluteFill style={{ backgroundColor: bg, overflow: "hidden", justifyContent: "center", padding: `0 ${margin(u, portrait)}px` }}>
      <div style={{ color: ink, fontSize: (portrait ? 22 : 26) * u, fontWeight: 800, letterSpacing: 3 * u, marginBottom: 22 * u, textTransform: "uppercase" }}>
        {up(scene.label || spec.eyebrow)}
      </div>
      <div
        style={{
          color: ink,
          fontSize: fitBlock(width - 2 * margin(u, portrait), value, (portrait ? 110 : 140) * u, 2, true),
          fontWeight: 800,
          lineHeight: 0.9,
          letterSpacing: -4 * u,
          textTransform: "uppercase",
          transform: `translate(${slam.x}px, ${slam.y}px)`,
        }}
      >
        {value}
      </div>
    </AbsoluteFill>
  );
};

// B4 · Price — THE SIGNATURE: the number is STAMPED. It cuts in at 2.4x and
// snaps to 1x over three hard steps with no easing, then the frame jolts.
const BoldPrice: React.FC<SceneProps> = ({ spec, scene, portrait }) => {
  const u = useUnit();
  const { width } = useVideoConfig();
  const { panel, accent, text } = spec.palette;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const k = fps / 30;
  // Three discrete stamp steps, not an interpolation.
  const d = frame - 4 * k;
  const stampScale = d < 0 ? 0 : d < 1.5 * k ? 2.4 : d < 3 * k ? 1.35 : 1;
  const landed = d >= 3 * k;
  const slam = useSlam(7, 16 * u);
  const value = scene.value || "";
  const size = fitLine(width * 0.72, value, (portrait ? 150 : 200) * u, true);
  return (
    <AbsoluteFill style={{ backgroundColor: panel, overflow: "hidden", alignItems: "center", justifyContent: "center", transform: `translate(${slam.x}px, ${slam.y}px)` }}>
      {landed ? (
        <div style={{ position: "absolute", top: "16%", left: 0, right: 0 }}>
          <BoldMarquee text={up(PRICE_LEAD[spec.tone])} size={(portrait ? 26 : 30) * u} ink={readableOn(accent)} bg={accent} speed={18} tilt={-4} />
        </div>
      ) : null}
      <div
        style={{
          backgroundColor: accent,
          color: readableOn(accent),
          padding: `${20 * u}px ${40 * u}px`,
          // Square corners, always — bold never rounds anything.
          borderRadius: 0,
          transform: `scale(${stampScale}) rotate(-2deg)`,
          opacity: stampScale === 0 ? 0 : 1,
        }}
      >
        <div style={{ fontSize: size, fontWeight: 800, lineHeight: 1.1, letterSpacing: -4 * u, whiteSpace: "nowrap" }}>{value}</div>
      </div>
      {landed ? (
        <div style={{ position: "absolute", bottom: "14%", color: text, fontSize: (portrait ? 24 : 28) * u, fontWeight: 800, letterSpacing: 4 * u, textTransform: "uppercase" }}>
          {up(spec.subhead.slice(0, 34))}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

// B5 · Outro — the name at crop scale, with a hard rectangular CTA block.
const BoldOutro: React.FC<SceneProps> = ({ spec, portrait, brandLogo, brandLogoKnockout }) => {
  const u = useUnit();
  const { width } = useVideoConfig();
  const { panel, accent, text } = spec.palette;
  const shown = useCut(2);
  const ctaIn = useCut(11);
  const words = spec.headline.split(" ").filter(Boolean);
  // Words stack one per line (nowrap), so the widest word by real advance binds.
  const binder = words.slice(0, 4).reduce((mx, w) => (upperAdvance(w) > upperAdvance(mx) ? w : mx), words[0] ?? "");
  // The outro is centre-aligned, so it loses a margin on BOTH sides.
  const size = Math.min(cropSize(width - 2 * margin(u, portrait), binder, 1.0), (portrait ? 110 : 150) * u);
  const slam = useSlam(2, 12 * u);
  const knockoutFilter = readableOn(panel) === "#ffffff" ? "brightness(0) invert(1)" : "brightness(0)";
  return (
    <AbsoluteFill style={{ backgroundColor: panel, overflow: "hidden", alignItems: "center", justifyContent: "center", gap: 40 * u }}>
      {brandLogo ? (
        <Img
          src={brandLogo}
          crossOrigin="anonymous"
          style={{ height: (portrait ? 60 : 84) * u, width: "auto", maxWidth: "70%", objectFit: "contain", opacity: shown ? 1 : 0, transform: `translate(${slam.x}px, ${slam.y}px)`, ...(brandLogoKnockout !== false ? { filter: knockoutFilter } : {}) }}
        />
      ) : (
        <div
          style={{
            color: text,
            fontSize: size,
            fontWeight: 800,
            lineHeight: 0.86,
            letterSpacing: -4 * u,
            textAlign: "center",
            textTransform: "uppercase",
            opacity: shown ? 1 : 0,
            transform: `translate(${slam.x}px, ${slam.y}px)`,
          }}
        >
          {words.slice(0, 4).map((w, wi) => (
            <div key={wi} style={{ whiteSpace: "nowrap" }}>{w}</div>
          ))}
        </div>
      )}
      <div
        style={{
          backgroundColor: accent,
          color: readableOn(accent),
          padding: `${18 * u}px ${44 * u}px`,
          borderRadius: 0,
          fontSize: (portrait ? 26 : 30) * u,
          fontWeight: 800,
          letterSpacing: 2 * u,
          textTransform: "uppercase",
          opacity: ctaIn ? 1 : 0,
        }}
      >
        {spec.cta}
      </div>
    </AbsoluteFill>
  );
};

const BoldBeat: React.FC<SceneProps> = (props) => {
  switch (props.scene.type) {
    case "hook":
      return <BoldHook {...props} />;
    case "feature":
    case "benefit":
      return <BoldFeature {...props} />;
    case "price":
      return <BoldPrice {...props} />;
    case "outro":
      return <BoldOutro {...props} />;
    default:
      return <BoldHero {...props} />;
  }
};

// Moods with a bespoke kinetic treatment; the rest fall back to SceneView.
const KINETIC_BEATS: Partial<Record<Tone, React.FC<SceneProps>>> = {
  energetic: KineticBeat,
  luxe: LuxeBeat,
  techy: TechyBeat,
  calm: CalmBeat,
  playful: PlayfulBeat,
  bold: BoldBeat,
};

// Derive a clean banded spec when none is supplied (keeps old callers working).
function fallbackSpec(props: ProductAdProps): AdSpec {
  // Same NaN/short-duration guard buildAdSpec carries: NaN propagates through
  // Math.max/round into every scene's frames, and a sub-second duration
  // rounds a scene to 0 frames — <Sequence durationInFrames={0}> throws.
  const seconds =
    Number.isFinite(props.durationInSeconds) && props.durationInSeconds >= 3
      ? props.durationInSeconds
      : 10;
  const total = Math.max(1, Math.round(seconds * FPS_APP));
  const hook = Math.round(total * 0.18);
  const outro = Math.round(total * 0.2);
  return {
    tone: "energetic",
    layout: "banded",
    palette: {
      stage: "#f4f6f8",
      panel: "#0a0d18",
      accent: props.accent || "#ff5a1f",
      text: "#ffffff",
      onStage: "#080a12",
    },
    font: "grotesque",
    headline: props.productTitle,
    subhead: "",
    cta: "Shop now",
    eyebrow: "New",
    scenes: [
      { type: "hook", frames: hook, text: "Your upgrade is here.", motion: "rise" },
      { type: "hero", frames: total - hook - outro, text: props.productTitle, motion: "rise" },
      { type: "outro", frames: outro, text: "Shop now", motion: "rise" },
    ],
  };
}

// Reel-safe insets (fractions of the frame). Vertical formats get a bottom-
// weighted safe frame so legible copy never lands under a platform's UI (TikTok
// covers the bottom ~17% and Reels even more); the panel-coloured margin mats
// the rest, so the ad reads as a deliberately framed reel. Landscape and square
// bleed full-frame (no reel chrome to dodge). Derived from the actual dims, so
// it's right regardless of how the composition was sized.
function safeInsets(width: number, height: number) {
  const ratio = height / width;
  if (ratio >= 1.7) return { top: 0.05, bottom: 0.17, left: 0.045, right: 0.045 }; // 9:16
  if (ratio >= 1.2) return { top: 0.035, bottom: 0.09, left: 0.03, right: 0.03 }; // 4:5
  return { top: 0, bottom: 0, left: 0, right: 0 }; // 16:9, 1:1
}

export const ProductAd: React.FC<ProductAdProps> = (props) => {
  const spec = props.spec ?? fallbackSpec(props);
  const { width, height } = useVideoConfig();
  const portrait = height > width;
  const wide = width > height * 1.2; // only 16:9 — square/vertical stack
  const ins = safeInsets(width, height);
  // Every tone has a bespoke kinetic beat set; a malformed tone (e.g. from an
  // LLM-authored spec) falls back to the energetic treatment rather than crashing.
  const Beat = KINETIC_BEATS[spec.tone] ?? KineticBeat;

  let offset = 0;

  return (
    <AbsoluteFill style={{ backgroundColor: spec.palette.panel, fontFamily: FONT_FAMILY[spec.font] }}>
      {/* Reel-safe frame: on vertical formats every scene renders inside the safe
          rectangle and the panel-coloured margin mats the rest, so copy never
          lands under a platform's UI. Landscape/square get a zero inset (full
          bleed), so this is inert for 16:9 and 1:1. */}
      <div
        style={{
          position: "absolute",
          top: ins.top * height,
          bottom: ins.bottom * height,
          left: ins.left * width,
          right: ins.right * width,
          overflow: "hidden",
        }}
      >
        {spec.scenes.map((scene, i) => {
          const from = offset;
          offset += scene.frames;
          return (
            <Sequence key={i} from={from} durationInFrames={scene.frames} layout="none">
              <Beat
                spec={spec}
                scene={scene}
                productImage={props.productImage}
                portrait={portrait}
                wide={wide}
                brandLogo={props.brandLogo}
                brandLogoKnockout={props.brandLogoKnockout}
              />
            </Sequence>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
