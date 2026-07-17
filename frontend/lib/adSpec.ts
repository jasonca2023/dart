// The "ad spec" — the contract between the brain (inputs -> creative direction)
// and the renderer (ProductAd). A spec fully describes one ad's look, copy and
// pacing. buildAdSpec() is the v1 rule-based brain (pure, deterministic, no keys);
// an LLM can later produce the same shape behind this contract for bespoke copy.

export type Tone = "luxe" | "energetic" | "playful" | "calm" | "techy" | "bold";
export type FontKey = "grotesque" | "serif" | "softserif" | "condensed" | "mono";
export type LayoutVariant = "banded" | "split" | "editorial" | "statement";
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
  /** Bump to get a different take (palette variant, copy picks) — same mood. */
  variant?: number;
}

const FPS = 30;

// --- Variety tables -------------------------------------------------------

const TONE_KEYWORDS: { tone: Tone; words: string[] }[] = [
  { tone: "luxe", words: ["luxury", "luxe", "gift", "premium", "designer", "high-end", "elegant", "jewel"] },
  { tone: "techy", words: ["tech", "gen z", "gamer", "gaming", "developer", "startup", "geek", "smart"] },
  { tone: "calm", words: ["parent", "family", "busy", "mom", "dad", "home", "wellness", "sleep", "calm"] },
  { tone: "energetic", words: ["outdoor", "adventure", "athlete", "fitness", "sport", "runner", "active", "travel"] },
  // Playful/bold cast wider nets than the tones above (which match first and
  // own their niches). Words are substring-matched, so avoid short strings that
  // hide inside common words ("cat"→catalog, "pet"→carpet, "rap"→wrap).
  {
    tone: "playful",
    words: [
      "kid", "fun", "teen", "creator", "party", "color", "playful", "quirky",
      "toy", "game", "student", "college", "puppy", "kitten", "dog", "candy",
      "snack", "birthday", "festive", "cute", "young", "youth", "rainbow",
      "vibrant", "cheerful", "whimsical", "silly", "plush", "puzzle", "craft",
    ],
  },
  {
    tone: "bold",
    words: [
      "bold", "statement", "street", "fashion", "hype", "trendsetter", "edgy",
      "influencer", "disruptor", "standout", "sneaker", "urban", "punk",
      "skate", "rebel", "daring", "fearless", "fierce", "grunge", "graphic",
      "hip hop", "hip-hop", "swag", "exclusive", "y2k", "attitude",
      "maximalist", "viral",
    ],
  },
];

// Stages stay light so a product photo (often white-bg) blends; the tone lives in
// the dark panel, the accent, the type and the motion. Palettes follow the
// research: luxe = black+gold "modern heritage", techy = high-contrast electric,
// energetic = bold athletic, calm = warm/trustworthy.
const PALETTES: Record<Tone, Palette[]> = {
  luxe: [
    { stage: "#f3efe5", panel: "#0b0a08", accent: "#c8a24c", text: "#f5efe1", onStage: "#0b0a08" },
    { stage: "#efe9dc", panel: "#100d09", accent: "#bd9a55", text: "#f3ecdc", onStage: "#100d09" },
    { stage: "#f1ece2", panel: "#0c0a09", accent: "#9c6b52", text: "#f2ead9", onStage: "#0c0a09" },
  ],
  energetic: [
    { stage: "#ffffff", panel: "#0a0d18", accent: "#ff5a1f", text: "#ffffff", onStage: "#080a12" },
    { stage: "#fbfdff", panel: "#091024", accent: "#1f6bff", text: "#ffffff", onStage: "#091024" },
    { stage: "#f7fffb", panel: "#08160f", accent: "#15c06a", text: "#ffffff", onStage: "#08160f" },
  ],
  playful: [
    { stage: "#fff6f1", panel: "#2a0f3a", accent: "#ff5da2", text: "#ffffff", onStage: "#2a0f3a" },
    { stage: "#fdf5ff", panel: "#141f4a", accent: "#ffb020", text: "#ffffff", onStage: "#141f4a" },
    { stage: "#f1fffb", panel: "#10243a", accent: "#00c2b8", text: "#ffffff", onStage: "#10243a" },
  ],
  calm: [
    { stage: "#f2f4f3", panel: "#222b2e", accent: "#3f9d86", text: "#eef5f2", onStage: "#222b2e" },
    { stage: "#f4f2ee", panel: "#2a2f3a", accent: "#6f8fd0", text: "#eef2fa", onStage: "#2a2f3a" },
    { stage: "#f5f1ec", panel: "#2b2724", accent: "#c08457", text: "#f3ece4", onStage: "#2b2724" },
  ],
  techy: [
    { stage: "#eef1f6", panel: "#06070d", accent: "#22e3d3", text: "#e9fffb", onStage: "#06070d" },
    { stage: "#ecedf5", panel: "#08080f", accent: "#8b5cff", text: "#efeaff", onStage: "#08080f" },
    { stage: "#eef3ef", panel: "#06080a", accent: "#2bd96b", text: "#eafff0", onStage: "#06080a" },
  ],
  bold: [
    { stage: "#fffdf7", panel: "#101010", accent: "#ff3b1d", text: "#ffffff", onStage: "#101010" },
    { stage: "#fbfbf9", panel: "#0f0f0f", accent: "#ffd400", text: "#ffffff", onStage: "#0f0f0f" },
    { stage: "#fafbff", panel: "#0d0d0f", accent: "#2b59ff", text: "#ffffff", onStage: "#0d0d0f" },
  ],
};

