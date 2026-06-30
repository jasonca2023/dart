// Pull a merchant's catalogue from their store's public Shopify products feed (via
// the backend's SSRF-guarded /store-products proxy), so they can batch-generate an ad
// for every product at once.

import { API_BASE } from "./api";
import { prepareLogo, type PreparedLogo } from "./logo";

export interface StoreProduct {
  title: string;
  image: string; // product image URL (Shopify CDN)
  price: string; // formatted, e.g. "$45.00", or "" if none
}

export interface StoreImport {
  products: StoreProduct[];
  logo: string | null; // the store's brand-mark URL, if one was found
}

export async function fetchStoreProducts(storeUrl: string): Promise<StoreImport> {
  if (!API_BASE) throw new Error("Backend URL is not configured.");
  const url = storeUrl.trim();
  if (!url) throw new Error("Enter your store URL.");
  const res = await fetch(`${API_BASE}/store-products?url=${encodeURIComponent(url)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message || `Couldn't read that store (${res.status}).`);
  }
  const data = (await res.json()) as { products?: StoreProduct[]; logo?: string | null };
  return { products: data.products ?? [], logo: data.logo ?? null };
}

// Prepare the store's brand mark (a knockout-ready cutout) for the ad end-cards.
// Tries the scraped logo first (a higher-res apple-touch-icon / favicon from the
// store itself), then Google's favicon service as a fallback — both go through the
// SSRF-guarded image proxy. Returns null if none can be prepared.
export async function prepareStoreLogo(
  logoUrl: string | null,
  storeUrl: string,
): Promise<PreparedLogo | null> {
  if (!API_BASE) return null;
  const sources: string[] = [];
  if (logoUrl) sources.push(logoUrl);
  try {
    const host = new URL(
      storeUrl.includes("://") ? storeUrl : `https://${storeUrl}`,
    ).hostname;
    sources.push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`);
  } catch {
    /* bad url — skip the favicon fallback */
  }
  for (const src of sources) {
    try {
      const res = await fetch(`${API_BASE}/proxy-image?url=${encodeURIComponent(src)}`);
      if (!res.ok) continue;
      const blob = await res.blob();
      const prepared = await prepareLogo(
        new File([blob], "logo.png", { type: blob.type || "image/png" }),
      );
      if (prepared) return prepared;
    } catch {
      /* try the next source */
    }
  }
  return null;
}
