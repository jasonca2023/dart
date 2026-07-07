// The client side of the LLM copy brain. Calls the /api/copy Worker route
// (Cloudflare Workers AI), caches per input, times out, and resolves to null on
// any failure — so the rule-based copy in adSpec.ts is always a safe fallback.

import { useEffect, useRef, useState } from "react";
import { useDebounced } from "./hooks";
import type { AdSpec } from "./adSpec";

export interface AdCopy {
  name?: string; // the core product name (colour/variant stripped), used as the headline
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

// Distinct sales *angles* for A/B "takes" — the same product pitched three ways.
// Each `hint` steers the AI copy; the `label` names the take in the UI.
export interface CopyAngle {
  key: string;
  label: string;
  hint: string;
}
export const COPY_ANGLES: CopyAngle[] = [
  {
    key: "benefit",
    label: "Benefit",
    hint: "Lead with the concrete benefit or outcome the buyer gets — make them feel the result.",
  },
  {
    key: "value",
    label: "Value",
    hint: "Lead with value — frame it as a smart, worth-it buy; reference the price if one is given.",
  },
  {
    key: "bold",
    label: "Bold",
    hint: "Bold and punchy — a confident, high-energy, scroll-stopping hook. Short and daring.",
  },
];

const cache = new Map<string, AdCopy>();
const keyOf = (i: CopyInput, angle?: string) =>
  `${i.title}|${i.audience}|${i.price}|${i.tone}|${angle ?? ""}`.toLowerCase();

export async function generateCopy(
  input: CopyInput,
  angle?: string,
): Promise<AdCopy | null> {
  if (!input.title.trim()) return null;
  const key = keyOf(input, angle);
  const hit = cache.get(key);
  if (hit) return hit;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch("/api/copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(angle ? { ...input, angle } : input),
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

// Generate several distinct copy angles in parallel for A/B "takes". Each entry
// resolves independently (a failed angle → null copy, so it falls back to the
// rule-based templates for that take).
export async function generateVariants(
  input: CopyInput,
  angles: CopyAngle[] = COPY_ANGLES,
): Promise<{ key: string; label: string; copy: AdCopy | null }[]> {
  return Promise.all(
    angles.map(async (a) => ({
      key: a.key,
      label: a.label,
      copy: await generateCopy(input, a.hint),
    })),
  );
}

function clip(s: string | undefined, max: number): string | undefined {
  if (!s) return undefined;
  const t = s.trim();
  if (!t) return undefined;
  if (t.length <= max) return t;
  let cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > max * 0.5) cut = cut.slice(0, lastSpace);
  return cut.replace(/[\s.,;:!?-]+$/, "") + "…";
}

// Hard word cap for the hook — short-form ad research is consistent that the
// opener should be a handful of words, so cap by word count then by chars.
function clipWords(
  s: string | undefined,
  maxWords: number,
  maxChars: number,
): string | undefined {
  if (!s) return undefined;
  const words = s.trim().split(/\s+/);
  const capped = words.length > maxWords ? words.slice(0, maxWords).join(" ") : s;
  return clip(capped, maxChars);
}

// Overlay LLM copy onto a template-built spec. Pure; only replaces the fields the
// model actually returned, re-clipped to the renderer's safe lengths. `name` is the
// model's trimmed core product name — validated server-side to be a slice of the
// real title (no rename, just colour/variant noise dropped) — used as the headline
// so a long marketplace title never overflows or cuts off.
export function applyCopy(spec: AdSpec, copy: AdCopy | null): AdSpec {
  if (!copy) return spec;
  const eyebrow = clip(copy.eyebrow, 32) ?? spec.eyebrow;
  const subhead = clip(copy.subhead, 60) ?? spec.subhead;
  const cta = clip(copy.cta, 24) ?? spec.cta;
  const hook = clip(copy.hook, 42);
  const headline = clip(copy.name, 48) ?? spec.headline;
  const scenes = spec.scenes.map((s) => {
    if (s.type === "hook" && hook) return { ...s, text: hook };
    if (s.type === "hero") return { ...s, text: headline };
    if (s.type === "outro") return { ...s, text: cta };
    return s;
  });
  return { ...spec, headline, eyebrow, subhead, cta, scenes };
}

// Debounced fetch for the live preview. Returns the latest copy for `input` plus
// a `loading` flag (so the UI can show the AI working), ignoring stale responses.
// `input` must be a stable (memoized) object so the debounce can settle.
export function useAiCopy(
  input: CopyInput,
  enabled: boolean,
): { copy: AdCopy | null; loading: boolean } {
  const debounced = useDebounced(input, 700);
  const [copy, setCopy] = useState<AdCopy | null>(null);
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0);
  useEffect(() => {
    // Claim a request id first so this run invalidates any in-flight response —
    // otherwise disabling (e.g. the image is removed) lets a late reply overwrite
    // the cleared copy.
    const id = ++reqId.current;
    if (!enabled || !debounced.title.trim()) {
      setCopy(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    generateCopy(debounced).then((c) => {
      if (id !== reqId.current) return;
      setCopy(c);
      setLoading(false);
    });
  }, [enabled, debounced]);
  return { copy, loading };
}
