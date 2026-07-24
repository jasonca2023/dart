import { describe, expect, it } from "vitest";
import { logoSources } from "./store";

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
