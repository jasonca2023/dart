import { describe, expect, it } from "vitest";
import { isUsableStoreLogo, logoSources } from "./store";
import type { PreparedLogo } from "./logo";

function fake(fill: number, transparent = true): PreparedLogo {
  return { original: "x", cutout: "x", removed: false, transparent, fill };
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
    expect(isUsableStoreLogo(fake(1, false))).toBe(false);
  });

  // Real fill values, measured by running the actual prepareLogo() (bundled and
  // executed in headless Chrome, since jsdom has no canvas) on each store's
  // icon.horse-scraped favicon, then confirmed against the real ad renderer:
  // deathwishcoffee's disc-badge favicon rendered as a featureless black circle
  // on the end-card; the other five silhouetted correctly.
  it("accepts real marks that silhouette cleanly", () => {
    expect(isUsableStoreLogo(fake(0.22))).toBe(true); // gymshark.com
    expect(isUsableStoreLogo(fake(0.41))).toBe(true); // allbirds.com
    expect(isUsableStoreLogo(fake(0.59))).toBe(true); // glossier.com
    expect(isUsableStoreLogo(fake(0.5))).toBe(true); // bombas.com
    expect(isUsableStoreLogo(fake(0.28))).toBe(true); // nike.com
  });

  it("rejects a solid badge that would knock out to a blank blob", () => {
    expect(isUsableStoreLogo(fake(0.82))).toBe(false); // deathwishcoffee.com
  });

  it("draws the line at the boundary", () => {
    expect(isUsableStoreLogo(fake(0.65))).toBe(true);
    expect(isUsableStoreLogo(fake(0.66))).toBe(false);
  });
});
