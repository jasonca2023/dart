// Pull a merchant's catalogue from their store's public Shopify products feed, so
// they can batch-generate an ad for every product at once.
//
// Read from the BROWSER first, backend second. Shopify serves /products.json with
// `access-control-allow-origin: *`, so the merchant's own browser can read their
// own store's public feed cross-origin. That is not a nicety — Shopify's edge
// fast-403s datacenter IPs (~0.3s, TLS handshake completes and the edge refuses),
// so the server-side path fails for most real stores while the same URL returns
// 200 from a normal browser. The backend stays as the fallback: it can parse a
// non-Shopify product page's JSON-LD, which CORS won't let us read here.

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

const FEED_TIMEOUT_MS = 15_000;
const MAX_PRODUCTS = 100;

// Loopback / link-local / private hosts are never a real storefront. The browser
// would just fail on them, but refusing up front keeps the two paths consistent
// with the backend's SSRF guard instead of probing the user's own network.
const PRIVATE_HOST =
  /^(localhost$|127\.|0\.0\.0\.0$|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[|.*\.local$)/i;

function storeUrlOf(raw: string): URL | null {
  try {
    const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (PRIVATE_HOST.test(u.hostname)) return null;
    return u;
  } catch {
    return null;
  }
}

// Shopify's feed shape -> our StoreProduct. Skips anything without a title and
// an image, since an ad needs both.
function mapShopifyProducts(list: unknown): StoreProduct[] {
  if (!Array.isArray(list)) return [];
  const out: StoreProduct[] = [];
  for (const raw of list.slice(0, MAX_PRODUCTS)) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Record<string, unknown>;
    const images = Array.isArray(p.images) ? (p.images as Record<string, unknown>[]) : [];
    const variants = Array.isArray(p.variants) ? (p.variants as Record<string, unknown>[]) : [];
    const src = images[0]?.src;
    const price = variants[0]?.price;
    const title = p.title;
    if (typeof title !== "string" || !title || typeof src !== "string" || !src) continue;
    out.push({
      title,
      image: src,
      price: price == null || price === "" ? "" : `$${String(price)}`,
    });
  }
  return out;
}

async function getJson(url: string, retries = 2): Promise<unknown | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FEED_TIMEOUT_MS);
  try {
    // `credentials: omit` so the merchant's store session cookies never ride along.
    const res = await fetch(url, { signal: ctrl.signal, credentials: "omit" });
    // Shopify throttles bursts (429) and sheds load (503) — a store will happily
    // answer 200, 429, 200, 429 to the same URL. Both are transient and answered
    // instantly, so backing off once turns a silent fall-through (a product link
    // quietly importing the whole catalogue) into the read the user asked for.
    if ((res.status === 429 || res.status === 503) && retries > 0) {
      const after = Number(res.headers.get("retry-after"));
      const waitMs = Number.isFinite(after) && after > 0 ? Math.min(after * 1000, 5_000) : 700;
      await new Promise((r) => setTimeout(r, waitMs));
      return getJson(url, retries - 1);
    }
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null; // CORS-blocked, offline, not JSON — the backend gets its turn
  } finally {
    clearTimeout(timer);
  }
}

// The browser-side read. Returns null (not an error) when this isn't a readable
// Shopify feed, so the caller falls through to the backend.
async function fetchFeedInBrowser(raw: string): Promise<StoreProduct[] | null> {
  if (typeof window === "undefined") return null;
  const u = storeUrlOf(raw);
  if (!u) return null;

  // A product link imports just that product; a bare store URL imports the lot.
  const handle = /\/products\/([^/?#.]+)/.exec(u.pathname)?.[1];
  if (handle) {
    const one = (await getJson(`${u.origin}/products/${handle}.json`)) as
      | { product?: unknown }
      | null;
    const mapped = mapShopifyProducts(one?.product ? [one.product] : []);
    if (mapped.length) return mapped;
  }

  const feed = (await getJson(`${u.origin}/products.json?limit=${MAX_PRODUCTS}`)) as
    | { products?: unknown }
    | null;
  const mapped = mapShopifyProducts(feed?.products);
  return mapped.length ? mapped : null;
}

export async function fetchStoreProducts(storeUrl: string): Promise<StoreImport> {
  const url = storeUrl.trim();
  if (!url) throw new Error("Enter your store URL.");

  // The store's own brand mark needs the homepage HTML, which sends no CORS
  // header — so the browser path returns no logo and prepareStoreLogo falls back
  // to the favicon service.
  const direct = await fetchFeedInBrowser(url);
  if (direct) return { products: direct, logo: null };

  if (!API_BASE) throw new Error("Backend URL is not configured.");
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
