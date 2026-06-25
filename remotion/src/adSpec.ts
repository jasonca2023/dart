// The "ad spec" — the contract between the brain (inputs -> creative direction)
// and the renderer (ProductAd). A spec fully describes one ad's look, copy and
// pacing. buildAdSpec() is the v1 rule-based brain (pure, deterministic, no keys);
// an LLM can later produce the same shape behind this contract for bespoke copy.

export type Tone = "luxe" | "energetic" | "playful" | "calm" | "techy" | "bold";
export type FontKey = "grotesque" | "serif" | "mono";
export type LayoutVariant = "banded" | "split" | "editorial";
export type SceneType = "hook" | "hero" | "feature" | "price" | "benefit" | "outro";
export type Motion = "kenburns-in" | "kenburns-out" | "drift" | "rise" | "pop";

export interface Palette {
  /** Light stage the product sits on (kept light so white-bg cutouts blend). */
  stage: string;
  /** Dark/colored surface copy sits on. */
  panel: string;
  accent: string;
  /** Text color on the panel. */
  text: string;
  /** Text/brand color on the light stage. */
  onStage: string;
}

export interface Scene {
  type: SceneType;
  frames: number;
  text?: string;
  label?: string;
  value?: string;
  motion?: Motion;
}

export interface AdSpec {
  tone: Tone;
  layout: LayoutVariant;
  palette: Palette;
  font: FontKey;
  headline: string;
  subhead: string;
  cta: string;
  eyebrow: string;
  scenes: Scene[];
}

export interface AdSpecInput {
  title: string;
  audience: string;
  /** Formatted price like "$129", or "" when none. */
  price: string;
  durationSec: number;
}

const FPS = 30;

// --- Variety tables -------------------------------------------------------

const TONE_KEYWORDS: { tone: Tone; words: string[] }[] = [
  { tone: "luxe", words: ["luxury", "luxe", "gift", "premium", "designer", "high-end", "elegant", "jewel"] },
  { tone: "techy", words: ["tech", "gen z", "gamer", "gaming", "developer", "startup", "geek", "smart"] },
  { tone: "calm", words: ["parent", "family", "busy", "mom", "dad", "home", "wellness", "sleep", "calm"] },
  { tone: "energetic", words: ["outdoor", "adventure", "athlete", "fitness", "sport", "runner", "active", "travel"] },
  { tone: "playful", words: ["kid", "fun", "teen", "creator", "party", "color", "playful", "quirky"] },
];

// Stages stay light so a product photo (often white-bg) blends; the tone lives in
// the dark panel, the accent, the type and the motion. Palettes follow the
// research: luxe = black+gold "modern heritage", techy = high-contrast electric,
// energetic = bold athletic, calm = warm/trustworthy.
const PALETTES: Record<Tone, Palette[]> = {
  luxe: [
    { stage: "#f3efe5", panel: "#0b0a08", accent: "#c8a24c", text: "#f5efe1", onStage: "#0b0a08" },
    { stage: "#efe9dc", panel: "#100d09", accent: "#bd9a55", text: "#f3ecdc", onStage: "#100d09" },
  ],
  energetic: [
    { stage: "#ffffff", panel: "#0a0d18", accent: "#ff5a1f", text: "#ffffff", onStage: "#080a12" },
    { stage: "#fbfdff", panel: "#091024", accent: "#1f6bff", text: "#ffffff", onStage: "#091024" },
  ],
  playful: [
    { stage: "#fff6f1", panel: "#2a0f3a", accent: "#ff5da2", text: "#ffffff", onStage: "#2a0f3a" },
    { stage: "#fdf5ff", panel: "#141f4a", accent: "#ffb020", text: "#ffffff", onStage: "#141f4a" },
  ],
  calm: [
    { stage: "#f2f4f3", panel: "#222b2e", accent: "#3f9d86", text: "#eef5f2", onStage: "#222b2e" },
    { stage: "#f4f2ee", panel: "#2a2f3a", accent: "#6f8fd0", text: "#eef2fa", onStage: "#2a2f3a" },
  ],
  techy: [
    { stage: "#eef1f6", panel: "#06070d", accent: "#22e3d3", text: "#e9fffb", onStage: "#06070d" },
    { stage: "#ecedf5", panel: "#08080f", accent: "#8b5cff", text: "#efeaff", onStage: "#08080f" },
  ],
  bold: [
    { stage: "#fffdf7", panel: "#101010", accent: "#ff3b1d", text: "#ffffff", onStage: "#101010" },
    { stage: "#fbfbf9", panel: "#0f0f0f", accent: "#ffd400", text: "#ffffff", onStage: "#0f0f0f" },
  ],
};

