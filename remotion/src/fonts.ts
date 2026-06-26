import { loadFont as loadFraunces } from "@remotion/google-fonts/Fraunces";
import { loadFont as loadBricolage } from "@remotion/google-fonts/BricolageGrotesque";
import { loadFont as loadJetBrains } from "@remotion/google-fonts/JetBrainsMono";
import type { FontKey } from "./adSpec";

// Real, characterful faces (Hallmark allowlist) instead of system stacks:
// an editorial high-contrast serif, a display grotesque, an engineering mono.
const serif = loadFraunces("normal", { weights: ["400", "600", "900"], subsets: ["latin"] });
const grotesque = loadBricolage("normal", { weights: ["600", "800"], subsets: ["latin"] });
const mono = loadJetBrains("normal", { weights: ["500", "700"], subsets: ["latin"] });

const FALLBACK: Record<FontKey, string> = {
  serif: 'Georgia, "Times New Roman", serif',
  grotesque: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  mono: 'ui-monospace, Menlo, monospace',
};

export const FONT_FAMILY: Record<FontKey, string> = {
  serif: `"${serif.fontFamily}", ${FALLBACK.serif}`,
  grotesque: `"${grotesque.fontFamily}", ${FALLBACK.grotesque}`,
  mono: `"${mono.fontFamily}", ${FALLBACK.mono}`,
};

// Resolves when the web fonts have loaded. The in-browser renderer awaits this
// before rasterizing so the exported video uses the real faces, not the fallback.
export const fontsReady: Promise<unknown> = Promise.all([
  serif.waitUntilDone(),
  grotesque.waitUntilDone(),
  mono.waitUntilDone(),
]);
