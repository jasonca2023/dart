"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, USING_MOCK } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { listAds, savedAdToJob } from "@/lib/ads";
import { cost, relativeTime, isTerminal } from "@/lib/format";
import type { Job } from "@/lib/types";
import { StatusPill } from "../ui/StatusPill";
import { Orb } from "../ui/Orb";
import { ArrowUpRight, Film } from "../icons";

function label(job: Job): string {
  if (job.product?.title) return job.product.title;
  try {
    const u = new URL(job.product_url);
    return u.hostname.replace(/^www\./, "") + u.pathname;
  } catch {
    return job.product_url || "Untitled job";
  }
}

const toneCycle = ["cinematic", "energetic", "luxe", "playful", "calm"] as const;

export function RecentJobs() {
  const { user, loading: authLoading } = useAuth();
  const [jobs, setJobs] = useState<Job[] | null>(null);

  useEffect(() => {
    if (authLoading) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    const load = async () => {
      try {
        if (user) {
          // Signed in: the persistent library from Supabase.
          const ads = await listAds();
          if (!active) return;
          setJobs(ads.map(savedAdToJob));
        } else if (USING_MOCK) {
          // Local demo (no backend): the in-browser mock jobs.
          const next = await api.listJobs();
          if (!active) return;
          setJobs(next);
          if (next.some((j) => !isTerminal(j.status))) {
            timer = setTimeout(load, 2500); // refresh while in flight
          }
        } else {
          // Signed out against a real backend: don't expose other users' jobs.
          if (!active) return;
          setJobs([]);
        }
      } catch {
        if (active) setJobs([]);
      }
    };

    load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [user, authLoading]);

  if (jobs === null) {
    return (
      <ul className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <li
            key={i}
            className="h-[72px] animate-pulse rounded-card bg-sand"
            style={{ animationDelay: `${i * 80}ms` }}
          />
        ))}
      </ul>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-card bg-sand px-6 py-14 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-white text-driftwood shadow-[var(--shadow-inset-warm)]">
          <Film className="text-[22px]" />
        </span>
        <p className="mt-5 text-[15px] font-medium text-ink">No ads yet</p>
        <p className="mt-1.5 max-w-xs text-[14px] text-driftwood">
          Paste a product URL above and your first cut will appear here.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {jobs.map((job, i) => (
        <li key={job.id}>
          <Link
            href={`/jobs/${job.id}`}
            className="group flex items-center gap-4 rounded-card border border-transparent bg-sand p-3 pr-4 transition-[border-color,background-color] duration-150 ease-out hover:border-ash hover:bg-white"
          >
            <span className="flex size-14 shrink-0 items-center justify-center rounded-[14px] bg-white shadow-[var(--shadow-inset-warm)]">
              <Orb tone={toneCycle[i % toneCycle.length]} className="size-9" float={false} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-medium text-ink">
                {label(job)}
              </p>
              <p className="mt-0.5 font-mono text-[12px] text-fog">
                {job.aspect_ratio} · {job.duration_sec}s · {job.resolution} ·{" "}
                {relativeTime(job.created_at)}
              </p>
            </div>
            <div className="hidden sm:block">
              <span className="font-mono text-[12px] text-driftwood">
                {cost(job.cost_cents)}
              </span>
            </div>
            <StatusPill status={job.status} />
            <ArrowUpRight className="text-[18px] text-fog transition-colors duration-150 ease-out group-hover:text-ink" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
