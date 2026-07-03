"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useJobPolling } from "@/lib/hooks";
import { useAuth } from "@/lib/auth";
import { saveAd, getAd, savedAdToJob, type SavedAd } from "@/lib/ads";
import { renderAdInBrowser, canRenderInBrowser } from "@/lib/render";
import { api, API_BASE } from "@/lib/api";
import { cost, relativeTime, isTerminal } from "@/lib/format";
import type { Job } from "@/lib/types";
import { StatusPill } from "../ui/StatusPill";
import { StageProgress } from "./StageProgress";
import { VideoPlayer } from "./VideoPlayer";
import { ProductCard } from "./ProductCard";
import { ScriptView } from "./ScriptView";
import { JobActions } from "./JobActions";
import { AdEditor } from "./AdEditor";
import { AdPager } from "./AdPager";
import { getBatch } from "@/lib/batch";
import { downloadUrl, adFileName } from "@/lib/download";
import { Button } from "../ui/Button";
import { ArrowRight, Alert, Download, Refresh, Spinner, Wand } from "../icons";

function title(job: Job): string {
  if (job.product?.title) return job.product.title;
  try {
    const u = new URL(job.product_url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return "Generating ad";
  }
}

function MetaCard({ job }: { job: Job }) {
  const rows: [string, string][] = [
    ["Audience", job.target_audience || "—"],
    ["Format", `${job.aspect_ratio} · ${job.duration_sec}s · ${job.resolution}`],
    ["Cost", cost(job.cost_cents)],
    ["Created", relativeTime(job.created_at)],
  ];
  return (
    <div className="rounded-card bg-sand p-5">
      <p className="t-caption text-fog">Job</p>
      <dl className="mt-3 flex flex-col gap-3">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 text-[14px]">
            <dt className="shrink-0 text-driftwood">{k}</dt>
            <dd className="truncate text-right text-ink" title={v}>
              {v}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ScanningCard() {
  return (
    <div className="flex flex-col items-center justify-center rounded-card bg-sand px-5 py-12 text-center">
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-2 rounded-full bg-fog"
            style={{
              animation: "dart-bounce 1s var(--ease-in-out) infinite",
              animationDelay: `${i * 140}ms`,
            }}
          />
        ))}
      </div>
      <p className="mt-4 text-[14px] text-driftwood">Reading the product page…</p>
    </div>
  );
}

