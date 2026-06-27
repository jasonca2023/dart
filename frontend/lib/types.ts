// Mirrors docs/API_CONTRACT.md — the only seam between frontend and backend.

export type JobStatus =
  | "queued"
  | "scraping"
  | "scripting"
  | "rendering"
  | "ready"
  | "failed";

export type AspectRatio = "16:9" | "1:1" | "4:5" | "9:16";
export type Resolution = "1080p" | "2160p";
// Custom ad length in seconds (backend accepts 3–20).
export type Duration = number;
export type ExportDestination = "tiktok" | "meta" | "youtube" | "download";

export interface Product {
  title: string;
  price: number; // integer cents
  currency: string;
  images: string[];
  specs: Record<string, string>;
  source: string;
}

export interface Scene {
  t_start: number;
  t_end: number;
  description: string;
  camera: string;
}

export interface Script {
  video_prompt: string;
  scenes: Scene[];
}

export interface Job {
  id: string;
  status: JobStatus;
  product_url: string;
  target_audience: string;
  aspect_ratio: AspectRatio;
  duration_sec: Duration;
  resolution: Resolution;
  product: Product | null;
  script: Script | null;
  video_url: string | null;
  error: ApiError | null;
  cost_cents: number;
  created_at: string;
  updated_at: string;
}

export interface CreateJobInput {
  product_url: string;
  target_audience: string;
  aspect_ratio?: AspectRatio;
  duration_sec?: Duration;
  resolution?: Resolution;
}

export interface ApiError {
  code:
    | "invalid_url"
    | "scrape_failed"
    | "no_product_image"
    | "script_failed"
    | "render_failed"
    | "rate_limited"
    | "not_found"
    | "internal";
  message: string;
  retryable: boolean;
}

export interface ExportHandoff {
  destination: ExportDestination;
  handoff_url: string;
  expires_at: string;
}

export const STAGES: { key: JobStatus; label: string; verb: string }[] = [
  { key: "scraping", label: "Scrape", verb: "Reading the product page" },
  { key: "scripting", label: "Script", verb: "Directing the scene" },
  { key: "rendering", label: "Render", verb: "Filming in 4K" },
  { key: "ready", label: "Ready", verb: "Cut and exported" },
];
