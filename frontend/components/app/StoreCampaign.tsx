"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { API_BASE } from "@/lib/api";
import { fetchStoreProducts, prepareStoreLogo, type StoreProduct } from "@/lib/store";
import type { PreparedLogo } from "@/lib/logo";
import { buildAdSpec } from "@/lib/adSpec";
import { generateCopy, applyCopy } from "@/lib/copy";
import { removeProductBackground } from "@/lib/bgRemove";
import { renderAdInBrowser, canRenderInBrowser, isLikelySafari } from "@/lib/render";
import { saveRenderedAdViaBackend } from "@/lib/ads";
import { setBatch } from "@/lib/batch";
import { downloadUrl, adFileName } from "@/lib/download";
import type { AspectRatio, Duration, Job } from "@/lib/types";
import { Field, Input } from "../ui/Field";
import { Button, ButtonLink } from "../ui/Button";
import { Alert, ArrowRight, Check, Download } from "../icons";

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

// One finished ad from a batch run, for the summary grid + download-all.
interface MadeAd {
  id: string;
  title: string;
  fmt: AspectRatio;
  image: string;
  video: string;
}

export function StoreCampaign() {
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

  // Set once a run finishes — the form gives way to the batch summary.
  const [result, setResult] = useState<{ made: MadeAd[]; skipped: string[] } | null>(null);
  const [dlBusy, setDlBusy] = useState(false);
  const [dlMsg, setDlMsg] = useState<string | null>(null);

  const total = useMemo(() => picked.size * formats.length, [picked, formats]);

  const [safari, setSafari] = useState(false);
  useEffect(() => setSafari(isLikelySafari()), []);

  // Pop each tile in as it scrolls into the picker's own scroll area. The tiles
  // live in an overflow container, so the observer's root is that container (not
  // the page) or nothing below the fold would ever count as "in view". One-shot
  // per tile; re-runs (and re-hides) when the product set changes.
  const gridRef = useRef<HTMLUListElement | null>(null);
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const tiles = Array.from(grid.querySelectorAll<HTMLElement>(":scope > li"));
    tiles.forEach((t) => delete t.dataset.revealed);
    if (typeof IntersectionObserver === "undefined") {
      tiles.forEach((t) => (t.dataset.revealed = "true"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        // Reveal top-to-bottom, with a small stagger within each wave so a
        // scrolled-in batch cascades instead of popping all at once.
        entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
          .forEach((e, idx) => {
            const el = e.target as HTMLElement;
            el.style.animationDelay = `${Math.min(idx * 45, 180)}ms`;
            el.dataset.revealed = "true";
            io.unobserve(el);
          });
      },
      { root: grid, rootMargin: "0px 0px -6% 0px", threshold: 0.1 },
    );
    tiles.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, [products]);

  const importSeq = useRef(0);

  async function onImport(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setImporting(true);
    try {
      const { products: list, logo } = await fetchStoreProducts(storeUrl);
      setProducts(list);
      setPicked(new Set()); // start empty — the user picks what to turn into ads
      // Pull the store's own brand mark for the end-card (best-effort). Guard
      // against a slow earlier import landing after a newer one and attaching
      // the wrong store's logo.
      setStoreLogo(null);
      const seq = ++importSeq.current;
      prepareStoreLogo(logo, storeUrl).then((l) => {
        if (seq === importSeq.current) setStoreLogo(l);
      });
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
      return setError(
        "In-browser rendering needs a recent Chrome, Edge, Firefox, or Safari 26+.",
      );

    setRunning(true);
    setError(null);
    const made: MadeAd[] = [];
    const skipped: string[] = [];
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
          skipped.push(product.title);
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
            const videoUrl = await saveRenderedAdViaBackend(job, blob, imageFile, {
              accent: spec.palette.accent,
              logo: storeLogo?.cutout,
              logoKnockout: storeLogo?.transparent,
            });
            made.push({ id, title: product.title, fmt, image: product.image, video: videoUrl });
          }
        } catch {
          skipped.push(product.title);
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      }

      if (made.length === 0) {
        setError("Couldn't generate any ads — try different products or formats.");
        setStatus(null);
        setRunning(false);
        return;
      }
      // The pager on each ad page flips through this batch.
      setBatch(made.map((m) => m.id));
      setResult({ made, skipped });
      setStatus(null);
      setRunning(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed.");
      setStatus(null);
      setRunning(false);
    }
  }

  async function downloadAll() {
    if (!result) return;
    setDlBusy(true);
    let ok = 0;
    for (let i = 0; i < result.made.length; i++) {
      const m = result.made[i];
      setDlMsg(`Downloading ${i + 1}/${result.made.length}…`);
      if (await downloadUrl(m.video, adFileName(m.title, m.fmt, m.id))) ok++;
    }
    setDlBusy(false);
    setDlMsg(ok === result.made.length ? "All downloaded" : `Downloaded ${ok} of ${result.made.length}`);
    setTimeout(() => setDlMsg(null), 3000);
  }

  // Batch finished — show what was made instead of dumping the user on one ad.
  if (result) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <p className="text-[16px] font-medium text-ink">
            Made {result.made.length} ad{result.made.length === 1 ? "" : "s"}
            {result.skipped.length > 0 && (
              <span className="font-normal text-driftwood">
                {" "}
                · {result.skipped.length} skipped
              </span>
            )}
          </p>
          <p className="mt-1 text-[13px] text-fog">
            Saved to your library. Open one and flip through the batch with the arrows.
          </p>
        </div>

        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {result.made.map((m) => (
            <li key={m.id}>
              <Link
                href={`/jobs/${m.id}`}
                className="group flex items-center gap-3 rounded-[12px] border border-ash bg-white p-2.5 transition-colors duration-150 ease-out hover:border-driftwood"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={m.image}
                  alt=""
                  loading="lazy"
                  className="size-12 shrink-0 rounded-[8px] bg-sand object-contain"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-ink">
                    {m.title}
                  </span>
                  <span className="font-mono text-[12px] text-driftwood">{m.fmt}</span>
                </span>
                <ArrowRight className="shrink-0 text-[16px] text-driftwood transition-colors duration-150 ease-out group-hover:text-ink" />
              </Link>
            </li>
          ))}
        </ul>

        {result.skipped.length > 0 && (
          <p className="flex items-start gap-2 text-[13px] text-driftwood">
            <Alert className="mt-0.5 shrink-0 text-[16px]" />
            <span>Skipped (image or render failed): {result.skipped.join(", ")}</span>
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2.5">
          <Button onClick={downloadAll} loading={dlBusy}>
            <Download className="text-[18px]" />
            {dlBusy ? dlMsg ?? "Downloading…" : "Download all"}
          </Button>
          <ButtonLink href={`/jobs/${result.made[0].id}`} variant="secondary">
            Open first ad
            <ArrowRight className="text-[16px]" />
          </ButtonLink>
          <Button variant="ghost" onClick={() => setResult(null)}>
            Make more
          </Button>
          {!dlBusy && dlMsg && <span className="text-[13px] text-driftwood">{dlMsg}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Import */}
      <form onSubmit={onImport}>
        <Field
          label="Your store"
          hint="A Shopify store URL pulls the whole catalogue. A product page link imports just that product."
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

          {/* Product picker — an image-forward grid; tap a tile to select it. */}
          <div>
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <p className="text-[14px] font-medium text-ink">
                  Pick the products to turn into ads
                </p>
                <p className="mt-0.5 text-[12px] text-fog">
                  <span className={picked.size > 0 ? "font-medium text-ink" : ""}>
                    {picked.size} selected
                  </span>{" "}
                  · {products.length} found
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
                className="shrink-0 rounded-full border border-ash bg-white px-3 py-1.5 text-[12px] font-medium text-driftwood transition-colors duration-150 ease-out hover:border-driftwood hover:text-ink"
              >
                {picked.size === products.length ? "Clear all" : "Select all"}
              </button>
            </div>
            <ul
              ref={gridRef}
              className="grid max-h-[560px] grid-cols-2 gap-x-4 gap-y-6 overflow-y-auto px-1 py-1 sm:grid-cols-3 lg:grid-cols-4"
            >
              {products.map((p, i) => {
                const on = picked.has(i);
                return (
                  // Hidden until it scrolls into view, then pops in (see the
                  // IntersectionObserver above). Reveal is imperative, so toggling
                  // selection doesn't replay it.
                  <li key={i} className="tile-reveal">
                    <button
                      type="button"
                      onClick={() => toggle(i)}
                      aria-pressed={on}
                      title={p.title}
                      className="group block w-full text-left transition-transform duration-200 ease-out hover:-translate-y-1 focus:outline-none"
                    >
                      {/* No card frame — just the photo on a soft rounded ground.
                          Selection reads as an ink ring on the image itself. */}
                      <div
                        className={
                          "relative aspect-square overflow-hidden rounded-[14px] bg-sand ring-2 transition-shadow duration-200 ease-out " +
                          (on
                            ? "ring-ink"
                            : "ring-transparent group-hover:ring-ash group-focus-visible:ring-ink")
                        }
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={p.image}
                          alt=""
                          loading="lazy"
                          className={
                            "size-full object-contain p-3 transition-transform duration-300 ease-out group-hover:scale-[1.05] " +
                            (on ? "scale-[1.02]" : "")
                          }
                        />
                        {/* Selection check — a hollow ink ring at rest (so tiles read
                            as selectable), filled ink when chosen. */}
                        <span
                          aria-hidden
                          className={
                            "absolute right-2.5 top-2.5 grid size-6 place-items-center rounded-full border backdrop-blur-sm transition-all duration-150 ease-out " +
                            (on
                              ? "border-ink bg-ink text-white"
                              : "border-mist bg-white/80 text-transparent group-hover:border-driftwood")
                          }
                        >
                          <Check className="text-[13px]" />
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5 px-0.5 pt-2.5">
                        <span className="line-clamp-2 text-[13px] font-medium leading-snug text-ink">
                          {p.title}
                        </span>
                        {p.price && (
                          <span className="font-mono text-[12px] tabular-nums text-driftwood">
                            {p.price}
                          </span>
                        )}
                      </div>
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
          {safari && (
            <p className="text-[12px] leading-relaxed text-driftwood">
              For the most accurate colours, render in Chrome or Edge — Safari can
              export a little darker.
            </p>
          )}
        </>
      )}
    </div>
  );
}
