import type { JobStatus } from "./types";

export function money(cents: number, currency = "USD"): string {
  // `currency` can come from scraped page data and isn't always a valid ISO
  // 4217 code ("US Dollar", "£") — Intl throws a RangeError on those.
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

export function cost(cents: number): string {
  if (cents <= 0) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day} d ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export const STATUS_LABEL: Record<JobStatus, string> = {
  queued: "Queued",
  scraping: "Scraping",
  scripting: "Scripting",
  rendering: "Rendering",
  ready: "Ready",
  failed: "Failed",
};

export function isTerminal(status: JobStatus): boolean {
  return status === "ready" || status === "failed";
}

// 0..1 progress across the four-stage pipeline.
export function pipelineProgress(status: JobStatus): number {
  switch (status) {
    case "queued":
      return 0.04;
    case "scraping":
      return 0.28;
    case "scripting":
      return 0.52;
    case "rendering":
      return 0.8;
    case "ready":
      return 1;
    case "failed":
      return 1;
  }
}