// Representative accent per tone (the first palette variant) — used by previews
// like the mood carousel so the UI shows the real ad colors.
export const TONE_ACCENTS: Record<Tone, string> = {
  luxe: PALETTES.luxe[0].accent,
  energetic: PALETTES.energetic[0].accent,
  playful: PALETTES.playful[0].accent,
  calm: PALETTES.calm[0].accent,
  techy: PALETTES.techy[0].accent,
  bold: PALETTES.bold[0].accent,
};

const TONE_FONT: Record<Tone, FontKey> = {
  luxe: "serif", // Fraunces — editorial luxury
  energetic: "condensed", // Big Shoulders — athletic/outdoor
  playful: "grotesque", // Bricolage Grotesque
  calm: "softserif", // Newsreader — gentle, distinct from luxe
  techy: "mono", // JetBrains Mono
  bold: "grotesque", // Bricolage Grotesque
};

// Each mood gets its OWN structure, not just its own colours — a signature hero
// layout, whether it includes a feature/benefit beat, and per-scene pacing
// weights. Grounded in how each audience actually responds (see research):
//  - luxe   : quiet luxury — lean (no spec dump), slow, hero-dominant, editorial.
//  - calm   : steady & clean — lean, gentle, product-forward banded.
//  - bold   : loud declarative — lean, oversized statement takeover.
//  - energetic: kinetic multi-beat — full, fast, dynamic split.
//  - techy  : spec-forward — full, a prominent feature beat, precise banded.
//  - playful: bold kinetic type — full, bouncy, type-dominant editorial.
interface ToneStructure {
  layout: LayoutVariant;
  feature: boolean; // include a feature/benefit beat?
  weights: { hook: number; hero: number; feature: number; price: number; outro: number };
}
const TONE_STRUCTURE: Record<Tone, ToneStructure> = {
  luxe: { layout: "editorial", feature: false, weights: { hook: 1.1, hero: 3.2, feature: 0, price: 1.4, outro: 1.4 } },
  calm: { layout: "banded", feature: false, weights: { hook: 1.2, hero: 2.8, feature: 0, price: 1.3, outro: 1.2 } },
  bold: { layout: "statement", feature: false, weights: { hook: 1.5, hero: 2.3, feature: 0, price: 1.5, outro: 1.3 } },
  energetic: { layout: "split", feature: true, weights: { hook: 1.0, hero: 2.1, feature: 1.4, price: 1.2, outro: 1.0 } },
  techy: { layout: "banded", feature: true, weights: { hook: 1.0, hero: 2.0, feature: 1.9, price: 1.3, outro: 1.0 } },
  playful: { layout: "editorial", feature: true, weights: { hook: 1.3, hero: 2.1, feature: 1.3, price: 1.2, outro: 1.1 } },
};

// Per-product variety pools. For a single ad the seed picks one coherent,
// mood-appropriate combo; across a batch (many products, one audience → one tone)
// the seed spreads products over these so a catalogue doesn't collapse to a few
// identical looks. Each pool leads with the mood's canonical choice, so nothing
// regresses. Font stays fixed per tone — it's core to the mood's identity.
const TONE_ACCENT_POOL: Record<Tone, string[]> = {
  luxe: ["#c8a24c", "#bd9a55", "#9c6b52", "#b0894a", "#caa661"],
  energetic: ["#ff5a1f", "#1f6bff", "#15c06a", "#ff2d55", "#0aa4ff"],
  playful: ["#ff5da2", "#ffb020", "#00c2b8", "#7c5cff", "#ff6b6b"],
  calm: ["#3f9d86", "#6f8fd0", "#c08457", "#5b9aa0", "#9a8f7a"],
  techy: ["#22e3d3", "#8b5cff", "#2bd96b", "#00c2ff", "#c77dff"],
  bold: ["#ff3b1d", "#ffd400", "#2b59ff", "#ff2079", "#00d68f"],
};

