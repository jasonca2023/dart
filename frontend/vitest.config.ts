import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit tests for the pure frontend logic — the brain (adSpec), copy overlay,
// batch storage, and formatting helpers. jsdom gives us sessionStorage etc.
// The `@/` alias mirrors tsconfig so tests import the same way the app does.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    include: ["lib/**/*.test.ts", "lib/**/*.test.tsx"],
  },
});
