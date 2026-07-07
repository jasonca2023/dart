import { describe, it, expect } from "vitest";
import { money, cost, isTerminal, pipelineProgress } from "./format";
import type { JobStatus } from "./types";

describe("money", () => {
  it("formats USD cents", () => {
    expect(money(12345)).toBe("$123.45");
  });
  it("falls back to $ for an invalid currency code (the scraped-currency crash)", () => {
    expect(money(12345, "US Dollar")).toBe("$123.45");
    expect(money(500, "£")).toBe("$5.00");
  });
  it("handles a valid non-USD code", () => {
    expect(money(1234, "GBP")).toContain("12.34");
  });
});

describe("cost", () => {
  it("shows an em dash for zero/negative", () => {
    expect(cost(0)).toBe("—");
    expect(cost(-5)).toBe("—");
  });
  it("formats positive cents", () => {
    expect(cost(150)).toBe("$1.50");
  });
});

describe("isTerminal & pipelineProgress", () => {
  it("marks ready/failed terminal, others not", () => {
    expect(isTerminal("ready")).toBe(true);
    expect(isTerminal("failed")).toBe(true);
    expect(isTerminal("scraping")).toBe(false);
  });
  it("keeps progress within 0..1 for every status", () => {
    const all: JobStatus[] = ["queued", "scraping", "scripting", "rendering", "ready", "failed"];
    for (const st of all) {
      const p = pipelineProgress(st);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });
});