// Layouts each mood can wear. Wide (16:9) renders the distinct hero layouts;
// portrait falls back to banded, so this mainly diversifies landscape.
const TONE_LAYOUT_POOL: Record<Tone, LayoutVariant[]> = {
  luxe: ["editorial", "banded", "statement"],
  energetic: ["split", "banded", "editorial"],
  playful: ["editorial", "split", "banded"],
  calm: ["banded", "editorial"],
  techy: ["banded", "split"],
  bold: ["statement", "banded"],
};

const TONE_MOTION_POOL: Record<Tone, Motion[]> = {
  luxe: ["kenburns-in", "drift"],
  energetic: ["rise", "kenburns-in", "pop"],
  playful: ["pop", "rise", "kenburns-in"],
  calm: ["drift", "kenburns-in"],
  techy: ["rise", "kenburns-out", "kenburns-in"],
  bold: ["pop", "rise"],
};

// Copy templates keyed on tone (the LLM brain replaces these in v2).
const HOOKS: Record<Tone, string[]> = {
  luxe: ["Made to be gifted.", "Quietly exceptional.", "The detail you’ll notice."],
  energetic: ["Built to move.", "Less waiting. More doing.", "Your upgrade is here."],
  playful: ["Say hello to your new favorite.", "Yep, it’s that good.", "Big mood, small price."],
  calm: ["One less thing to worry about.", "Simple. Sorted.", "Made for real life."],
  techy: ["Spec’d to impress.", "Plug in. Power up.", "Smarter by design."],
  bold: ["Don’t blink.", "This changes things.", "Go big."],
};

const SUBHEADS: Record<Tone, string[]> = {
  luxe: ["Crafted for those who notice.", "An effortless upgrade."],
  energetic: ["Everything you need, nothing you don’t.", "Ready when you are."],
  playful: ["Designed to make you smile.", "Seriously fun, fairly priced."],
  calm: ["Thoughtful, dependable, easy.", "Made to just work."],
  techy: ["Engineered for performance.", "The details that matter."],
  bold: ["No compromises.", "Made to stand out."],
};

