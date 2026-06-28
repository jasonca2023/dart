// Brand kit — an optional brand colour + logo the user sets once and reuses.
// Persisted in localStorage so it sticks across sessions (the "on-brand" value
// prop). Applied to the ad's accent; the logo (with smart background handling,
// see logo.ts) is overlaid by the renderer.

import type { AdSpec } from "./adSpec";

export interface BrandKit {
  accent?: string; // hex
  logo?: string; // data URL actually used in the ad
  logoChip?: string; // backing chip colour behind the logo (when it's a dark cutout)
  // Stored so the "remove background" toggle can flip without re-processing:
  logoOriginal?: string;
  logoCutout?: string;
  logoCutoutChip?: string;
  logoRemoved?: boolean; // a removable backdrop was detected
  logoUseCutout?: boolean; // is the cutout (vs the original) currently applied?
  logoTransparent?: boolean; // is the *active* logo transparent (safe to knock out)?
}

const KEY = "dart.brandkit.v1";
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const dataUrl = (v: unknown) =>
  typeof v === "string" && v.startsWith("data:") ? v : undefined;

export function loadBrandKit(): BrandKit {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const b = JSON.parse(raw) as Record<string, unknown>;
    return {
      accent: typeof b.accent === "string" && HEX.test(b.accent) ? b.accent : undefined,
      logo: dataUrl(b.logo),
      logoChip: str(b.logoChip),
      logoOriginal: dataUrl(b.logoOriginal),
      logoCutout: dataUrl(b.logoCutout),
      logoCutoutChip: str(b.logoCutoutChip),
      logoRemoved: b.logoRemoved === true,
      logoUseCutout: b.logoUseCutout === true,
      // Older kits predate this flag; leave it undefined so the renderer's
      // default (knock out an existing cutout) still applies to them.
      logoTransparent: typeof b.logoTransparent === "boolean" ? b.logoTransparent : undefined,
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
