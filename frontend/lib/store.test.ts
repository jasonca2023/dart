import { describe, expect, it } from "vitest";
import { isUsableStoreLogo, logoSources } from "./store";
import type { PreparedLogo } from "./logo";

// Defaults describe a mark that passes every gate but the one under test: big
// enough, and black ink (what a real silhouetted logo looks like).
function fake(fill: number, over: Partial<PreparedLogo> = {}): PreparedLogo {
  return {
    original: "x",
    cutout: "x",
    removed: false,
    transparent: true,
    fill,
    width: 192,
    height: 163,
    inkSat: 0,
    inkLum: 0.01,
    ...over,
  };
}

describe("logoSources", () => {
  it("puts icon.horse first, google fallback second", () => {
    const s = logoSources("allbirds.com");
    expect(s).toHaveLength(2);
    expect(s[0]).toBe("https://icon.horse/icon/allbirds.com");
    expect(s[1]).toContain("google.com/s2/favicons");
    expect(s[1]).toContain("sz=256");
  });

  it("strips a leading www. — icon.horse keys on the bare domain", () => {
    expect(logoSources("https://www.gymshark.com/collections/x")[0]).toBe(
      "https://icon.horse/icon/gymshark.com",
    );
  });

  it("derives the domain from a full product URL", () => {
    expect(
      logoSources("https://deathwishcoffee.com/products/the-original")[0],
    ).toBe("https://icon.horse/icon/deathwishcoffee.com");
  });

  it("accepts a bare host with no scheme", () => {
    expect(logoSources("kirrinfinch.com")[0]).toBe(
      "https://icon.horse/icon/kirrinfinch.com",
    );
  });

  it("returns nothing for input that can't yield a host", () => {
    expect(logoSources("")).toEqual([]);
    expect(logoSources("   ")).toEqual([]);
    expect(logoSources("http://")).toEqual([]);
  });
});

describe("isUsableStoreLogo", () => {
  it("rejects null (nothing resolved)", () => {
    expect(isUsableStoreLogo(null)).toBe(false);
  });

  it("rejects an opaque (non-transparent) result — knockout needs alpha", () => {
    expect(isUsableStoreLogo(fake(1, { transparent: false }))).toBe(false);
  });

  // Every number below was measured by running the actual prepareLogo() (bundled
  // and executed in headless Chrome, since jsdom has no canvas) over each
  // store's icon.horse-scraped favicon, then confirmed against the real ad
  // renderer.
  it("accepts real marks that silhouette cleanly at a usable size", () => {
    // gymshark.com — 192x163 cutout, black ink
    expect(isUsableStoreLogo(fake(0.22))).toBe(true);
    // nike.com — 159x66, near-black
    expect(isUsableStoreLogo(fake(0.28, { width: 159, height: 66, inkLum: 0.067 }))).toBe(true);
    // allbirds.com — 45x64; the long edge clears the floor
    expect(isUsableStoreLogo(fake(0.41, { width: 45, height: 64, inkLum: 0.127 }))).toBe(true);
  });

  // deathwishcoffee.com: a skull on a solid black disc. Knockout flattens an
  // opaque badge into a featureless circle — confirmed on the real end-card.
  it("rejects a solid badge that would knock out to a blank blob", () => {
    expect(isUsableStoreLogo(fake(0.82, { width: 32, height: 32, inkLum: 0.234 }))).toBe(false);
  });

  it("draws the fill line at the boundary", () => {
    expect(isUsableStoreLogo(fake(0.65))).toBe(true);
    expect(isUsableStoreLogo(fake(0.66))).toBe(false);
  });

  // The end-card upscales anything shorter than MIN_LOGO_EDGE, and a curved
  // stroke stair-steps at ~2x. bombas.com and glossier.com only publish a 32px
  // favicon, so both lose their mark and fall back to the store name.
  it("rejects a mark too small for the end-card", () => {
    expect(isUsableStoreLogo(fake(0.5, { width: 32, height: 26, inkSat: 107, inkLum: 0.223 }))).toBe(
      false,
    ); // bombas.com
    expect(isUsableStoreLogo(fake(0.586, { width: 26, height: 32, inkLum: 0.128 }))).toBe(false); // glossier.com
  });

  it("measures the size floor on the long edge, not both", () => {
    expect(isUsableStoreLogo(fake(0.3, { width: 200, height: 20 }))).toBe(true); // a wide wordmark
    expect(isUsableStoreLogo(fake(0.3, { width: 63, height: 63 }))).toBe(false);
    expect(isUsableStoreLogo(fake(0.3, { width: 64, height: 10 }))).toBe(true);
  });

  // icon.horse answers 200 for a domain with no icon by generating a grey letter
  // tile; our backdrop stripper turns it into a clean glyph that passes fill and
  // size. Both tiles measured at sat 0 / lum 0.471.
  it("rejects a generated placeholder tile posing as a mark", () => {
    expect(isUsableStoreLogo(fake(0.646, { width: 97, height: 121, inkLum: 0.471 }))).toBe(false);
    expect(isUsableStoreLogo(fake(0.399, { width: 102, height: 121, inkLum: 0.471 }))).toBe(false);
  });

  it("keeps real marks that are achromatic but pushed to an extreme", () => {
    expect(isUsableStoreLogo(fake(0.3, { inkSat: 0, inkLum: 0.003 }))).toBe(true); // black
    expect(isUsableStoreLogo(fake(0.3, { inkSat: 0, inkLum: 0.98 }))).toBe(true); // white
  });

  it("keeps a mid-luminance mark that carries real colour", () => {
    // Saturation is what separates a brand from a neutral placeholder here.
    expect(isUsableStoreLogo(fake(0.3, { inkSat: 107, inkLum: 0.45 }))).toBe(true);
  });
});
