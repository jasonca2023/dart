"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { renderAdInBrowser, canRenderInBrowser } from "@/lib/render";
import { saveRenderedAdViaBackend } from "@/lib/ads";
import { buildAdSpec } from "@/lib/adSpec";
import { removeProductBackground } from "@/lib/bgRemove";
import { generateCopy, applyCopy, useAiCopy } from "@/lib/copy";
import { useDebounced } from "@/lib/hooks";
import type { AspectRatio, Duration, Job } from "@/lib/types";
import { Field, Input } from "../ui/Field";
import { Segmented } from "../ui/Segmented";
import { Button } from "../ui/Button";
import { Orb } from "../ui/Orb";
import { Alert, ArrowRight } from "../icons";

// The live preview pulls in Remotion's player — load it only in the browser, and
// only once it's actually shown, so it stays out of the server + initial bundle.
const AdPreview = dynamic(() => import("./AdPreview"), {
  ssr: false,
  loading: () => (
    <div className="aspect-video w-full animate-pulse rounded-[14px] bg-white" />
  ),
});

const AUDIENCES = [
  "Gen Z tech enthusiasts",
  "Busy parents",
  "Outdoor adventurers",
  "Luxury gift shoppers",
];

const DURATION_MIN = 3;
const DURATION_MAX = 20;
const DURATION_PRESETS = [5, 10, 15, 20];

const clampDuration = (n: number) =>
  Math.min(DURATION_MAX, Math.max(DURATION_MIN, Math.round(n)));

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

