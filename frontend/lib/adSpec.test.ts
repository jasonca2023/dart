import { describe, it, expect } from "vitest";
import {
  buildAdSpec,
  clampSpec,
  coreName,
  DEFAULT_SPEC,
  type AdSpec,
  type Palette,
} from "./adSpec";

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const PALETTE_KEYS: (keyof Palette)[] = ["stage", "panel", "accent", "text", "onStage"];
const heroMotion = (s: AdSpec) => s.scenes.find((x) => x.type === "hero")?.motion;

describe("buildAdSpec — structure & frames", () => {
  it("scene frames sum exactly to duration*30, each >= min, across durations & prices", () => {
    for (let d = 3; d <= 20; d++) {
      for (const price of ["", "$129", "$1,299.99", "€79"]) {
        const s = buildAdSpec({
          title: "Sony WH-1000XM5 Headphones (Renewed)",
          audience: "Gen Z tech enthusiasts",
          price,
          durationSec: d,
        });
        const sum = s.scenes.reduce((a, b) => a + b.frames, 0);
        expect(sum).toBe(Math.round(d * 30));
        for (const sc of s.scenes) expect(sc.frames).toBeGreaterThanOrEqual(18);
      }
    }
  });

  it("emits a price scene iff a price is given", () => {
    const withPrice = buildAdSpec({ title: "X", audience: "", price: "$5", durationSec: 10 });
    const noPrice = buildAdSpec({ title: "X", audience: "", price: "", durationSec: 10 });
    expect(withPrice.scenes.some((x) => x.type === "price")).toBe(true);
    expect(noPrice.scenes.some((x) => x.type === "price")).toBe(false);
  });

  it("never emits NaN/negative frames for hostile durations", () => {
    for (const durationSec of [NaN, 0, -5, Infinity, 0.4]) {
      const s = buildAdSpec({ title: "X", audience: "", price: "", durationSec });
      const sum = s.scenes.reduce((a, b) => a + b.frames, 0);
      expect(Number.isFinite(sum)).toBe(true);
      expect(sum).toBeGreaterThan(0);
      for (const sc of s.scenes) expect(sc.frames).toBeGreaterThanOrEqual(18);
    }
  });
});

describe("buildAdSpec — palette & determinism", () => {
  const audiences = ["Runners", "Gen Z gamers", "Luxury gift shoppers", "Busy parents", "Bold streetwear", "Wellness / calm"];

  it("always produces valid hex palette colours", () => {
    for (let i = 0; i < 600; i++) {
      const s = buildAdSpec({
        title: `Product ${i}`,
        audience: audiences[i % audiences.length],
        price: i % 2 ? "$50" : "",
        durationSec: 3 + (i % 18),
      });
      for (const k of PALETTE_KEYS) expect(s.palette[k]).toMatch(HEX);
    }
  });

  it("is deterministic for identical input", () => {
    const inp = { title: "Aero Runner", audience: "Runners", price: "$120", durationSec: 10 };
    expect(JSON.stringify(buildAdSpec(inp))).toBe(JSON.stringify(buildAdSpec({ ...inp })));
  });

  it("keeps a coherent tone but varies the look across a one-audience batch", () => {
    const combos = new Set<string>();
    const tones = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const s = buildAdSpec({ title: `Model ${i} Edition ${(i * 7) % 13}`, audience: "Runners", price: "$99", durationSec: 10 });
      combos.add(`${s.palette.accent}|${s.layout}|${heroMotion(s)}`);
      tones.add(s.tone);
    }
    expect(combos.size).toBeGreaterThanOrEqual(8); // varied looks
    expect(tones.size).toBe(1); // one audience → one coherent mood
  });

  it("shuffle (variant) meaningfully changes the look", () => {
    const combos = new Set<string>();
    for (let v = 0; v < 8; v++) {
      const s = buildAdSpec({ title: "Aero Runner", audience: "Runners", price: "$120", durationSec: 10, variant: v });
      combos.add(`${s.palette.accent}|${s.layout}|${heroMotion(s)}`);
    }
    expect(combos.size).toBeGreaterThanOrEqual(3);
  });
});

describe("clampSpec", () => {
  it("repairs invalid colours and non-finite frames", () => {
    const s = clampSpec({
      ...DEFAULT_SPEC,
      palette: { stage: "red", panel: "#zzz", accent: "javascript:alert(1)", text: "", onStage: "#0b0b12" },
      scenes: [
        { type: "hero", frames: NaN },
        { type: "outro", frames: -20 },
      ],
    } as AdSpec);
    for (const k of PALETTE_KEYS) expect(s.palette[k]).toMatch(HEX);
    for (const sc of s.scenes) expect(sc.frames).toBeGreaterThanOrEqual(18);
  });

  it("never leaves scenes empty", () => {
    expect(clampSpec({ ...DEFAULT_SPEC, scenes: [] }).scenes.length).toBeGreaterThan(0);
  });
});

describe("coreName", () => {
  it("drops variant noise but keeps the core product name", () => {
    expect(coreName("Men's Strider - Natural Black (Natural Black Sole)")).toBe("Men's Strider");
  });
  it("returns a string for junk / empty input", () => {
    expect(typeof coreName("")).toBe("string");
    expect(typeof coreName("🔥🔥🔥")).toBe("string");
  });
});