const TONE_FONT: Record<Tone, FontKey> = {
  luxe: "serif",
  energetic: "grotesque",
  playful: "grotesque",
  calm: "serif",
  techy: "mono",
  bold: "grotesque",
};

const TONE_LAYOUTS: Record<Tone, LayoutVariant[]> = {
  luxe: ["editorial", "split", "banded"],
  energetic: ["split", "banded", "editorial"],
  playful: ["editorial", "banded", "split"],
  calm: ["split", "banded"],
  techy: ["banded", "split", "editorial"],
  bold: ["editorial", "split", "banded"],
};

const TONE_MOTION: Record<Tone, Motion> = {
  luxe: "kenburns-in",
  energetic: "rise",
  playful: "pop",
  calm: "drift",
  techy: "rise",
  bold: "pop",
};

// Copy templates keyed on tone (the LLM brain replaces these in v2).
const HOOKS: Record<Tone, string[]> = {
  luxe: ["Made to be gifted.", "Quietly exceptional.", "The detail you'll notice."],
  energetic: ["Built to move.", "Less waiting. More doing.", "Your upgrade is here."],
  playful: ["Say hello to your new favorite.", "Yep, it's that good.", "Big mood, small price."],
  calm: ["One less thing to worry about.", "Simple. Sorted.", "Made for real life."],
  techy: ["Spec'd to impress.", "Plug in. Power up.", "Smarter by design."],
  bold: ["Don't blink.", "This changes things.", "Go big."],
};

const SUBHEADS: Record<Tone, string[]> = {
  luxe: ["Crafted for those who notice.", "An effortless upgrade."],
  energetic: ["Everything you need, nothing you don't.", "Ready when you are."],
  playful: ["Designed to make you smile.", "Seriously fun, fairly priced."],
  calm: ["Thoughtful, dependable, easy.", "Made to just work."],
  techy: ["Engineered for performance.", "The details that matter."],
  bold: ["No compromises.", "Made to stand out."],
};

const CTAS: Record<Tone, string> = {
  luxe: "Shop the collection",
  energetic: "Get yours",
  playful: "Grab one",
  calm: "Shop now",
  techy: "Shop now",
  bold: "Shop now",
};

const FEATURES: Record<Tone, { label: string; value: string }[]> = {
  luxe: [{ label: "Finish", value: "Premium materials" }, { label: "Detail", value: "Considered, refined" }],
  energetic: [{ label: "Built for", value: "Everyday performance" }, { label: "Ready", value: "Out of the box" }],
  playful: [{ label: "Why we love it", value: "It just sparks joy" }, { label: "Bonus", value: "Looks great anywhere" }],
  calm: [{ label: "Easy", value: "Set up in seconds" }, { label: "Reliable", value: "Day after day" }],
  techy: [{ label: "Performance", value: "No bottlenecks" }, { label: "Compatible", value: "With your setup" }],
  bold: [{ label: "The headline", value: "Impossible to ignore" }, { label: "Result", value: "Pure standout" }],
};

// --- The brain ------------------------------------------------------------

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function toneFor(audience: string, title: string): Tone {
  const hay = `${audience} ${title}`.toLowerCase();
  for (const { tone, words } of TONE_KEYWORDS) {
    if (words.some((w) => hay.includes(w))) return tone;
  }
  return "energetic";
}

function pick<T>(arr: T[], seed: number): T {
  // seed may be negative (signed shifts) — wrap into range.
  const i = ((Math.trunc(seed) % arr.length) + arr.length) % arr.length;
  return arr[i];
}

function clip(s: string, max: number): string {
  const t = s.trim();
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + "…";
}

