// Brand kit — an optional brand colour + logo the user sets once and reuses.
// Persisted in localStorage so it sticks across sessions (the "on-brand" value
// prop). Applied to the ad's accent; the logo is overlaid by the renderer.

import type { AdSpec } from "./adSpec";

export interface BrandKit {
  accent?: string; // hex
  logo?: string; // data URL
}

const KEY = "dart.brandkit.v1";
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function loadBrandKit(): BrandKit {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const b = JSON.parse(raw) as BrandKit;
    return {
      accent: typeof b.accent === "string" && HEX.test(b.accent) ? b.accent : undefined,
      logo: typeof b.logo === "string" && b.logo.startsWith("data:") ? b.logo : undefined,
    };
  } catch {
    return {};
  }
}

export function saveBrandKit(b: BrandKit): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(b));
  } catch {
    /* quota / private mode — non-fatal; the kit still works for this session */
  }
}

// Override the mood's accent with the brand colour (if valid). Pure.
export function applyBrand(spec: AdSpec, brand: BrandKit): AdSpec {
  if (!brand.accent || !HEX.test(brand.accent)) return spec;
  return { ...spec, palette: { ...spec.palette, accent: brand.accent } };
}

// Read a logo File into a data URL (canvas-safe for the renderer). Rejects files
// that are too large to persist comfortably.
export function readLogo(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    if (file.size > 600_000) {
      resolve(null); // ~600KB cap — keeps localStorage happy
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}
