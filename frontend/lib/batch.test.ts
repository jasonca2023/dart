import { describe, it, expect, beforeEach } from "vitest";
import { setBatch, getBatch, getBatchLabel } from "./batch";

beforeEach(() => sessionStorage.clear());

describe("batch storage", () => {
  it("round-trips ids", () => {
    setBatch(["a", "b", "c"]);
    expect(getBatch()).toEqual(["a", "b", "c"]);
  });

  it("stores and reads per-id labels", () => {
    setBatch(["a", "b", "c"], ["Benefit", "Value", "Bold"]);
    expect(getBatchLabel("b")).toBe("Value");
    expect(getBatchLabel("z")).toBeNull(); // id not in batch
  });

  it("returns null label when none stored", () => {
    setBatch(["a", "b"]);
    expect(getBatchLabel("a")).toBeNull();
  });

  it("reads the legacy array shape (pre-labels)", () => {
    sessionStorage.setItem("dart:batch", JSON.stringify(["x", "y"]));
    expect(getBatch()).toEqual(["x", "y"]);
    expect(getBatchLabel("x")).toBeNull();
  });

  it("is empty when nothing is stored", () => {
    expect(getBatch()).toEqual([]);
    expect(getBatchLabel("a")).toBeNull();
  });
});
