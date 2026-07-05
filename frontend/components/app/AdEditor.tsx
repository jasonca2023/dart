"use client";

// Edit a finished ad: tweak the copy, shuffle the look, change the format or
// length, then re-render in the browser and either overwrite this ad or save a
// copy. A saved ad stores its inputs, original product image, price and the
// branding (logo/accent) it used, so the editor reproduces it faithfully.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { buildAdSpec } from "@/lib/adSpec";
import { applyCopy, generateCopy, type AdCopy } from "@/lib/copy";
import { applyBrand, loadBrandKit } from "@/lib/brand";
import { removeProductBackground } from "@/lib/bgRemove";
import { renderAdInBrowser, canRenderInBrowser } from "@/lib/render";
import { saveRenderedAdViaBackend } from "@/lib/ads";
import { API_BASE } from "@/lib/api";
import { useDebounced } from "@/lib/hooks";
import type { AspectRatio, Job } from "@/lib/types";
import { Field, Input } from "../ui/Field";
import { Button } from "../ui/Button";
import { Alert, Refresh, Spinner } from "../icons";

const AdPreview = dynamic(() => import("./AdPreview"), {
  ssr: false,
  loading: () => <div className="aspect-video w-full animate-pulse rounded-[14px] bg-white" />,
});

const FORMATS: AspectRatio[] = ["16:9", "1:1", "4:5", "9:16"];
const DURATIONS = [5, 10, 15, 20];
const clampDuration = (n: number) => Math.min(20, Math.max(3, Math.round(n) || 10));
const priceToCents = (raw: string) => {
  const n = parseFloat(raw.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

const pillBase =
  "rounded-full border px-2.5 py-1 text-[12px] transition-colors duration-150 ease-out ";
const pillOn = "border-ink bg-ink text-parchment";
const pillOff = "border-ash bg-white text-driftwood hover:text-ink";

export function AdEditor({
  job,
  imageUrl,
  savedLogoUrl,
  savedKnockout,
  savedAccent,
  onSaved,
  onCancel,
}: {
  job: Job;
  imageUrl: string;
  savedLogoUrl?: string | null;
  savedKnockout?: boolean | null;
  savedAccent?: string | null;
  onSaved: (localVideoUrl: string, aspect: AspectRatio) => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const title = job.product?.title ?? "Your product";
  const audience = job.target_audience || "everyone";

  // Prepared product cutout (object URL) + the original file for re-saving.
  const [cutoutUrl, setCutoutUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);

  // Resolved branding for this ad: the stored logo/accent if present, else the
  // device's brand kit (covers ads saved before branding was persisted).
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [knockout, setKnockout] = useState<boolean | undefined>(undefined);
  const [accent, setAccent] = useState<string | undefined>(undefined);

  // Editable creative.
  const [headline, setHeadline] = useState("");
  const [eyebrow, setEyebrow] = useState("");
  const [hook, setHook] = useState("");
  const [subhead, setSubhead] = useState("");
  const [cta, setCta] = useState("");
  const [price, setPrice] = useState(
    job.product?.price ? `$${(job.product.price / 100).toFixed(2)}` : "",
  );
  const [format, setFormat] = useState<AspectRatio>(job.aspect_ratio);
  const [duration, setDuration] = useState(clampDuration(job.duration_sec));
  const [variant, setVariant] = useState(0);

  const [prefilled, setPrefilled] = useState(false);
  const [saving, setSaving] = useState<"save" | "copy" | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Resolve branding once on mount (fetch the stored logo CORS-clean via the proxy).
  useEffect(() => {
    let active = true;
    let revoke: string | null = null;
    const kit = loadBrandKit();
    setAccent(savedAccent ?? kit.accent);
    setKnockout(savedKnockout ?? kit.logoTransparent);
    if (savedLogoUrl) {
      const src = API_BASE
        ? `${API_BASE}/proxy-image?url=${encodeURIComponent(savedLogoUrl)}`
        : savedLogoUrl;
      fetch(src)
        .then((r) => (r.ok ? r.blob() : Promise.reject(new Error("logo"))))
        .then((b) => {
          if (!active) return;
          const u = URL.createObjectURL(b);
          revoke = u;
          setLogoUrl(u);
        })
        .catch(() => active && setLogoUrl(kit.logo ?? null));
    } else {
      setLogoUrl(kit.logo ?? null);
    }
    return () => {
      active = false;
      if (revoke) URL.revokeObjectURL(revoke);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch the product image (CORS-clean via proxy), strip its background once.
  useEffect(() => {
    let active = true;
    let revoke: string | null = null;
    (async () => {
      try {
        const src = API_BASE
          ? `${API_BASE}/proxy-image?url=${encodeURIComponent(imageUrl)}`
          : imageUrl;
        const resp = await fetch(src);
        if (!resp.ok) throw new Error("image");
        const blob = await resp.blob();
        const file = new File([blob], "product.jpg", { type: blob.type || "image/jpeg" });
        const cleaned = (await removeProductBackground(blob)) ?? blob;
        if (!active) return;
        const u = URL.createObjectURL(cleaned);
        revoke = u;
        setImageFile(file);
        setCutoutUrl(u);
      } catch {
        if (active) setError("Couldn’t load the product image to edit.");
      }
    })();
    return () => {
      active = false;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [imageUrl]);

  // Prefill the copy fields from this ad's inputs + a fresh AI pass.
  const seedSpec = useMemo(
    () => buildAdSpec({ title, audience, price: "", durationSec: duration, variant: 0 }),
    [title, audience, duration],
  );
  useEffect(() => {
    let active = true;
    generateCopy({ title, audience, price: "", tone: seedSpec.tone }).then((copy) => {
      if (!active) return;
      const s = applyCopy(seedSpec, copy);
      setHeadline(s.headline);
      setEyebrow(s.eyebrow ?? "");
      setSubhead(s.subhead ?? "");
      setCta(s.cta);
      setHook(s.scenes.find((x) => x.type === "hook")?.text ?? "");
      setPrefilled(true);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const specFrom = useCallback(
    (c: { headline: string; eyebrow: string; hook: string; subhead: string; cta: string; price: string }) => {
      const base = buildAdSpec({ title, audience, price: c.price.trim(), durationSec: duration, variant });
      const manual: AdCopy = {
        name: c.headline.trim() || undefined,
        eyebrow: c.eyebrow.trim() || undefined,
        hook: c.hook.trim() || undefined,
        subhead: c.subhead.trim() || undefined,
        cta: c.cta.trim() || undefined,
      };
      return applyBrand(applyCopy(base, manual), { accent });
    },
    [title, audience, duration, variant, accent],
  );

  // Debounce the text fields so the player re-renders only after typing settles.
  const liveCopy = useMemo(
    () => ({ headline, eyebrow, hook, subhead, cta, price }),
    [headline, eyebrow, hook, subhead, cta, price],
  );
  const dq = useDebounced(liveCopy, 300);
  const previewSpec = useMemo(() => specFrom(dq), [specFrom, dq]);

  const ready = !!cutoutUrl && prefilled;

  async function save(asCopy: boolean) {
    if (!cutoutUrl || !imageFile) return;
    if (!canRenderInBrowser()) {
      return setError(
        "In-browser rendering needs a recent Chrome, Edge, Firefox, or Safari 26+.",
      );
    }
    setSaving(asCopy ? "copy" : "save");
    setError(null);
    setStatus("Re-rendering…");
    try {
      const spec = specFrom(liveCopy); // latest edits, not the debounced preview
      const blob = await renderAdInBrowser({
        productTitle: title,
        productImage: cutoutUrl,
        price: price.trim(),
        audience,
        durationInSeconds: duration,
        aspectRatio: format,
        accent: spec.palette.accent,
        brandLogo: logoUrl ?? undefined,
        brandLogoKnockout: knockout,
        spec,
      });
      setStatus("Saving…");
      const id = asCopy ? crypto.randomUUID() : job.id;
      const updated: Job = {
        ...job,
        id,
        aspect_ratio: format,
        duration_sec: duration,
        product: job.product
          ? { ...job.product, price: priceToCents(price) }
          : job.product,
      };
      await saveRenderedAdViaBackend(updated, blob, imageFile, {
        accent,
        logo: logoUrl ?? undefined,
        logoKnockout: knockout,
      });
      if (asCopy) router.push(`/jobs/${id}`);
      else onSaved(URL.createObjectURL(blob), format);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t save the edit.");
      setSaving(null);
      setStatus(null);
    }
  }

  const centeredPreview = format === "9:16" || format === "4:5";

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px] lg:gap-10">
      {/* Controls */}
      <div className="flex flex-col gap-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Headline" htmlFor="ed-headline">
            <Input id="ed-headline" value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder={title} />
          </Field>
          <Field label="Kicker" htmlFor="ed-eyebrow" hint="The small label above the headline.">
            <Input id="ed-eyebrow" value={eyebrow} onChange={(e) => setEyebrow(e.target.value)} placeholder="New" />
          </Field>
        </div>

        <Field label="Opening line" htmlFor="ed-hook">
          <Input id="ed-hook" value={hook} onChange={(e) => setHook(e.target.value)} placeholder="Your upgrade is here." />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Subhead" htmlFor="ed-subhead">
            <Input id="ed-subhead" value={subhead} onChange={(e) => setSubhead(e.target.value)} placeholder="One short line." />
          </Field>
          <Field label="Button text" htmlFor="ed-cta">
            <Input id="ed-cta" value={cta} onChange={(e) => setCta(e.target.value)} placeholder="Shop now" />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Price" htmlFor="ed-price" hint="Optional. Adds a price beat.">
            <Input id="ed-price" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="$129" />
          </Field>
          <Field label="Length" hint="Seconds.">
            <div className="flex flex-wrap gap-1.5">
              {DURATIONS.map((d) => (
                <button key={d} type="button" onClick={() => setDuration(d)} className={pillBase + (duration === d ? pillOn : pillOff)}>
                  {d}s
                </button>
              ))}
            </div>
          </Field>
        </div>

        <Field label="Format" hint="Re-render at a different aspect ratio.">
          <div className="flex flex-wrap gap-1.5">
            {FORMATS.map((f) => (
              <button key={f} type="button" aria-pressed={format === f} onClick={() => setFormat(f)} className={pillBase + (format === f ? pillOn : pillOff)}>
                {f}
              </button>
            ))}
          </div>
        </Field>

        {error && (
          <p role="alert" className="flex items-center gap-2 text-[14px] text-ink">
            <Alert className="text-[18px] text-driftwood" />
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2.5">
          <Button onClick={() => save(false)} size="lg" loading={saving === "save"} disabled={!ready || saving === "copy"}>
            {saving === "save" ? status ?? "Saving…" : "Save changes"}
          </Button>
          <Button variant="secondary" onClick={() => save(true)} loading={saving === "copy"} disabled={!ready || saving === "save"}>
            {saving === "copy" ? status ?? "Saving…" : "Save as copy"}
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={!!saving}>
            Cancel
          </Button>
        </div>
      </div>

      {/* Sticky live preview */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-card bg-sand p-6">
          {ready && cutoutUrl ? (
            <>
              <div className={"overflow-hidden rounded-[14px] bg-ink " + (centeredPreview ? "flex justify-center py-2" : "")}>
                <AdPreview
                  productTitle={title}
                  productImage={cutoutUrl}
                  price={price.trim()}
                  audience={audience}
                  durationInSeconds={duration}
                  aspectRatio={format}
                  accent={previewSpec.palette.accent}
                  brandLogo={logoUrl ?? undefined}
                  brandLogoKnockout={knockout}
                  spec={previewSpec}
                />
              </div>
              <div className="mt-2 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setVariant((v) => v + 1)}
                  className="inline-flex items-center gap-1.5 text-[12px] font-medium text-driftwood transition-colors duration-150 ease-out hover:text-ink"
                >
                  <span className="inline-flex transition-transform duration-500 ease-out" style={{ transform: `rotate(${variant * 360}deg)` }}>
                    <Refresh className="text-[14px]" />
                  </span>
                  Shuffle look
                </button>
              </div>
            </>
          ) : (
            <div className="flex aspect-video flex-col items-center justify-center gap-3 rounded-[14px] bg-white text-center shadow-[var(--shadow-inset-warm)]">
              <Spinner className="size-6 text-driftwood" />
              <p className="text-[13px] text-fog">Preparing the editor…</p>
            </div>
          )}
          <p className="mt-5 border-t border-ash pt-4 text-[13px] leading-relaxed text-fog">
            Save changes replaces this ad. Save as copy keeps the original and adds a
            new one.
          </p>
        </div>
      </aside>
    </div>
  );
}
