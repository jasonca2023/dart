// Pull a merchant's catalogue from their store's public Shopify products feed, so
// they can batch-generate an ad for every product at once.
//
// Read from the BROWSER first, backend second. Shopify serves /products.json with
// `access-control-allow-origin: *`, so the merchant's own browser can read their
// own store's public feed cross-origin. That is not a nicety — Shopify's edge
// rate-limits our server's IP (a fast 429, TLS handshake completes and the edge
// refuses), so the server-side path fails for most real stores while the same URL
// returns 200 from a normal browser. The backend stays as the fallback: it can
// parse a non-Shopify product page's JSON-LD, which CORS won't let us read here.

import { API_BASE } from "./api";
import { prepareLogo, type PreparedLogo } from "./logo";

export interface StoreProduct {
  title: string;
  image: string; // product image URL (Shopify CDN)
  price: string; // formatted, e.g. "$45.00", or "" if none
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

export async function fetchStoreProducts(storeUrl: string): Promise<StoreProduct[]> {
  const url = storeUrl.trim();
  if (!url) throw new Error("Enter your store URL.");

  const direct = await fetchFeedInBrowser(url);
  if (direct) return direct;

  if (!API_BASE) throw new Error("Backend URL is not configured.");
  const res = await fetch(`${API_BASE}/store-products?url=${encodeURIComponent(url)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message || `Couldn't read that store (${res.status}).`);
  }
  const data = (await res.json()) as { products?: StoreProduct[] };
  return data.products ?? [];
}

// The store's brand mark can't be scraped directly: its homepage HTML sends no
// CORS header (so the browser can't read it) and Shopify's edge rate-limits our
// server the same way it blocks the product feed (so the backend can't either).
// icon.horse resolves the store's real apple-touch-icon on its OWN infrastructure
// — which Shopify doesn't throttle — and hands back an image we CAN fetch through
// the proxy. Google's favicon service is the fallback. Ordered best-first; the
// domain is all either needs.
export function logoSources(storeUrl: string): string[] {
  let host: string;
  try {
    host = new URL(storeUrl.includes("://") ? storeUrl : `https://${storeUrl}`).hostname;
  } catch {
    return [];
  }
  // icon.horse keys on the bare registrable domain; a leading www. just misses.
  const domain = host.replace(/^www\./i, "");
  if (!domain) return [];
  return [
    `https://icon.horse/icon/${domain}`,
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=256`,
  ];
}

// The end-card knocks the logo out to a single flat colour so it's legible on any
// panel. That only works for a mark that's a shape — a wordmark, a swoosh. A
// favicon that's a logo on a solid disc/tile is opaque edge to edge, so knockout
// flattens the whole badge to a featureless blob (a black circle — confirmed by
// rendering deathwishcoffee.com's scraped favicon through the actual ad renderer).
// Reject those: a scraped mark is only worth showing if it silhouettes cleanly.
// Measured across real stores, that badge sits at 0.82 fill while five other
// stores' genuine marks (Nike, Gymshark, Allbirds, Glossier, Bombas) all sit at
// 0.59 or below.
export const MAX_LOGO_FILL = 0.65;

// Pulled out of prepareStoreLogo so the accept/reject call is unit-testable on
// plain data — prepareLogo itself needs a real <canvas>, which jsdom doesn't
// have, so this is the part of the decision that CAN run without a browser.
export function isUsableStoreLogo(prepared: PreparedLogo | null): boolean {
  return !!prepared && prepared.transparent && prepared.fill <= MAX_LOGO_FILL;
}

// Prepare the store's brand mark (a knockout-ready cutout) for the ad end-cards.
// Resolves the mark via logoSources and runs the first that yields a clean,
// silhouette-able cutout through the SSRF-guarded image proxy + prepareLogo.
// Returns null when nothing usable resolves — the end-card then falls back to the
// store name, so the logo stays optional (and a solid badge doesn't become a blob).
export async function prepareStoreLogo(storeUrl: string): Promise<PreparedLogo | null> {
  if (!API_BASE) return null;
  for (const src of logoSources(storeUrl)) {
    try {
      const res = await fetch(`${API_BASE}/proxy-image?url=${encodeURIComponent(src)}`);
      if (!res.ok) continue;
      const blob = await res.blob();
      const prepared = await prepareLogo(
        new File([blob], "logo.png", { type: blob.type || "image/png" }),
      );
      if (isUsableStoreLogo(prepared)) return prepared;
    } catch {
      /* try the next source */
    }
  }
  return null;
}
