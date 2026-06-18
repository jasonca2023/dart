"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import type { AspectRatio, Duration, Resolution } from "@/lib/types";
import { Field, Input } from "../ui/Field";
import { Segmented } from "../ui/Segmented";
import { Button } from "../ui/Button";
import { Orb } from "../ui/Orb";
import { Alert, ArrowRight } from "../icons";

const AUDIENCES = [
  "Gen Z tech enthusiasts",
  "Busy parents",
  "Outdoor adventurers",
  "Luxury gift shoppers",
];

const DURATION_MIN = 3;
const DURATION_MAX = 20;
const DURATION_PRESETS = [5, 10, 15, 20];

const clampDuration = (n: number, max = DURATION_MAX) =>
  Math.min(max, Math.max(DURATION_MIN, Math.round(n)));

// Deterministic, decorative-only mapping so the preview orb has personality.
function toneFor(text: string) {
  const tones = ["cinematic", "energetic", "luxe", "playful", "calm"] as const;
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return tones[h % tones.length];
}

export function LaunchForm({ initialUrl = "" }: { initialUrl?: string }) {
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl);
  const [audience, setAudience] = useState("");
  const [aspect, setAspect] = useState<AspectRatio>("16:9");
  const [duration, setDuration] = useState<Duration>(10);
  const [resolution, setResolution] = useState<Resolution>("1080p");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const estCents = resolution === "2160p" ? 100 : 58;
  // LTX-2 fast renders 4K at ≤10s; only 1080p goes the full 20s.
  const maxDuration = resolution === "2160p" ? 10 : DURATION_MAX;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) {
      setError("Paste a product URL to generate an ad.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const job = await api.createJob({
        product_url: url.trim(),
        target_audience: audience.trim() || "a broad consumer audience",
        aspect_ratio: aspect,
        duration_sec: clampDuration(duration, maxDuration),
        resolution,
      });
      router.push(`/jobs/${job.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the job.");
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-8 lg:grid-cols-[1fr_320px] lg:gap-10"
    >
      {/* Fields */}
      <div className="flex flex-col gap-6">
        <Field
          label="Product URL"
          htmlFor="product-url"
          hint="Any product page with a clear hero image — Shopify, Amazon, Etsy and more."
        >
          <Input
            id="product-url"
            type="url"
            inputMode="url"
            placeholder="https://store.example.com/products/aero-runner"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            autoFocus
          />
        </Field>

        <Field
          label="Target audience"
          htmlFor="audience"
          hint="Who is this ad for? Steers the script, pacing and tone."
        >
          <Input
            id="audience"
            placeholder="Gen Z tech enthusiasts"
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
          />
          <div className="mt-1 flex flex-wrap gap-1.5">
            {AUDIENCES.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAudience(a)}
                className={
                  "rounded-full border px-2.5 py-1 text-[12px] transition-colors duration-150 ease-out " +
                  (audience === a
                    ? "border-ink bg-ink text-parchment"
                    : "border-ash bg-white text-driftwood hover:text-ink")
                }
              >
                {a}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Aspect ratio">
            <Segmented
              ariaLabel="Aspect ratio"
              value={aspect}
              onChange={setAspect}
              options={[
                { value: "16:9", label: "16:9" },
                { value: "9:16", label: "9:16" },
              ]}
            />
          </Field>
          <Field
            label="Duration"
            htmlFor="duration"
            hint={
              `Any length from ${DURATION_MIN} to ${maxDuration} seconds.` +
              (resolution === "2160p" ? " (4K caps at 10s.)" : "")
            }
          >
            <div className="flex items-center gap-2">
              <Input
                id="duration"
                type="number"
                inputMode="numeric"
                min={DURATION_MIN}
                max={maxDuration}
                step={1}
                value={Number.isFinite(duration) ? duration : ""}
                onChange={(e) => setDuration(Number(e.target.value))}
                onBlur={(e) =>
                  setDuration(clampDuration(Number(e.target.value) || 10, maxDuration))
                }
                className="w-24"
                aria-label="Duration in seconds"
              />
              <span className="text-[14px] text-driftwood">seconds</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {DURATION_PRESETS.filter((d) => d <= maxDuration).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDuration(d)}
                  className={
                    "rounded-full border px-2.5 py-1 text-[12px] transition-colors duration-150 ease-out " +
                    (duration === d
                      ? "border-ink bg-ink text-parchment"
                      : "border-ash bg-white text-driftwood hover:text-ink")
                  }
                >
                  {d}s
                </button>
              ))}
            </div>
          </Field>
        </div>

        <Field label="Resolution">
          <Segmented
            ariaLabel="Resolution"
            value={resolution}
            onChange={(r) => {
              setResolution(r);
              // 4K is capped at 10s — pull an over-long duration back in.
              if (r === "2160p" && duration > 10) setDuration(10);
            }}
            options={[
              { value: "1080p", label: "1080p" },
              { value: "2160p", label: "2160p · 4K" },
            ]}
          />
        </Field>

        {error && (
          <p
            role="alert"
            className="flex items-center gap-2 text-[14px] text-ink"
          >
            <Alert className="text-[18px] text-driftwood" />
            {error}
          </p>
        )}

        <div>
          <Button type="submit" size="lg" loading={submitting}>
            {submitting ? "Starting…" : "Generate ad"}
            {!submitting && <ArrowRight className="text-[18px]" />}
          </Button>
        </div>
      </div>

      {/* Summary — sticky preview, decorative orb */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-card bg-sand p-6">
          <div className="flex items-center justify-center rounded-[14px] bg-white py-8 shadow-[var(--shadow-inset-warm)]">
            <Orb tone={toneFor(audience || url || "cinematic")} className="size-24" />
          </div>
          <dl className="mt-6 flex flex-col gap-3 text-[14px]">
            <div className="flex justify-between">
              <dt className="text-driftwood">Format</dt>
              <dd className="font-mono text-ink">
                {aspect} · {Number.isFinite(duration) ? duration : "—"}s ·{" "}
                {resolution}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-driftwood">Est. cost</dt>
              <dd className="font-mono text-ink">~${(estCents / 100).toFixed(2)}</dd>
            </div>
          </dl>
          <p className="mt-5 border-t border-ash pt-4 text-[13px] leading-relaxed text-fog">
            Dart will scrape, script and render, then hold the cut for your
            review before anything publishes.
          </p>
        </div>
      </aside>
    </form>
  );
}
