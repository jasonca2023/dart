import { describe, it, expect } from "vitest";
import { applyCopy } from "./copy";
import { DEFAULT_SPEC } from "./adSpec";

describe("applyCopy", () => {
  it("returns the spec unchanged when there's no copy", () => {
    expect(applyCopy(DEFAULT_SPEC, null)).toBe(DEFAULT_SPEC);
  });

  it("overlays only the fields the model returned, keeping the rest", () => {
    const s = applyCopy(DEFAULT_SPEC, { name: "New Name", cta: "Buy" });
    expect(s.headline).toBe("New Name");
    expect(s.cta).toBe("Buy");
    expect(s.subhead).toBe(DEFAULT_SPEC.subhead); // untouched
  });

  it("writes the headline into the hero scene too", () => {
    const s = applyCopy(DEFAULT_SPEC, { name: "Fresh Name" });
    expect(s.scenes.find((x) => x.type === "hero")?.text).toBe("Fresh Name");
  });

  it("caps a runaway AI hook to a handful of words", () => {
    const s = applyCopy(DEFAULT_SPEC, {
      hook: "one two three four five six seven eight nine ten eleven twelve",
    });
    const hook = s.scenes.find((x) => x.type === "hook")?.text ?? "";
    expect(hook.split(/\s+/).length).toBeLessThanOrEqual(9);
  });
});