export function LaunchForm() {
  const router = useRouter();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [audience, setAudience] = useState("");
  const [aspect, setAspect] = useState<AspectRatio>("16:9");
  const [duration, setDuration] = useState<Duration>(10);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The real spec the brain will use for these inputs — drives the preview orb
  // and mood label so the summary reflects the actual ad, not a random hash.
  const moodSpec = useMemo(
    () =>
      buildAdSpec({
        title: title.trim(),
        audience: audience.trim(),
        price: formatPrice(price),
        durationSec: clampDuration(duration) || 10,
      }),
    [title, audience, price, duration],
  );

  // A stable object URL for the uploaded image, fed to the live preview.
  const previewUrl = useMemo(
    () => (imageFile ? URL.createObjectURL(imageFile) : null),
    [imageFile],
  );
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  // Debounced inputs so the player re-renders only after typing settles, not on
  // every keystroke. (Image changes are discrete, so the URL passes through live.)
  const liveInput = useMemo(
    () => ({ title, audience, price, duration, aspect }),
    [title, audience, price, duration, aspect],
  );
  const dq = useDebounced(liveInput, 350);
  const previewSpec = useMemo(
    () =>
      buildAdSpec({
        title: dq.title.trim(),
        audience: dq.audience.trim(),
        price: formatPrice(dq.price),
        durationSec: clampDuration(dq.duration) || 10,
      }),
    [dq],
  );

  // Bespoke copy from the Workers AI brain, fetched (debounced + cached) only
  // while the preview is on screen. Overlaid on the template spec; null until it
  // arrives, so the preview shows template copy first, then upgrades in place.
  const copyInput = useMemo(
    () => ({
      title: dq.title.trim(),
      audience: dq.audience.trim(),
      price: formatPrice(dq.price),
      tone: previewSpec.tone,
    }),
    [dq, previewSpec.tone],
  );
  const { copy: aiCopy, loading: aiLoading } = useAiCopy(copyInput, !!previewUrl);
  const previewSpecWithCopy = useMemo(
    () => applyCopy(previewSpec, aiCopy),
    [previewSpec, aiCopy],
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
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
    setStatus("Designing your ad…");
    // `duration` can be NaN/0 mid-edit (cleared field); never let that reach the
    // renderer as durationInFrames — fall back to 10s.
    const dur = clampDuration(duration) || 10;
    try {
      const id = crypto.randomUUID();
      // The "brain": map the inputs to an audience-tailored creative spec
      // (tone, palette, type, layout, copy, pacing) that drives the render.
      const baseSpec = buildAdSpec({
        title: title.trim(),
        audience: audience.trim(),
        price: formatPrice(price),
        durationSec: dur,
      });
      // Upgrade the template copy with bespoke LLM lines (Workers AI). Cache hit
      // if the preview already fetched it; null on failure → keep the templates.
      setStatus("Writing the copy…");
      const copy = await generateCopy({
        title: title.trim(),
        audience: audience.trim(),
        price: formatPrice(price),
        tone: baseSpec.tone,
      });
      const spec = applyCopy(baseSpec, copy);
      // Cut the product out of its background (in-browser) so it sits cleanly on
      // the ad's stage. Falls back to the original photo if it can't.
      const cleaned = await removeProductBackground(imageFile, setStatus);
      const renderFile: Blob = cleaned ?? imageFile;
      // Render in-browser from a canvas-safe local object URL — free, fast, no
      // CORS step, nothing leaves the browser until the user saves.
      const objectUrl = URL.createObjectURL(renderFile);
      let blob: Blob;
      setStatus("Rendering the video…");
      try {
        blob = await renderAdInBrowser({
          productTitle: title.trim(),
          productImage: objectUrl,
          price: formatPrice(price),
          audience: audience.trim() || "everyone",
          durationInSeconds: dur,
          aspectRatio: aspect === "9:16" ? "9:16" : "16:9",
          accent: spec.palette.accent,
          spec,
        });
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
      setStatus("Saving to your library…");

      const job: Job = {
        id,
        status: "ready",
        product_url: "",
        target_audience: audience.trim(),
        aspect_ratio: aspect,
        duration_sec: dur,
        resolution: "1080p",
        product: {
          title: title.trim(),
          price: priceToCents(price),
          currency: "USD",
          images: [],
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
      // Upload + save happens on the backend (service-role key) because the
      // project's Storage rejects user tokens directly.
      await saveRenderedAdViaBackend(job, blob, imageFile);
      router.push(`/jobs/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not render the ad.");
      setStatus(null);
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
            hint={`Any length from ${DURATION_MIN} to ${DURATION_MAX} seconds.`}
          >
            <div className="flex items-center gap-2">
              <Input
                id="duration"
                type="number"
                inputMode="numeric"
                min={DURATION_MIN}
                max={DURATION_MAX}
                step={1}
                value={Number.isFinite(duration) ? duration : ""}
                onChange={(e) => setDuration(Number(e.target.value))}
                onBlur={(e) => setDuration(clampDuration(Number(e.target.value) || 10))}
                className="w-24"
                aria-label="Duration in seconds"
              />
              <span className="text-[14px] text-driftwood">seconds</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {DURATION_PRESETS.map((d) => (
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
          <p role="alert" className="flex items-center gap-2 text-[14px] text-ink">
            <Alert className="text-[18px] text-driftwood" />
            {error}
          </p>
        )}

        <div>
          <Button type="submit" size="lg" loading={submitting}>
            {submitting ? status ?? "Rendering…" : "Generate ad"}
            {!submitting && <ArrowRight className="text-[18px]" />}
          </Button>
        </div>
      </div>

      {/* Summary — sticky preview, decorative orb */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-card bg-sand p-6">
          {previewUrl ? (
            <>
              <div
                className={
                  "overflow-hidden rounded-[14px] bg-ink " +
                  (dq.aspect === "9:16" ? "flex justify-center py-2" : "")
                }
              >
                <AdPreview
                  productTitle={dq.title.trim() || "Your product"}
                  productImage={previewUrl}
                  price={formatPrice(dq.price)}
                  audience={dq.audience.trim() || "everyone"}
                  durationInSeconds={clampDuration(dq.duration) || 10}
                  aspectRatio={dq.aspect}
                  accent={previewSpecWithCopy.palette.accent}
                  spec={previewSpecWithCopy}
                />
              </div>
              {(aiLoading || aiCopy) && (
                <p
                  className={
                    "mt-2 text-center text-[12px] text-fog " +
                    (aiLoading ? "animate-pulse" : "")
                  }
                >
                  {aiLoading
                    ? "✨ Writing copy with AI…"
                    : "✨ AI-written copy for this product"}
                </p>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 rounded-[14px] bg-white py-10 shadow-[var(--shadow-inset-warm)]">
              <Orb accent={moodSpec.palette.accent} className="size-24" />
              <p className="text-[13px] text-fog">
                Add a product image to preview
              </p>
            </div>
          )}
          <dl className="mt-6 flex flex-col gap-3 text-[14px]">
            <div className="flex justify-between">
              <dt className="text-driftwood">Mood</dt>
              <dd className="font-mono capitalize text-ink">
                {moodSpec.tone} · {moodSpec.layout}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-driftwood">Format</dt>
              <dd className="font-mono text-ink">
                {aspect} · {Number.isFinite(duration) ? duration : "—"}s · 1080p
              </dd>
            </div>
          </dl>
          <p className="mt-5 border-t border-ash pt-4 text-[13px] leading-relaxed text-fog">
            A live preview from your photo. Generating removes the background and
            renders the final video in your browser — nothing leaves your control
            until you publish.
          </p>
        </div>
      </aside>
    </form>
  );
}
