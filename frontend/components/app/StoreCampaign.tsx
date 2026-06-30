"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { API_BASE } from "@/lib/api";
import { fetchStoreProducts, prepareStoreLogo, type StoreProduct } from "@/lib/store";
import type { PreparedLogo } from "@/lib/logo";
import { buildAdSpec } from "@/lib/adSpec";
import { generateCopy, applyCopy } from "@/lib/copy";
import { removeProductBackground } from "@/lib/bgRemove";
import { renderAdInBrowser, canRenderInBrowser } from "@/lib/render";
import { saveRenderedAdViaBackend } from "@/lib/ads";
import type { AspectRatio, Duration, Job } from "@/lib/types";
import { Field, Input } from "../ui/Field";
import { Button } from "../ui/Button";
import { Alert, ArrowRight, Check } from "../icons";

const FORMATS: { value: AspectRatio; label: string }[] = [
  { value: "16:9", label: "16:9" },
  { value: "1:1", label: "1:1" },
  { value: "4:5", label: "4:5" },
  { value: "9:16", label: "9:16" },
];
const DURATIONS: Duration[] = [5, 10, 15, 20];

function priceToCents(raw: string): number {
  const n = parseFloat(raw.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function StoreCampaign() {
  const router = useRouter();
  const [storeUrl, setStoreUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [products, setProducts] = useState<StoreProduct[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());

  const [audience, setAudience] = useState("");
  const [formats, setFormats] = useState<AspectRatio[]>(["9:16"]);
  const [duration, setDuration] = useState<Duration>(10);
  const [storeLogo, setStoreLogo] = useState<PreparedLogo | null>(null);

  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const total = useMemo(() => picked.size * formats.length, [picked, formats]);

  async function onImport(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setImporting(true);
    try {
      const { products: list, logo } = await fetchStoreProducts(storeUrl);
      setProducts(list);
      setPicked(new Set()); // start empty — the user picks what to turn into ads
      // Pull the store's own brand mark for the end-card (best-effort).
      setStoreLogo(null);
      prepareStoreLogo(logo, storeUrl).then(setStoreLogo);
      if (list.length === 0) setError("No products found in that store's public feed.");
    } catch (err) {
      setProducts(null);
      setError(err instanceof Error ? err.message : "Couldn't read that store.");
    } finally {
      setImporting(false);
    }
  }

  function toggle(i: number) {
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }
  function toggleFormat(f: AspectRatio) {
    setFormats((p) => (p.includes(f) ? p.filter((x) => x !== f) : [...p, f]));
  }

  async function onGenerate() {
    if (!products) return;
    const chosen = products.filter((_, i) => picked.has(i));
    if (chosen.length === 0) return setError("Pick at least one product.");
    if (formats.length === 0) return setError("Pick at least one format.");
    if (!canRenderInBrowser())
      return setError("In-browser rendering needs a recent Chrome or Edge.");

    setRunning(true);
    setError(null);
    let firstId: string | null = null;
    let made = 0;
    let skipped = 0;
    try {
      for (let i = 0; i < chosen.length; i++) {
        const product = chosen[i];
        const at = `(${i + 1}/${chosen.length})`;
        setStatus(`Preparing ${product.title} ${at}…`);

        // Load the product image through the proxy (CORS-clean for the canvas).
        let objectUrl: string;
        let imageFile: File;
        try {
          const resp = await fetch(
            `${API_BASE}/proxy-image?url=${encodeURIComponent(product.image)}`,
          );
          if (!resp.ok) throw new Error("image");
          const blob = await resp.blob();
          imageFile = new File([blob], "product.jpg", { type: blob.type || "image/jpeg" });
          const cleaned = (await removeProductBackground(blob)) ?? blob;
          objectUrl = URL.createObjectURL(cleaned);
        } catch {
          skipped++;
          continue; // a product whose image won't load shouldn't kill the batch
        }

        try {
          const baseSpec = buildAdSpec({
            title: product.title,
            audience: audience.trim(),
            price: product.price,
            durationSec: duration,
          });
          const copy = await generateCopy({
            title: product.title,
            audience: audience.trim(),
            price: product.price,
            tone: baseSpec.tone,
          });
          const spec = applyCopy(baseSpec, copy);

          for (const fmt of formats) {
            const id = crypto.randomUUID();
            if (!firstId) firstId = id;
            setStatus(`Rendering ${product.title} · ${fmt} ${at}…`);
            const blob = await renderAdInBrowser({
              productTitle: product.title,
              productImage: objectUrl,
              price: product.price,
              audience: audience.trim() || "everyone",
              durationInSeconds: duration,
              aspectRatio: fmt,
              accent: spec.palette.accent,
              brandLogo: storeLogo?.cutout,
              brandLogoKnockout: storeLogo?.transparent,
              spec,
            });
            const job: Job = {
              id,
              status: "ready",
              product_url: "",
              target_audience: audience.trim(),
              aspect_ratio: fmt,
              duration_sec: duration,
              resolution: "1080p",
              product: {
                title: product.title,
                price: priceToCents(product.price),
                currency: "USD",
                images: [],
                specs: {},
                source: "shopify",
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
              logo: storeLogo?.cutout,
              logoKnockout: storeLogo?.transparent,
            });
            made++;
          }
        } catch {
          skipped++;
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      }

      if (made === 0) {
        setError("Couldn't generate any ads — try different products or formats.");
        setStatus(null);
        setRunning(false);
        return;
      }
      // Land on the first ad; the rest are in the library.
      router.push(firstId ? `/jobs/${firstId}` : "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed.");
      setStatus(null);
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Import */}
      <form onSubmit={onImport}>
        <Field
          label="Your store"
          hint="A Shopify store with a public products feed. Dart pulls the catalogue."
        >
          <div className="flex items-stretch gap-2">
            <div className="flex-1">
              <Input
                className="h-11"
                value={storeUrl}
                onChange={(e) => setStoreUrl(e.target.value)}
                placeholder="yourstore.com"
                inputMode="url"
              />
            </div>
            <Button type="submit" size="lg" loading={importing} variant="secondary">
              Import
            </Button>
          </div>
        </Field>
      </form>

      {error && (
        <p role="alert" className="flex items-center gap-2 text-[14px] text-ink">
          <Alert className="text-[18px] text-driftwood" />
          {error}
        </p>
      )}

      {products && products.length > 0 && (
        <>
          {/* Shared settings */}
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Audience" hint="Applied to every ad.">
              <Input
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="Runners, gift shoppers, …"
              />
            </Field>
            <Field label="Length" hint="Per ad.">
              <div className="flex gap-2">
                {DURATIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDuration(d)}
                    className={
                      "rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors " +
                      (duration === d
                        ? "border-ink bg-ink text-parchment"
                        : "border-ash bg-white text-ink hover:border-driftwood")
                    }
                  >
                    {d}s
                  </button>
                ))}
              </div>
            </Field>
          </div>

          <Field label="Formats" hint="Each format is rendered and saved for every product.">
            <div className="flex flex-wrap gap-2">
              {FORMATS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => toggleFormat(f.value)}
                  className={
                    "rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors " +
                    (formats.includes(f.value)
                      ? "border-ink bg-ink text-parchment"
                      : "border-ash bg-white text-ink hover:border-driftwood")
                  }
                >
                  {f.label}
                </button>
              ))}
            </div>
          </Field>

          {/* Product picker — tap the products you want as ads */}
          <div>
            <div className="mb-3 flex items-end justify-between">
              <div>
                <p className="text-[14px] font-medium text-ink">
                  Pick the products to turn into ads
                </p>
                <p className="mt-0.5 text-[12px] text-fog">
                  {picked.size} selected · {products.length} found
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setPicked((p) =>
                    p.size === products.length
                      ? new Set()
                      : new Set(products.map((_, i) => i)),
                  )
                }
                className="text-[13px] font-medium text-driftwood transition-colors duration-150 ease-out hover:text-ink"
              >
                {picked.size === products.length ? "Clear" : "Select all"}
              </button>
            </div>
            <ul className="grid max-h-[440px] grid-cols-1 gap-2 overflow-y-auto px-0.5 py-0.5 sm:grid-cols-2 lg:grid-cols-3">
              {products.map((p, i) => {
                const on = picked.has(i);
                return (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => toggle(i)}
                      aria-pressed={on}
                      className={
                        "group flex w-full items-center gap-3 rounded-[12px] border bg-white p-2.5 text-left transition-colors duration-150 ease-out " +
                        (on ? "border-ink" : "border-ash hover:border-driftwood")
                      }
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.image}
                        alt=""
                        loading="lazy"
                        className="size-12 shrink-0 rounded-[8px] bg-sand object-contain"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-ink">
                          {p.title}
                        </span>
                        {p.price && (
                          <span className="font-mono text-[12px] text-driftwood">{p.price}</span>
                        )}
                      </span>
                      <span
                        className={
                          "grid size-5 shrink-0 place-items-center rounded-[6px] border transition-colors duration-150 ease-out " +
                          (on
                            ? "border-ink bg-ink text-white"
                            : "border-mist bg-white text-transparent group-hover:border-driftwood")
                        }
                        aria-hidden
                      >
                        <Check className="text-[12px]" />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <Button onClick={onGenerate} size="lg" loading={running} disabled={total === 0}>
              {running
                ? status ?? "Rendering…"
                : total === 0
                  ? "Pick products to start"
                  : `Generate ${total} ad${total === 1 ? "" : "s"}`}
              {!running && total > 0 && <ArrowRight className="text-[18px]" />}
            </Button>
            {!running && total > 12 && (
              <span className="text-[13px] text-fog">
                {total} ads render one by one in your browser, so this can take a while.
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
