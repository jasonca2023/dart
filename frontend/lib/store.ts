// Pull a merchant's catalogue from their store's public Shopify products feed (via
// the backend's SSRF-guarded /store-products proxy), so they can batch-generate an ad
// for every product at once.

import { API_BASE } from "./api";

export interface StoreProduct {
  title: string;
  image: string; // product image URL (Shopify CDN)
  price: string; // formatted, e.g. "$45.00", or "" if none
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
