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

// Best-effort: pull the store's brand mark (its favicon, via Google's service +
// the SSRF-guarded image proxy) and prepare it as a knockout-ready cutout, so the
// catalogue's ads sign off with the store's own logo. Returns null if unavailable.
export async function fetchStoreLogo(storeUrl: string): Promise<PreparedLogo | null> {
  if (!API_BASE) return null;
  try {
    const host = new URL(
      storeUrl.includes("://") ? storeUrl : `https://${storeUrl}`,
    ).hostname;
    const fav = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
    const res = await fetch(`${API_BASE}/proxy-image?url=${encodeURIComponent(fav)}`);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await prepareLogo(new File([blob], "logo.png", { type: blob.type || "image/png" }));
  } catch {
    return null;
  }
}

export async function fetchStoreProducts(storeUrl: string): Promise<StoreProduct[]> {
  if (!API_BASE) throw new Error("Backend URL is not configured.");
  const url = storeUrl.trim();
  if (!url) throw new Error("Enter your store URL.");
  const res = await fetch(`${API_BASE}/store-products?url=${encodeURIComponent(url)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message || `Couldn't read that store (${res.status}).`);
  }
  const data = (await res.json()) as { products?: StoreProduct[] };
  return data.products ?? [];
}
