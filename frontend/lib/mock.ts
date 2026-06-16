// Client-side mock of the Dart pipeline. Deterministic, time-based, reload-safe.
// Active only when NEXT_PUBLIC_API_BASE_URL is unset. Swapped out the moment
// the real backend is live (see lib/api.ts).

import type {
  ApiError,
  CreateJobInput,
  Job,
  Product,
  Script,
} from "./types";

const STORE_KEY = "dart.mock.jobs.v1";

// Stage thresholds in ms from creation. The pipeline advances purely on
// elapsed wall-clock time, so polling and reloads both stay consistent.
const T = {
  scraping: 1200,
  scripting: 4700,
  rendering: 7700,
  ready: 14000,
} as const;

const MOCK_PRODUCTS: Omit<Product, "source">[] = [
  {
    title: "Aero Runner",
    price: 14800,
    currency: "USD",
    images: [
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=900&q=80&auto=format&fit=crop",
    ],
    specs: { weight: "238 g", drop: "8 mm", colorway: "Bone / Ember" },
  },
  {
    title: "Studio Headphones",
    price: 27900,
    currency: "USD",
    images: [
      "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=900&q=80&auto=format&fit=crop",
    ],
    specs: { driver: "40 mm", battery: "32 h", weight: "254 g" },
  },
  {
    title: "Field Backpack",
    price: 19500,
    currency: "USD",
    images: [
      "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=900&q=80&auto=format&fit=crop",
    ],
    specs: { volume: "22 L", fabric: "Ripstop nylon", weight: "780 g" },
  },
  {
    title: "Tide Watch",
    price: 32000,
    currency: "USD",
    images: [
      "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=900&q=80&auto=format&fit=crop",
    ],
    specs: { case: "38 mm steel", movement: "Automatic", water: "100 m" },
  },
  {
    title: "Lumen Candle",
    price: 4200,
    currency: "USD",
    images: [
      "https://images.unsplash.com/photo-1602874801007-bd36c376cd16?w=900&q=80&auto=format&fit=crop",
    ],
    specs: { burn: "60 h", scent: "Cedar / Salt", wax: "Coconut soy" },
  },
];

const SAMPLE_VIDEO =
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4";

interface MockRecord extends CreateJobInput {
  id: string;
  created_at: number;
  seed: number;
  fail: boolean;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function uuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function readStore(): MockRecord[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeStore(records: MockRecord[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORE_KEY, JSON.stringify(records));
}

function prettyTitle(url: string): string | null {
  try {
    const path = new URL(url).pathname;
    const slug = path.split("/").filter(Boolean).pop();
    if (!slug || slug.length < 3) return null;
    const words = slug
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[-_]+/g, " ")
      .trim();
    if (!/[a-z]/i.test(words)) return null;
    return words
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  } catch {
    return null;
  }
}

function detectSource(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("shopify") || u.includes("/products/")) return "shopify";
  if (u.includes("amazon") || u.includes("/dp/")) return "amazon";
  if (u.includes("etsy")) return "etsy";
  return "web";
}

function buildProduct(rec: MockRecord): Product {
  const titleFromUrl = prettyTitle(rec.product_url);
  // If the URL slug names a product we know, use its full record so the image
  // matches the title; otherwise keep the URL title over a hashed stock image.
  const matched = titleFromUrl
    ? MOCK_PRODUCTS.find(
        (p) => p.title.toLowerCase() === titleFromUrl.toLowerCase(),
      )
    : undefined;
  const base = matched ?? MOCK_PRODUCTS[rec.seed % MOCK_PRODUCTS.length];
  return {
    ...base,
    title: titleFromUrl || base.title,
    source: detectSource(rec.product_url),
  };
}