/** Distribute `total` frames across the given weights, exact sum, min per scene. */
function distribute(total: number, weights: number[]): number[] {
  const min = Math.round(FPS * 0.6);
  const sum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => Math.max(min, Math.round((w / sum) * total)));
  let diff = total - raw.reduce((a, b) => a + b, 0);
  // Apply the rounding remainder to the largest (hero) scene.
  const hero = raw.indexOf(Math.max(...raw));
  raw[hero] = Math.max(min, raw[hero] + diff);
  return raw;
}

export function buildAdSpec(input: AdSpecInput): AdSpec {
  const title = input.title.trim() || "Your product";
  const audience = input.audience.trim() || "everyone";
  const tone = toneFor(audience, title);
  const seed = hash(`${title}|${audience}`);

  const palette = pick(PALETTES[tone], seed);
  const font = TONE_FONT[tone];
  const layout = pick(TONE_LAYOUTS[tone], seed >> 3);
  const motion = TONE_MOTION[tone];

  const hook = pick(HOOKS[tone], seed >> 5);
  const subhead = pick(SUBHEADS[tone], seed >> 7);
  const cta = CTAS[tone];
  const feature = pick(FEATURES[tone], seed >> 9);
  const eyebrow = `For ${audience}`;

  // Scene set: hook -> hero -> (feature) -> (price) -> outro. More duration ->
  // more room for the optional scenes.
  const totalFrames = Math.max(1, Math.round(input.durationSec * FPS));
  const hasPrice = !!input.price.trim();
  const longEnough = input.durationSec >= 8;

  const types: SceneType[] = ["hook", "hero"];
  const weights: number[] = [1.1, 2.6];
  if (longEnough) {
    types.push("feature");
    weights.push(1.5);
  }
  if (hasPrice) {
    types.push("price");
    weights.push(1.3);
  }
  types.push("outro");
  weights.push(1.2);

  const frames = distribute(totalFrames, weights);
  const scenes: Scene[] = types.map((type, i) => {
    const base: Scene = { type, frames: frames[i], motion };
    if (type === "hook") base.text = clip(hook, 42);
    if (type === "hero") base.text = clip(title, 40);
    if (type === "feature") {
      base.label = clip(feature.label, 22);
      base.value = clip(feature.value, 34);
    }
    if (type === "price") base.value = clip(input.price, 12);
    if (type === "outro") base.text = clip(cta, 24);
    return base;
  });

  return clampSpec({
    tone,
    layout,
    palette,
    font,
    headline: clip(title, 40),
    subhead: clip(subhead, 60),
    cta,
    eyebrow: clip(eyebrow, 32),
    scenes,
  });
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Guard a spec so the renderer can always trust it (valid colors, sane frames). */
export function clampSpec(spec: AdSpec): AdSpec {
  const p = spec.palette;
  const safe = (c: string, fallback: string) => (HEX.test(c) ? c : fallback);
  const palette: Palette = {
    stage: safe(p.stage, "#ffffff"),
    panel: safe(p.panel, "#0b0b12"),
    accent: safe(p.accent, "#0447ff"),
    text: safe(p.text, "#ffffff"),
    onStage: safe(p.onStage, "#0b0b12"),
  };
  const min = Math.round(FPS * 0.6);
  const scenes = (spec.scenes.length ? spec.scenes : DEFAULT_SPEC.scenes).map((s) => ({
    ...s,
    frames: Math.max(min, Math.round(s.frames)),
  }));
  return { ...spec, palette, scenes };
}

export const DEFAULT_SPEC: AdSpec = {
  tone: "energetic",
  layout: "banded",
  palette: PALETTES.energetic[0],
  font: "grotesque",
  headline: "Your product",
  subhead: "Everything you need, nothing you don't.",
  cta: "Shop now",
  eyebrow: "For everyone",
  scenes: [
    { type: "hook", frames: 36, text: "Your upgrade is here.", motion: "rise" },
    { type: "hero", frames: 132, text: "Your product", motion: "rise" },
    { type: "outro", frames: 42, text: "Shop now", motion: "rise" },
  ],
};