// View of an ad loaded from the user's saved library (all browser-rendered ads
// land here — the backend has no live job for them). Supports editing in place:
// re-render with tweaked copy/look/format and overwrite the same entry.
function SavedAdView({ ad }: { ad: SavedAd }) {
  const job = savedAdToJob(ad);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  // After an edit, show the freshly rendered video (a local blob URL) — avoids any
  // CDN staleness from overwriting the same Storage object.
  const [editedVideo, setEditedVideo] = useState<string | null>(null);
  const [editedAspect, setEditedAspect] = useState<Job["aspect_ratio"] | null>(null);
  const videoUrl = editedVideo ?? ad.video_url;
  const aspect = editedAspect ?? job.aspect_ratio;
  const canEdit = !!ad.product_image && !!ad.product_title;

  // When this ad is part of the batch generated this session, offer the whole
  // batch as one download. (Set after mount — sessionStorage isn't SSR-safe.)
  const [batchIds, setBatchIds] = useState<string[]>([]);
  useEffect(() => setBatchIds(getBatch()), []);
  const [busyAll, setBusyAll] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const inBatch = batchIds.length > 1 && batchIds.includes(ad.id);

  function flash(msg: string) {
    setDone(msg);
    setTimeout(() => setDone(null), 2400);
  }

  async function downloadBatch() {
    setBusyAll(true);
    let ok = 0;
    for (let i = 0; i < batchIds.length; i++) {
      setProgress(`${i + 1}/${batchIds.length}`);
      const a = await getAd(batchIds[i]);
      if (
        a?.video_url &&
        (await downloadUrl(a.video_url, adFileName(a.product_title, a.aspect_ratio, a.id)))
      ) {
        ok++;
      }
    }
    setProgress(null);
    setBusyAll(false);
    flash(ok === batchIds.length ? "Downloaded all" : `Downloaded ${ok} of ${batchIds.length}`);
  }

  async function download() {
    if (!videoUrl) return;
    setBusy(true);
    try {
      const r = await fetch(videoUrl);
      if (!r.ok) throw new Error("fetch failed");
      const blob = await r.blob();
      const u = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = u;
      a.download = `dart-ad-${ad.id.slice(0, 8)}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(u);
      flash("Downloaded");
    } catch {
      window.open(videoUrl, "_blank", "noopener");
      flash("Opened in new tab");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[13px] text-driftwood transition-colors duration-150 ease-out hover:text-ink"
        >
          <ArrowRight className="rotate-180 text-[15px]" />
          Dashboard
        </Link>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h1 className="t-heading">{title(job)}</h1>
            <StatusPill status={job.status} />
          </div>
          {!editing && <AdPager currentId={ad.id} />}
        </div>
        {editing && (
          <p className="mt-2 text-[13px] text-driftwood">
            Editing — tweak the copy, look, or format and save.
          </p>
        )}
      </div>

      {editing && ad.product_image ? (
        <AdEditor
          job={job}
          imageUrl={ad.product_image}
          savedLogoUrl={ad.logo_url}
          savedKnockout={ad.logo_knockout}
          savedAccent={ad.brand_accent}
          onSaved={(v, asp) => {
            setEditedVideo(v);
            setEditedAspect(asp);
            setEditing(false);
            flash("Saved");
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="flex flex-col gap-6">
            {videoUrl ? (
              <>
                <VideoPlayer src={videoUrl} aspect={aspect} />
                <div className="flex flex-wrap items-center gap-2.5">
                  <Button onClick={download} loading={busy}>
                    <Download className="text-[18px]" />
                    Download
                  </Button>
                  {canEdit && (
                    <Button variant="secondary" onClick={() => setEditing(true)}>
                      <Wand className="text-[18px]" />
                      Edit
                    </Button>
                  )}
                  {inBatch && (
                    <Button variant="secondary" onClick={downloadBatch} loading={busyAll}>
                      <Download className="text-[18px]" />
                      {busyAll && progress
                        ? `Downloading ${progress}…`
                        : `Download all (${batchIds.length})`}
                    </Button>
                  )}
                  {done && <span className="text-[13px] text-driftwood">{done}</span>}
                </div>
              </>
            ) : (
              <div className="rounded-card bg-sand p-8 text-[14px] text-driftwood">
                This saved ad has no video.
              </div>
            )}
          </div>
          <aside className="flex flex-col gap-6">
            {job.product ? <ProductCard product={job.product} /> : null}
            <MetaCard job={job} />
          </aside>
        </div>
      )}
    </div>
  );
}

// Actions for a browser-rendered ad (video lives in Supabase Storage, not the
// backend) — direct download + regenerate.
function ClientActions({ src, jobId }: { src: string; jobId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "dl" | "regen">(null);

  async function download() {
    setBusy("dl");
    try {
      const r = await fetch(src);
      if (!r.ok) throw new Error();
      const blob = await r.blob();
      const u = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = u;
      a.download = `dart-ad-${jobId.slice(0, 8)}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(u);
    } catch {
      window.open(src, "_blank", "noopener");
    } finally {
      setBusy(null);
    }
  }

  async function regenerate() {
    setBusy("regen");
    try {
      const job = await api.regenerate(jobId);
      router.push(`/jobs/${job.id}`);
    } catch {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <Button onClick={download} loading={busy === "dl"}>
        <Download className="text-[18px]" />
        Download
      </Button>
      <Button variant="ghost" onClick={regenerate} loading={busy === "regen"}>
        <Refresh className="text-[18px]" />
        Regenerate
      </Button>
    </div>
  );
}

export function JobReview({ id }: { id: string }) {
  const { job, error, loading } = useJobPolling(id);
  const { user } = useAuth();
  const savedRef = useRef(false);
  const [saved, setSaved] = useState<SavedAd | null>(null);
  const [savedLoading, setSavedLoading] = useState(false);
  const [savedChecked, setSavedChecked] = useState(false);

  // Once the ad is rendered, persist it to the signed-in user's library.
  useEffect(() => {
    if (user && job && job.status === "ready" && job.video_url && !savedRef.current) {
      savedRef.current = true;
      void saveAd(job);
    }
  }, [user, job]);

  // Backend has nothing for this id → fall back to the saved Supabase copy.
  useEffect(() => {
    if (job || !error) return;
    let active = true;
    setSavedLoading(true);
    getAd(id).then((ad) => {
      if (!active) return;
      setSaved(ad);
      setSavedLoading(false);
      setSavedChecked(true);
    });
    return () => {
      active = false;
    };
  }, [job, error, id]);

  // Client-side render: a "ready" job with no video_url means the browser should
  // render the ad (Remotion) and upload it to the library — no key, no server.
  const [clientVideo, setClientVideo] = useState<string | null>(null);
  const [renderState, setRenderState] = useState<"idle" | "rendering" | "error">(
    "idle",
  );
  const renderRef = useRef(false);
  // Release the rendered blob when it's replaced or the page unmounts.
  useEffect(() => {
    return () => {
      if (clientVideo) URL.revokeObjectURL(clientVideo);
    };
  }, [clientVideo]);
  useEffect(() => {
    if (!job || job.status !== "ready" || job.video_url || clientVideo) return;
    if (!job.product?.images?.[0] || renderRef.current) return;
    renderRef.current = true;
    if (!canRenderInBrowser()) {
      setRenderState("error");
      return;
    }
    setRenderState("rendering");
    const img = job.product.images[0];
    const proxied = API_BASE
      ? `${API_BASE}/proxy-image?url=${encodeURIComponent(img)}`
      : img;
    renderAdInBrowser({
      productTitle: job.product.title,
      productImage: proxied,
      price: job.product.price ? `$${(job.product.price / 100).toFixed(2)}` : "",
      audience: job.target_audience || "everyone",
      durationInSeconds: job.duration_sec,
      aspectRatio: job.aspect_ratio === "9:16" ? "9:16" : "16:9",
      accent: "#0447ff",
    })
      .then((blob) => {
        setClientVideo(URL.createObjectURL(blob));
        setRenderState("idle");
      })
      .catch(() => setRenderState("error"));
  }, [job, clientVideo]);

  if (loading && !job) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="h-96 animate-pulse rounded-card bg-sand" />
        <div className="h-96 animate-pulse rounded-card bg-sand" />
      </div>
    );
  }

  if (!job) {
    if (savedLoading || (error && !savedChecked)) {
      return (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="h-96 animate-pulse rounded-card bg-sand" />
          <div className="h-96 animate-pulse rounded-card bg-sand" />
        </div>
      );
    }
    if (saved) return <SavedAdView ad={saved} />;
    return (
      <div className="mx-auto max-w-md rounded-card bg-sand px-6 py-14 text-center">
        <Alert className="mx-auto text-[28px] text-driftwood" />
        <h1 className="mt-4 text-[18px] font-medium text-ink">Job not found</h1>
        <p className="mt-2 text-[14px] text-driftwood">
          {error ?? "We couldn’t find that job."}
        </p>
        <div className="mt-6 flex justify-center">
          <Link href="/">
            <Button variant="secondary">Back to dashboard</Button>
          </Link>
        </div>
      </div>
    );
  }

  const ready = job.status === "ready";
  const failed = job.status === "failed";
  const inFlight = !isTerminal(job.status);
  const videoSrc = job.video_url || clientVideo;

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[13px] text-driftwood transition-colors duration-150 ease-out hover:text-ink"
        >
          <ArrowRight className="rotate-180 text-[15px]" />
          Dashboard
        </Link>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h1 className="t-heading">{title(job)}</h1>
            <StatusPill status={job.status} />
          </div>
          <AdPager currentId={id} />
        </div>
        {job.product_url && (
          <p className="mt-2 break-all font-mono text-[12px] text-fog">
            {job.product_url}
          </p>
        )}
      </div>

      {/* Main + side */}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-6">
          {ready && videoSrc && (
            <>
              <VideoPlayer src={videoSrc} aspect={job.aspect_ratio} />
              {job.video_url ? (
                <JobActions jobId={job.id} />
              ) : (
                <ClientActions src={videoSrc} jobId={job.id} />
              )}
            </>
          )}

          {ready && !videoSrc && renderState === "rendering" && (
            <div className="flex flex-col items-center gap-3 rounded-card bg-white p-10 text-center shadow-[var(--shadow-elevated)]">
              <Spinner className="size-6 text-driftwood" />
              <p className="text-[15px] font-medium text-ink">Rendering your ad…</p>
              <p className="max-w-sm text-[13px] leading-relaxed text-driftwood">
                Your browser is rendering the video. Keep this tab open. It
                takes a few seconds.
              </p>
            </div>
          )}

          {ready && !videoSrc && renderState === "error" && (
            <div className="rounded-card bg-sand p-8">
              <Alert className="text-[26px] text-driftwood" />
              <h2 className="mt-4 text-[18px] font-medium text-ink">
                Couldn’t render here
              </h2>
              <p className="mt-2 max-w-md text-[14px] leading-relaxed text-driftwood">
                In-browser rendering needs a recent Chrome or Edge. Open this
                page there, or regenerate to try again.
              </p>
              <div className="mt-6">
                <JobActions jobId={job.id} failed />
              </div>
            </div>
          )}

          {failed && (
            <div className="rounded-card bg-sand p-8">
              <Alert className="text-[26px] text-driftwood" />
              <h2 className="mt-4 text-[18px] font-medium text-ink">
                This job failed
              </h2>
              <p className="mt-2 max-w-md text-[14px] leading-relaxed text-driftwood">
                {job.error?.message ?? "Something went wrong during generation."}
              </p>
              <div className="mt-6">
                <JobActions jobId={job.id} failed />
              </div>
            </div>
          )}

          {inFlight && <StageProgress status={job.status} />}
        </div>

        <aside className="flex flex-col gap-6">
          {job.product ? <ProductCard product={job.product} /> : <ScanningCard />}
          <MetaCard job={job} />
        </aside>
      </div>

      {/* Script */}
      {job.script && (
        <div className="mt-6">
          <ScriptView script={job.script} />
        </div>
      )}
    </div>
  );
}