// Short editorial kicker per tone (replaces the templated "For {audience}" eyebrow,
// which read as an AI tell). The LLM brain overrides this with a bespoke kicker.
const KICKERS: Record<Tone, string[]> = {
  luxe: ["Considered", "The detail"],
  energetic: ["Go time", "Built different"],
  playful: ["Say hi", "New favorite"],
  calm: ["Effortless", "Sorted"],
  techy: ["Engineered", "By design"],
  bold: ["New", "Big news"],
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
  if (t.length <= max) return t;
  // Truncate on a word boundary so a long title never cuts mid-word ("Bark B…").
  let cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > max * 0.55) cut = cut.slice(0, lastSpace);
  // Trim a dangling separator / open bracket so it ends clean.
  return cut.replace(/[\s([{,;:.–-]+$/, "") + "…";
}

// Hard word cap for the hook line. Short-form ad research is consistent that the
// opener should be a handful of words, on screen by ~second one — so the hook is
// capped by word count (then by chars as a backstop), not just characters.
function clipWords(s: string, maxWords: number, maxChars: number): string {
  const words = s.trim().split(/\s+/);
  const capped = words.length > maxWords ? words.slice(0, maxWords).join(" ") : s;
  return clip(capped, maxChars);
}

// Trim a noisy marketplace title down to the core product — its type and edition,
// the way a human titles an ad. Drops a "(...)"/"[...]" variant block and a
// trailing "- colour/size/material" (or " | " / " / "-style) segment. Deterministic
// baseline; the LLM `name` refines it further. Keeps the whole title if trimming
// would leave too little.
export function coreName(title: string): string {
  let t = title.replace(/\s*[([{][^)\]}]*[)\]}]?\s*/g, " ").trim(); // drop (variant) blocks
  const parts = t.split(/\s+(?:[–—|]|-)\s+/); // " - " / " – " / " | " separators
  if (parts.length > 1 && parts[0].trim().length >= 8) t = parts[0].trim();
  return t.replace(/\s+/g, " ").trim() || title.trim();
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
  const display = coreName(title); // the headline shows the core product, not the variant noise
  const audience = input.audience.trim() || "everyone";
  const tone = toneFor(audience, title);
  const seed = hash(`${title}|${audience}|${input.variant ?? 0}`);

  // Coherent mood, varied per product: base palette + accent, layout, and motion
  // each drawn from the tone's pool on independent seed shifts — so a batch of
  // many products doesn't collapse to a handful of identical looks.
  const base = pick(PALETTES[tone], seed);
  const palette: Palette = { ...base, accent: pick(TONE_ACCENT_POOL[tone], seed >> 13) };
  const font = TONE_FONT[tone];
  const structure = TONE_STRUCTURE[tone];
  const layout = pick(TONE_LAYOUT_POOL[tone], seed >> 15);
  const motion = pick(TONE_MOTION_POOL[tone], seed >> 17);

  const hook = pick(HOOKS[tone], seed >> 5);
  const subhead = pick(SUBHEADS[tone], seed >> 7);
  const cta = CTAS[tone];
  const feature = pick(FEATURES[tone], seed >> 9);
  const eyebrow = pick(KICKERS[tone], seed >> 11);

  // Scene set is per-mood (TONE_STRUCTURE): hook -> hero -> (feature) -> (price)
  // -> outro, with mood-specific pacing weights. The optional feature beat only
  // appears for moods that want it AND when there's room.
  // Guard the duration: a NaN/0/negative/Infinity slips past `Math.max(1, …)`
  // (Math.max(1, NaN) === NaN) and would emit NaN scene frames → a broken
  // composition. Callers already clamp, but the brain must never produce one.
  const durationSec =
    Number.isFinite(input.durationSec) && input.durationSec > 0 ? input.durationSec : 10;
  const totalFrames = Math.max(1, Math.round(durationSec * FPS));
  const hasPrice = !!input.price.trim();
  const longEnough = durationSec >= 8;
  const w = structure.weights;

  const types: SceneType[] = ["hook", "hero"];
  const weights: number[] = [w.hook, w.hero];
  if (structure.feature && longEnough) {
    types.push("feature");
    weights.push(w.feature);
  }
  if (hasPrice) {
    types.push("price");
    weights.push(w.price);
  }
  types.push("outro");
  weights.push(w.outro);

  const frames = distribute(totalFrames, weights);
  const scenes: Scene[] = types.map((type, i) => {
    const base: Scene = { type, frames: frames[i], motion };
    if (type === "hook") base.text = clipWords(hook, 8, 42);
    if (type === "hero") base.text = clip(display, 48);
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
    headline: clip(display, 48),
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
  // Expand #abc → #aabbcc: the renderer concatenates 2-digit alpha suffixes
  // onto palette colors (e.g. `${panel}e6` for scrims), and a 3-digit token
  // would turn those into invalid 5-digit colors — the browser drops the
  // whole declaration and the text loses its legibility scrim.
  const safe = (c: string, fallback: string) => {
    if (!HEX.test(c)) return fallback;
    if (c.length === 4) {
      return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
    }
    return c;
  };
  const palette: Palette = {
    stage: safe(p.stage, "#ffffff"),
    panel: safe(p.panel, "#0b0b12"),
    accent: safe(p.accent, "#0447ff"),
    text: safe(p.text, "#ffffff"),
    onStage: safe(p.onStage, "#0b0b12"),
  };
  const min = Math.round(FPS * 0.6);
  // Math.max(min, NaN) is NaN — a non-finite frame count must clamp to the
  // floor, or one bad scene breaks the whole composition.
  const scenes = (spec.scenes.length ? spec.scenes : DEFAULT_SPEC.scenes).map((s) => ({
    ...s,
    frames: Number.isFinite(s.frames) ? Math.max(min, Math.round(s.frames)) : min,
  }));
  return { ...spec, palette, scenes };
}

export const DEFAULT_SPEC: AdSpec = {
  tone: "energetic",
  layout: "banded",
  palette: PALETTES.energetic[0],
  font: "grotesque",
  headline: "Your product",
  subhead: "Everything you need, nothing you don’t.",
  cta: "Shop now",
  eyebrow: "For everyone",
  scenes: [
    { type: "hook", frames: 36, text: "Your upgrade is here.", motion: "rise" },
    { type: "hero", frames: 132, text: "Your product", motion: "rise" },
    { type: "outro", frames: 42, text: "Shop now", motion: "rise" },
  ],
};
