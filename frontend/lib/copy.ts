// The client side of the LLM copy brain. Calls the /api/copy Worker route
// (Cloudflare Workers AI), caches per input, times out, and resolves to null on
// any failure — so the rule-based copy in adSpec.ts is always a safe fallback.

import { useEffect, useRef, useState } from "react";
import { useDebounced } from "./hooks";
import type { AdSpec } from "./adSpec";

export interface AdCopy {
  eyebrow?: string;
  hook?: string;
  subhead?: string;
  cta?: string;
}

export interface CopyInput {
  title: string;
  audience: string;
  price: string;
  tone: string;
}

const cache = new Map<string, AdCopy>();
const keyOf = (i: CopyInput) =>
  `${i.title}|${i.audience}|${i.price}|${i.tone}`.toLowerCase();

export async function generateCopy(input: CopyInput): Promise<AdCopy | null> {
  if (!input.title.trim()) return null;
  const key = keyOf(input);
  const hit = cache.get(key);
  if (hit) return hit;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch("/api/copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const { copy } = (await res.json()) as { copy: AdCopy | null };
    if (copy) cache.set(key, copy); // cache successes only, so failures can retry
    return copy ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function clip(s: string | undefined, max: number): string | undefined {
  if (!s) return undefined;
  const t = s.trim();
  if (!t) return undefined;
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + "…";
}

// Overlay LLM copy onto a template-built spec. Pure; only replaces the fields the
// model actually returned, re-clipped to the renderer's safe lengths. The product
// title stays the headline (never let the model rename the product).
export function applyCopy(spec: AdSpec, copy: AdCopy | null): AdSpec {
  if (!copy) return spec;
  const eyebrow = clip(copy.eyebrow, 32) ?? spec.eyebrow;
  const subhead = clip(copy.subhead, 60) ?? spec.subhead;
  const cta = clip(copy.cta, 24) ?? spec.cta;
  const hook = clip(copy.hook, 42);
  const scenes = spec.scenes.map((s) => {
    if (s.type === "hook" && hook) return { ...s, text: hook };
    if (s.type === "outro") return { ...s, text: cta };
    return s;
  });
  return { ...spec, eyebrow, subhead, cta, scenes };
}

// Debounced fetch for the live preview. Returns the latest copy for `input`
// (null while loading / on failure), ignoring stale responses. `input` must be a
// stable (memoized) object so the debounce can settle.
export function useAiCopy(input: CopyInput, enabled: boolean): AdCopy | null {
  const debounced = useDebounced(input, 700);
  const [copy, setCopy] = useState<AdCopy | null>(null);
  const reqId = useRef(0);
  useEffect(() => {
    if (!enabled || !debounced.title.trim()) {
      setCopy(null);
      return;
    }
    const id = ++reqId.current;
    generateCopy(debounced).then((c) => {
      if (id === reqId.current) setCopy(c);
    });
  }, [enabled, debounced]);
  return copy;
}
