// A REAL-NETWORK test against live Shopify storefronts.
//
// The store-import happy path shipped broken because nothing ever fetched a real
// store: the only coverage was the backend's SSRF reject cases (empty URL,
// localhost). Every mock agreed with itself while the feature returned zero
// products for every merchant on earth. This is the test that would have caught
// it, so it has to touch the network to be worth anything.
//
// Deliberately tolerant of a single merchant: it asks several independent stores
// and requires ONE to answer. A shop going down, rebranding, or throttling us is
// not our regression. A real regression — URL construction, the Shopify feed
// shape, the 429 backoff, the product-link path — fails every store at once and
// still reds the build. Skips cleanly when there's no network at all.

import { beforeAll, describe, expect, it } from "vitest";
import { fetchStoreProducts, logoSources, type StoreProduct } from "./store";

// Independent merchants on Shopify. If all of these are simultaneously
// unreachable, the failure is ours or the network's, not theirs.
const STORES = ["allbirds.com", "kirrinfinch.com", "packagefreeshop.com"];

const NET_TIMEOUT = 120_000;

let online = false;

beforeAll(async () => {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);
    // example.com is not a Shopify store — this only asks "is there internet".
    const r = await fetch("https://example.com/", { signal: ctrl.signal });
    clearTimeout(t);
    online = r.ok;
  } catch {
    online = false;
  }
}, 30_000);

// Every product we hand to the renderer needs a title and a usable image; the
// price is optional but must be formatted when present.
function expectUsable(p: StoreProduct) {
  expect(p.title.trim()).not.toBe("");
  expect(p.image).toMatch(/^https:\/\//);
  expect(p.price === "" || /^\$/.test(p.price)).toBe(true);
}

describe("store import against live Shopify stores", () => {
  it(
    "reads a whole catalogue from at least one real store",
    async () => {
      if (!online) return; // offline — nothing to assert about the network
      const results: string[] = [];
      let wins = 0;

      for (const store of STORES) {
        try {
          const products = await fetchStoreProducts(store);
          if (products.length > 1) {
            wins++;
            products.forEach(expectUsable);
            results.push(`${store}: ${products.length}`);
          } else {
            results.push(`${store}: only ${products.length}`);
          }
        } catch (e) {
          results.push(`${store}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      expect(
        wins,
        `no live store returned a catalogue — ${results.join(" | ")}`,
      ).toBeGreaterThan(0);
    },
    NET_TIMEOUT,
  );

  it(
    "imports exactly one product from a product link",
    async () => {
      if (!online) return;

      // Resolve a handle at run time rather than hardcoding one: product handles
      // are the merchant's to change, and a 404 on a stale slug would look like
      // our bug.
      let productUrl: string | null = null;
      for (const store of STORES) {
        try {
          const r = await fetch(`https://${store}/products.json?limit=1`, {
            credentials: "omit",
          });
          if (!r.ok) continue;
          const handle = (await r.json())?.products?.[0]?.handle;
          if (typeof handle === "string" && handle) {
            productUrl = `https://${store}/products/${handle}`;
            break;
          }
        } catch {
          /* try the next store */
        }
      }
      if (!productUrl) return; // every store throttled us; covered by the test above

      const products = await fetchStoreProducts(productUrl);
      expect(products, `product link imported the wrong count from ${productUrl}`)
        .toHaveLength(1);
      expectUsable(products[0]);
    },
    NET_TIMEOUT,
  );

  // The logo scraper's reachability, decoupled from the canvas cutout (jsdom has
  // no 2D context, so prepareStoreLogo/prepareLogo can't run here). This asserts
  // the thing that actually breaks in the wild: icon.horse still resolving a real
  // store's mark to a decodable image. If it 404s, rebrands, or dies, this reds.
  it(
    "resolves a real brand mark from the primary logo source",
    async () => {
      if (!online) return;
      const [primary] = logoSources("gymshark.com");
      expect(primary).toContain("icon.horse");

      const r = await fetch(primary);
      expect(r.ok, `icon.horse returned ${r.status}`).toBe(true);
      const buf = new Uint8Array(await r.arrayBuffer());
      // PNG (\x89PNG), JPEG (\xFF\xD8\xFF), or ICO (\x00\x00\x01\x00) magic bytes.
      const isImage =
        (buf[0] === 0x89 && buf[1] === 0x50) ||
        (buf[0] === 0xff && buf[1] === 0xd8) ||
        (buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x01);
      expect(isImage, `not an image: first bytes ${buf.slice(0, 4)}`).toBe(true);
      expect(buf.length).toBeGreaterThan(100);
    },
    NET_TIMEOUT,
  );
});