function buildScript(rec: MockRecord, product: Product): Script {
  const audience = rec.target_audience.trim() || "a broad consumer audience";
  const name = product.title;
  const dur = rec.duration_sec ?? 10;
  const beat = dur / 4;
  return {
    video_prompt: `Cinematic ${dur}s commercial for ${name}, shot for ${audience}. A photoreal virtual presenter handles the real product under soft studio light. Slow push-ins, shallow depth of field, warm grade. Product hero in the final beat, logo-clean.`,
    scenes: [
      {
        t_start: 0,
        t_end: Math.round(beat),
        description: `Open on ${name} resting in shadow. A hand enters frame and lifts it toward the light.`,
        camera: "slow push-in",
      },
      {
        t_start: Math.round(beat),
        t_end: Math.round(beat * 2),
        description: `Presenter turns ${name}, catching a highlight along its edge. Detail of the ${
          Object.keys(product.specs)[0] || "finish"
        }.`,
        camera: "orbit-left",
      },
      {
        t_start: Math.round(beat * 2),
        t_end: Math.round(beat * 3),
        description: `Quick lifestyle cut — ${name} in use, framed for ${audience}.`,
        camera: "handheld follow",
      },
      {
        t_start: Math.round(beat * 3),
        t_end: dur,
        description: `Hero shot: ${name} centered on parchment seamless, price reveal, clean hold.`,
        camera: "locked-off",
      },
    ],
  };
}

function statusAt(rec: MockRecord, now: number) {
  const elapsed = now - rec.created_at;
  if (rec.fail && elapsed >= T.scraping) {
    return { status: "failed" as const, elapsed };
  }
  if (elapsed < T.scraping) return { status: "queued" as const, elapsed };
  if (elapsed < T.scripting) return { status: "scraping" as const, elapsed };
  if (elapsed < T.rendering) return { status: "scripting" as const, elapsed };
  if (elapsed < T.ready) return { status: "rendering" as const, elapsed };
  return { status: "ready" as const, elapsed };
}

function project(rec: MockRecord, now: number): Job {
  const { status, elapsed } = statusAt(rec, now);
  const product = elapsed >= T.scripting ? buildProduct(rec) : null;
  const script = product && elapsed >= T.rendering ? buildScript(rec, product) : null;
  const ready = status === "ready";

  let error: ApiError | null = null;
  if (status === "failed") {
    error = {
      code: "scrape_failed",
      message:
        "Could not resolve product data from that URL. Check the link points to a live product page.",
      retryable: true,
    };
  }

  // Cost accrues as stages complete: scrape + script (LLM) + render (video).
  let cost = 0;
  if (elapsed >= T.scripting) cost += 3; // scrape
  if (elapsed >= T.rendering) cost += 11; // script (opus)
  if (ready) cost += rec.resolution === "2160p" ? 86 : 44; // render

  const updatedMs = Math.min(rec.created_at + elapsed, rec.created_at + T.ready);

  return {
    id: rec.id,
    status,
    product_url: rec.product_url,
    target_audience: rec.target_audience,
    aspect_ratio: rec.aspect_ratio || "16:9",
    duration_sec: rec.duration_sec || 10,
    resolution: rec.resolution || "1080p",
    product,
    script,
    video_url: ready ? SAMPLE_VIDEO : null,
    error,
    cost_cents: cost,
    created_at: new Date(rec.created_at).toISOString(),
    updated_at: new Date(updatedMs).toISOString(),
  };
}

export const mock = {
  createJob(input: CreateJobInput): Job {
    const records = readStore();
    const rec: MockRecord = {
      ...input,
      id: uuid(),
      created_at: Date.now(),
      seed: hash(input.product_url + input.target_audience),
      fail: /(\bfail\b|broken|404)/i.test(input.product_url),
    };
    records.unshift(rec);
    writeStore(records.slice(0, 50));
    return project(rec, Date.now());
  },

  getJob(id: string): Job | null {
    const rec = readStore().find((r) => r.id === id);
    if (!rec) return null;
    return project(rec, Date.now());
  },

  listJobs(): Job[] {
    const now = Date.now();
    return readStore()
      .map((r) => project(r, now))
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  },

  regenerate(id: string): Job | null {
    const rec = readStore().find((r) => r.id === id);
    if (!rec) return null;
    return this.createJob({
      product_url: rec.product_url,
      target_audience: rec.target_audience,
      aspect_ratio: rec.aspect_ratio,
      duration_sec: rec.duration_sec,
      resolution: rec.resolution,
    });
  },
};
