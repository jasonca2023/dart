"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { renderAdInBrowser, canRenderInBrowser } from "@/lib/render";
import { saveRenderedAdViaBackend } from "@/lib/ads";
import { buildAdSpec } from "@/lib/adSpec";
import { removeProductBackground } from "@/lib/bgRemove";
import { generateCopy, applyCopy, useAiCopy } from "@/lib/copy";
import { applyBrand, loadBrandKit, saveBrandKit, type BrandKit } from "@/lib/brand";
import { prepareLogo } from "@/lib/logo";
import { useDebounced } from "@/lib/hooks";
import type { AspectRatio, Duration, Job } from "@/lib/types";
import { Field, Input } from "../ui/Field";
import { Button } from "../ui/Button";
import { Orb } from "../ui/Orb";
import { Alert, ArrowRight, Refresh } from "../icons";

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

const FORMATS: { value: AspectRatio; label: string }[] = [
  { value: "16:9", label: "16:9" },
  { value: "1:1", label: "1:1" },
  { value: "4:5", label: "4:5" },
  { value: "9:16", label: "9:16" },
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
  const [formats, setFormats] = useState<AspectRatio[]>(["16:9"]);
  const [duration, setDuration] = useState<Duration>(10);
  const [variant, setVariant] = useState(0);
  const [brand, setBrand] = useState<BrandKit>({});
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Restore the saved brand kit on mount (sticky across sessions).
  useEffect(() => {
    setBrand(loadBrandKit());
  }, []);

  function updateBrand(patch: Partial<BrandKit>) {
    setBrand((prev) => {
      const next = { ...prev, ...patch };
      saveBrandKit(next);
      return next;
    });
  }

  function toggleFormat(f: AspectRatio) {
    setFormats((prev) =>
      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f],
    );
  }

  // The mood the brain picks for these inputs (with brand colour applied) — drives
  // the empty-state orb and the mood label.
  const moodSpec = useMemo(
    () =>
      applyBrand(
        buildAdSpec({
          title: title.trim(),
          audience: audience.trim(),
          price: formatPrice(price),
          durationSec: clampDuration(duration) || 10,
          variant,
        }),
        brand,
      ),
    [title, audience, price, duration, variant, brand],
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

  // Debounced text inputs so the player re-renders only after typing settles.
  // (Format/variant/brand are discrete, so they pass through live.)
  const liveInput = useMemo(
    () => ({ title, audience, price, duration }),
    [title, audience, price, duration],
  );
  const dq = useDebounced(liveInput, 350);
  const previewFmt = formats[0] ?? "16:9";
  const previewSpec = useMemo(
    () =>
      buildAdSpec({
        title: dq.title.trim(),
        audience: dq.audience.trim(),
        price: formatPrice(dq.price),
        durationSec: clampDuration(dq.duration) || 10,
        variant,
      }),
    [dq, variant],
  );

  // Bespoke copy from the Workers AI brain (debounced + cached), overlaid on the
  // template spec along with the brand colour.
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
  const previewSpecFinal = useMemo(
    () => applyBrand(applyCopy(previewSpec, aiCopy), brand),
    [previewSpec, aiCopy, brand],
  );

  async function onLogo(file: File | null) {
    if (!file) return;
    const p = await prepareLogo(file);
    if (!p) {
      setError("Couldn’t read that logo. Try a PNG or JPG under 10 MB.");
      return;
    }
    setError(null);
    const useCutout = p.removed; // auto-apply when a useless backdrop was stripped
    updateBrand({
      logoOriginal: p.original,
      logoCutout: p.cutout,
      logoRemoved: p.removed,
      logoUseCutout: useCutout,
      logo: useCutout ? p.cutout : p.original,
      // `p.transparent` reflects the active logo: cutout (when removed) is always
      // transparent; otherwise the original is transparent only if it already had
      // alpha. An opaque logo must NOT be knocked out (it'd become a solid block).
      logoTransparent: p.transparent,
    });
  }

  function setRemoveBg(on: boolean) {
    // The toggle only appears once a backdrop was removed, so the original is the
    // opaque source and the cutout is transparent.
    updateBrand({
      logoUseCutout: on,
      logo: on ? brand.logoCutout : brand.logoOriginal,
      logoTransparent: on,
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!imageFile) return setError("Add a product image.");
    if (!title.trim()) return setError("Add a product title.");
    if (formats.length === 0) return setError("Pick at least one format.");
    if (!canRenderInBrowser()) {
      return setError("In-browser rendering needs a recent Chrome or Edge.");
    }
    setSubmitting(true);
    setError(null);
    setStatus("Designing your ad…");
    // `duration` can be NaN/0 mid-edit (cleared field); never let that reach the
    // renderer as durationInFrames — fall back to 10s.
    const dur = clampDuration(duration) || 10;
    try {
      // The "brain": inputs -> creative spec, then bespoke LLM copy + brand colour.
      const baseSpec = buildAdSpec({
        title: title.trim(),
        audience: audience.trim(),
        price: formatPrice(price),
        durationSec: dur,
        variant,
      });
      setStatus("Writing the copy…");
      const copy = await generateCopy({
        title: title.trim(),
        audience: audience.trim(),
        price: formatPrice(price),
        tone: baseSpec.tone,
      });
      const spec = applyBrand(applyCopy(baseSpec, copy), brand);

      // Background removal runs once; the cutout is reused across every format.
      const cleaned = await removeProductBackground(imageFile, setStatus);
      const renderFile: Blob = cleaned ?? imageFile;
      const objectUrl = URL.createObjectURL(renderFile);

      let firstId: string | null = null;
      try {
        for (let i = 0; i < formats.length; i++) {
          const fmt = formats[i];
          const id = crypto.randomUUID();
          if (!firstId) firstId = id;
          setStatus(
            formats.length > 1
              ? `Rendering ${fmt} (${i + 1}/${formats.length})…`
              : "Rendering the video…",
          );
          const blob = await renderAdInBrowser({
            productTitle: title.trim(),
            productImage: objectUrl,
            price: formatPrice(price),
            audience: audience.trim() || "everyone",
            durationInSeconds: dur,
            aspectRatio: fmt,
            accent: spec.palette.accent,
            brandLogo: brand.logo,
            brandLogoKnockout: brand.logoTransparent,
            spec,
          });
          setStatus(`Saving ${fmt}…`);
          const job: Job = {
            id,
            status: "ready",
            product_url: "",
            target_audience: audience.trim(),
            aspect_ratio: fmt,
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
          await saveRenderedAdViaBackend(job, blob, imageFile, {
            accent: spec.palette.accent,
            logo: brand.logo,
            logoKnockout: brand.logoTransparent,
          });
        }
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
      router.push(`/jobs/${firstId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not render the ad.");
      setStatus(null);
      setSubmitting(false);
    }
  }

  const pillBase =
    "rounded-full border px-2.5 py-1 text-[12px] transition-colors duration-150 ease-out ";
  const pillOn = "border-ink bg-ink text-parchment";
  const pillOff = "border-ash bg-white text-driftwood hover:text-ink";

  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-8 lg:grid-cols-[1fr_320px] lg:gap-10"
    >
      {/* Fields */}
      <div className="flex flex-col gap-6">
        <Field
          label="Product image"
          hint="A clear photo of your product, ideally on a plain background."
        >
          <ImagePicker file={imageFile} onChange={setImageFile} />
        </Field>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Product title" htmlFor="title">
            <Input
              id="title"
              placeholder="Aero Runner: Lightweight Trainer"
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
                className={pillBase + (audience === a ? pillOn : pillOff)}
              >
                {a}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Formats" hint="Pick any. Each is rendered and saved.">
          <div className="flex flex-wrap gap-1.5">
            {FORMATS.map((f) => (
              <button
                key={f.value}
                type="button"
                aria-pressed={formats.includes(f.value)}
                onClick={() => toggleFormat(f.value)}
                className={
                  pillBase + (formats.includes(f.value) ? pillOn : pillOff)
                }
              >
                {f.label}
              </button>
            ))}
          </div>
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
                className={pillBase + (duration === d ? pillOn : pillOff)}
              >
                {d}s
              </button>
            ))}
          </div>
        </Field>

        <Field label="Brand kit" hint="Optional. Saved on this device for next time.">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 rounded-full border border-ash bg-white py-1 pl-1 pr-3 text-[13px] text-ink">
              <input
                type="color"
                aria-label="Brand color"
                value={brand.accent ?? moodSpec.palette.accent}
                onChange={(e) => updateBrand({ accent: e.target.value })}
                className="size-7 cursor-pointer rounded-full border-0 bg-transparent p-0"
              />
              {brand.accent ? "Brand color" : "Use brand color"}
            </label>
            {brand.accent && (
              <button
                type="button"
                onClick={() => updateBrand({ accent: undefined })}
                className="text-[12px] text-driftwood underline-offset-2 hover:text-ink hover:underline"
              >
                reset color
              </button>
            )}

            <label className="flex cursor-pointer items-center gap-2 rounded-full border border-ash bg-white px-3 py-1.5 text-[13px] text-ink hover:border-driftwood">
              {brand.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={brand.logo} alt="" className="h-5 w-auto max-w-[64px] object-contain" />
              ) : null}
              {brand.logo ? "Replace logo" : "Add logo"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onLogo(e.target.files?.[0] ?? null)}
              />
            </label>
            {brand.logo && (
              <button
                type="button"
                onClick={() =>
                  updateBrand({
                    logo: undefined,
                    logoOriginal: undefined,
                    logoCutout: undefined,
                    logoRemoved: undefined,
                    logoUseCutout: undefined,
                    logoTransparent: undefined,
                  })
                }
                className="text-[12px] text-driftwood underline-offset-2 hover:text-ink hover:underline"
              >
                remove logo
              </button>
            )}
          </div>
          {brand.logo && brand.logoRemoved && (
            <label className="mt-2 flex w-fit cursor-pointer items-center gap-2 text-[12px] text-driftwood">
              <input
                type="checkbox"
                checked={!!brand.logoUseCutout}
                onChange={(e) => setRemoveBg(e.target.checked)}
              />
              Remove logo background
            </label>
          )}
        </Field>

        {error && (
          <p role="alert" className="flex items-center gap-2 text-[14px] text-ink">
            <Alert className="text-[18px] text-driftwood" />
            {error}
          </p>
        )}

        <div>
          <Button type="submit" size="lg" loading={submitting}>
            {submitting
              ? status ?? "Rendering…"
              : formats.length > 1
                ? `Generate ${formats.length} ads`
                : "Generate ad"}
            {!submitting && <ArrowRight className="text-[18px]" />}
          </Button>
        </div>
      </div>

      {/* Summary — sticky preview */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-card bg-sand p-6">
          {previewUrl ? (
            <>
              <div
                className={
                  "overflow-hidden rounded-[14px] bg-ink " +
                  (previewFmt === "9:16" || previewFmt === "4:5"
                    ? "flex justify-center py-2"
                    : "")
                }
              >
                <AdPreview
                  productTitle={dq.title.trim() || "Your product"}
                  productImage={previewUrl}
                  price={formatPrice(dq.price)}
                  audience={dq.audience.trim() || "everyone"}
                  durationInSeconds={clampDuration(dq.duration) || 10}
                  aspectRatio={previewFmt}
                  accent={previewSpecFinal.palette.accent}
                  brandLogo={brand.logo}
                  brandLogoKnockout={brand.logoTransparent}
                  spec={previewSpecFinal}
                />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span
                  className={
                    "text-[12px] text-fog " + (aiLoading ? "animate-pulse" : "")
                  }
                >
                  {aiLoading
                    ? "Writing copy with AI…"
                    : aiCopy
                      ? "AI-written copy"
                      : ""}
                </span>
                <button
                  type="button"
                  onClick={() => setVariant((v) => v + 1)}
                  className="inline-flex items-center gap-1.5 text-[12px] font-medium text-driftwood transition-colors duration-150 ease-out hover:text-ink"
                >
                  <span
                    className="inline-flex transition-transform duration-500 ease-out"
                    style={{ transform: `rotate(${variant * 360}deg)` }}
                  >
                    <Refresh className="text-[14px]" />
                  </span>
                  Shuffle look
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 rounded-[14px] bg-white py-10 shadow-[var(--shadow-inset-warm)]">
              <Orb accent={moodSpec.palette.accent} className="size-24" />
              <p className="text-[13px] text-fog">Add a product image to preview</p>
            </div>
          )}
          <dl className="mt-6 flex flex-col gap-3 text-[14px]">
            <div className="flex justify-between">
              <dt className="text-driftwood">Mood</dt>
              <dd className="flex items-center gap-2 font-mono capitalize text-ink">
                {/* small mood ball — tinted to the mood's accent */}
                <Orb accent={moodSpec.palette.accent} className="size-5 shrink-0" float={false} />
                {moodSpec.tone} · {moodSpec.layout}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="shrink-0 text-driftwood">Formats</dt>
              <dd className="text-right font-mono text-ink">
                {formats.join(", ") || "—"} ·{" "}
                {Number.isFinite(duration) ? duration : "—"}s · 1080p
              </dd>
            </div>
          </dl>
          <p className="mt-5 border-t border-ash pt-4 text-[13px] leading-relaxed text-fog">
            A live preview from your photo. Generating removes the background and
            renders the final video(s) in your browser. Nothing leaves your
            control until you publish.
          </p>
        </div>
      </aside>
    </form>
  );
}
