"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { API_BASE } from "@/lib/api";
import { fetchStoreProducts, type StoreProduct } from "@/lib/store";
import { buildAdSpec } from "@/lib/adSpec";
import { generateCopy, applyCopy } from "@/lib/copy";
import { applyBrand, loadBrandKit, type BrandKit } from "@/lib/brand";
import { removeProductBackground } from "@/lib/bgRemove";
import { renderAdInBrowser, canRenderInBrowser } from "@/lib/render";
import { saveRenderedAdViaBackend } from "@/lib/ads";
import type { AspectRatio, Duration, Job } from "@/lib/types";
import { Field, Input } from "../ui/Field";
import { Button } from "../ui/Button";
import { Alert, ArrowRight } from "../icons";

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
  const [brand, setBrand] = useState<BrandKit>({});

  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setBrand(loadBrandKit()), []);

  const total = useMemo(() => picked.size * formats.length, [picked, formats]);

  async function onImport(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setImporting(true);
    try {
      const list = await fetchStoreProducts(storeUrl);
      setProducts(list);
      setPicked(new Set(list.map((_, i) => i))); // select all by default
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
          const spec = applyBrand(applyCopy(baseSpec, copy), brand);

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
              brandLogo: brand.logo,
              brandLogoKnockout: brand.logoTransparent,
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
            await saveRenderedAdViaBackend(job, blob, imageFile);
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
      <form onSubmit={onImport} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field
            label="Your store"
            hint="A Shopify store with a public products feed — Dart pulls the catalogue."
          >
            <Input
              value={storeUrl}
              onChange={(e) => setStoreUrl(e.target.value)}
              placeholder="yourstore.com"
              inputMode="url"
            />
          </Field>
        </div>
        <Button type="submit" loading={importing} variant="secondary">
          Import products
        </Button>
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

          {/* Product picker */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[14px] font-medium text-ink">
                {picked.size} of {products.length} products
              </p>
              <button
                type="button"
                onClick={() =>
                  setPicked((p) =>
                    p.size === products.length
                      ? new Set()
                      : new Set(products.map((_, i) => i)),
                  )
                }
                className="text-[13px] font-medium text-driftwood hover:text-ink"
              >
                {picked.size === products.length ? "Clear all" : "Select all"}
              </button>
            </div>
            <ul className="grid max-h-[420px] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
              {products.map((p, i) => {
                const on = picked.has(i);
                return (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => toggle(i)}
                      className={
                        "flex w-full items-center gap-2.5 rounded-card border p-2 text-left transition-colors " +
                        (on
                          ? "border-ink bg-white"
                          : "border-transparent bg-sand hover:border-ash")
                      }
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.image}
                        alt=""
                        className="size-11 shrink-0 rounded-[8px] bg-white object-contain"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-ink">
                          {p.title}
                        </span>
                        <span className="font-mono text-[12px] text-fog">{p.price}</span>
                      </span>
                      <span
                        className={
                          "size-4 shrink-0 rounded-full border " +
                          (on ? "border-ink bg-ink" : "border-mist")
                        }
                        aria-hidden
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="flex items-center gap-4">
            <Button onClick={onGenerate} size="lg" loading={running} disabled={total === 0}>
              {running ? status ?? "Rendering…" : `Generate ${total} ad${total === 1 ? "" : "s"}`}
              {!running && <ArrowRight className="text-[18px]" />}
            </Button>
            {!running && total > 12 && (
              <span className="text-[13px] text-fog">
                {total} ads render one by one in your browser — this can take a while.
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
