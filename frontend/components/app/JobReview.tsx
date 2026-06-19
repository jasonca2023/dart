"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useJobPolling } from "@/lib/hooks";
import { useAuth } from "@/lib/auth";
import { saveAd, getAd, savedAdToJob, type SavedAd } from "@/lib/ads";
import { cost, relativeTime, isTerminal } from "@/lib/format";
import type { Job } from "@/lib/types";
import { StatusPill } from "../ui/StatusPill";
import { StageProgress } from "./StageProgress";
import { VideoPlayer } from "./VideoPlayer";
import { ProductCard } from "./ProductCard";
import { ScriptView } from "./ScriptView";
import { JobActions } from "./JobActions";
import { Button } from "../ui/Button";
import { ArrowRight, Alert, Download } from "../icons";

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

// Read-only view of an ad loaded from the user's saved library (used when the
// backend no longer has the live job — e.g. a past session or after a restart).
function SavedAdView({ ad }: { ad: SavedAd }) {
  const job = savedAdToJob(ad);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  function flash(msg: string) {
    setDone(msg);
    setTimeout(() => setDone(null), 2400);
  }

  async function download() {
    if (!ad.video_url) return;
    setBusy(true);
    try {
      const r = await fetch(ad.video_url);
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
      window.open(ad.video_url, "_blank", "noopener");
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
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="t-heading">{title(job)}</h1>
          <StatusPill status={job.status} />
        </div>
        <p className="mt-2 break-all font-mono text-[12px] text-fog">
          {job.product_url}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-6">
          {ad.video_url ? (
            <>
              <VideoPlayer src={ad.video_url} aspect={job.aspect_ratio} />
              <div className="flex flex-wrap items-center gap-2.5">
                <Button onClick={download} loading={busy}>
                  <Download className="text-[18px]" />
                  Download
                </Button>
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
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="t-heading">{title(job)}</h1>
          <StatusPill status={job.status} />
        </div>
        <p className="mt-2 break-all font-mono text-[12px] text-fog">
          {job.product_url}
        </p>
      </div>

      {/* Main + side */}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-6">
          {ready && job.video_url && (
            <>
              <VideoPlayer src={job.video_url} aspect={job.aspect_ratio} />
              <JobActions jobId={job.id} />
            </>
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
