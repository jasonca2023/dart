"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { renderAdInBrowser, canRenderInBrowser } from "@/lib/render";
import { saveRenderedAd, uploadProductImage } from "@/lib/ads";
import type { AspectRatio, Duration, Job, Resolution } from "@/lib/types";
import { Field, Input } from "../ui/Field";
import { Segmented } from "../ui/Segmented";
import { Button } from "../ui/Button";
import { Orb } from "../ui/Orb";
import { Alert, ArrowRight } from "../icons";

type Mode = "url" | "upload";

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

function toneFor(text: string) {
  const tones = ["cinematic", "energetic", "luxe", "playful", "calm"] as const;
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return tones[h % tones.length];
}

function formatPrice(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  return /^[\d.,]+$/.test(t) ? `$${t}` : t;
}

function priceToCents(raw: string): number {
  const n = parseFloat(raw.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function ImagePicker({
  file,
  onChange,
}: {
  file: File | null;
  onChange: (f: File | null) => void;
}) {
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  return (
    <label className="flex cursor-pointer items-center gap-4 rounded-[12px] border border-dashed border-ash bg-white p-4 transition-colors duration-150 ease-out hover:border-driftwood">
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt=""
          className="size-16 rounded-[8px] bg-sand object-contain"
        />
      ) : (
        <div className="grid size-16 place-items-center rounded-[8px] bg-sand text-driftwood">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
            <circle cx="8.5" cy="9.5" r="1.6" fill="currentColor" />
            <path d="m5 17 4.5-4.5L13 16l3-3 3 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}
      <div className="text-[14px]">
        <span className="font-medium text-ink">
          {file ? file.name : "Choose an image"}
        </span>
        <span className="block text-[13px] text-driftwood">
          {file ? "Click to replace" : "PNG or JPG of your product"}
        </span>
      </div>
      <input
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
    </label>
  );
}

export function LaunchForm({ initialUrl = "" }: { initialUrl?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("url");
  const [url, setUrl] = useState(initialUrl);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [audience, setAudience] = useState("");
  const [aspect, setAspect] = useState<AspectRatio>("16:9");
  const [duration, setDuration] = useState<Duration>(10);
  const [resolution, setResolution] = useState<Resolution>("1080p");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Everything renders in the browser now, so it's always free and 1080p.
  const maxDuration = resolution === "2160p" ? 10 : DURATION_MAX;

  async function startUrl() {
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

  async function startUpload() {
    if (!imageFile) {
      setError("Add a product image.");
      return;
    }
    if (!title.trim()) {
      setError("Add a product title.");
      return;
    }
    if (!canRenderInBrowser()) {
      setError("In-browser rendering needs a recent Chrome or Edge.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const dur = clampDuration(duration, maxDuration);
    try {
      const id = crypto.randomUUID();
      // Persist the image for the saved record; render from a canvas-safe local
      // object URL so there's no CORS step.
      const imageUrl = await uploadProductImage(imageFile, id);
      const objectUrl = URL.createObjectURL(imageFile);
      let blob: Blob;
      try {
        blob = await renderAdInBrowser({
          productTitle: title.trim(),
          productImage: objectUrl,
          price: formatPrice(price),
          audience: audience.trim() || "everyone",
          durationInSeconds: dur,
          aspectRatio: aspect === "9:16" ? "9:16" : "16:9",
          accent: "#0447ff",
        });
      } finally {
        URL.revokeObjectURL(objectUrl);
      }

      const job: Job = {
        id,
        status: "ready",
        product_url: "",
        target_audience: audience.trim(),
        aspect_ratio: aspect,
        duration_sec: dur,
        resolution,
        product: {
          title: title.trim(),
          price: priceToCents(price),
          currency: "USD",
          images: imageUrl ? [imageUrl] : [],
          specs: {},
          source: "upload",
        },
        script: null,
        video_url: null,
        error: null,
        cost_cents: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await saveRenderedAd(job, blob);
      router.push(`/jobs/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not render the ad.");
      setSubmitting(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "url") void startUrl();
    else void startUpload();
  }

  const busyLabel = mode === "upload" ? "Rendering…" : "Starting…";

  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-8 lg:grid-cols-[1fr_320px] lg:gap-10"
    >
      {/* Fields */}
      <div className="flex flex-col gap-6">
        <Segmented
          ariaLabel="Product source"
          value={mode}
          onChange={(m) => {
            setMode(m);
            setError(null);
          }}
          options={[
            { value: "url", label: "Product URL" },
            { value: "upload", label: "Upload your own" },
          ]}
        />

        {mode === "url" ? (
          <Field
            label="Product URL"
            htmlFor="product-url"
            hint="A store product page with a clear hero image — Shopify and most DTC sites work. (Amazon/Walmart block scrapers — use Upload for those.)"
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
        ) : (
          <>
            <Field
              label="Product image"
              hint="A clear photo of your product — ideally on a plain background."
            >
              <ImagePicker file={imageFile} onChange={setImageFile} />
            </Field>
            <div className="grid gap-6 sm:grid-cols-2">
              <Field label="Product title" htmlFor="title">
                <Input
                  id="title"
                  placeholder="Aero Runner — Lightweight Trainer"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </Field>
              <Field label="Price" htmlFor="price" hint="Optional.">
                <Input
                  id="price"
                  placeholder="$129"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </Field>
            </div>
          </>
        )}

        <Field
          label="Target audience"
          htmlFor="audience"
          hint="Who is this ad for? Steers the tone."
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
            hint={`Any length from ${DURATION_MIN} to ${maxDuration} seconds.`}
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
            {submitting ? busyLabel : "Generate ad"}
            {!submitting && <ArrowRight className="text-[18px]" />}
          </Button>
        </div>
      </div>

      {/* Summary — sticky preview, decorative orb */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-card bg-sand p-6">
          <div className="flex items-center justify-center rounded-[14px] bg-white py-8 shadow-[var(--shadow-inset-warm)]">
            <Orb
              tone={toneFor(audience || title || url || "cinematic")}
              className="size-24"
            />
          </div>
          <dl className="mt-6 flex flex-col gap-3 text-[14px]">
            <div className="flex justify-between">
              <dt className="text-driftwood">Format</dt>
              <dd className="font-mono text-ink">
                {aspect} · {Number.isFinite(duration) ? duration : "—"}s · 1080p
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-driftwood">Cost</dt>
              <dd className="font-mono text-ink">Free</dd>
            </div>
          </dl>
          <p className="mt-5 border-t border-ash pt-4 text-[13px] leading-relaxed text-fog">
            {mode === "upload"
              ? "Renders in your browser from your own image — no scraping, nothing leaves your control until you publish."
              : "Dart reads the page, then renders the ad in your browser. Review the cut before anything publishes."}
          </p>
        </div>
      </aside>
    </form>
  );
}
