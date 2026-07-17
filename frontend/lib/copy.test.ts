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

  it("word-caps a hook of many SHORT words that fits the char cap", () => {
    // 21 one-letter words is only 41 chars — under the 42-char clip — so this
    // is the case only a real word cap catches. (A previous version of this
    // suite used long words whose char total tripped the char clip first, so
    // the test passed while the word cap was actually dead code.)
    const s = applyCopy(DEFAULT_SPEC, {
      hook: "a b c d e f g h i j k l m n o p q r s t u",
    });
    const hook = s.scenes.find((x) => x.type === "hook")?.text ?? "";
    expect(hook.split(/\s+/).length).toBeLessThanOrEqual(8);
  });
});
