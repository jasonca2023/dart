// Per-user saved ads, backed by Supabase (table: dart_ads, row-level secured).
// All calls no-op when Supabase isn't configured or no user is signed in.

import { supabase } from "./supabase";
import type { Job } from "./types";

export interface SavedAd {
  id: string;
  product_url: string;
  target_audience: string | null;
  product_title: string | null;
  product_image: string | null;
  video_url: string | null;
  aspect_ratio: string;
  duration_sec: number;
  resolution: string;
  status: string;
  cost_cents: number;
  created_at: string;
}

const VIDEO_BUCKET = "dart-videos";

// Copy the rendered video into Supabase Storage so a saved ad survives backend
// restarts and plays on any device. Returns a durable public URL — or the
// original URL if the copy fails, so we never lose the record.
async function persistVideo(
  client: NonNullable<typeof supabase>,
  userId: string,
  jobId: string,
  sourceUrl: string,
): Promise<string> {
  try {
    const res = await fetch(sourceUrl);
    if (!res.ok) return sourceUrl;
    const blob = await res.blob();
    const path = `${userId}/${jobId}.mp4`;
    const { error } = await client.storage
      .from(VIDEO_BUCKET)
      .upload(path, blob, { upsert: true, contentType: "video/mp4" });
    if (error) return sourceUrl;
    return client.storage.from(VIDEO_BUCKET).getPublicUrl(path).data.publicUrl;
  } catch {
    return sourceUrl;
  }
}

// Upsert a finished job into the signed-in user's library (idempotent on id).
export async function saveAd(job: Job): Promise<void> {
  if (!supabase) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const videoUrl = job.video_url
    ? await persistVideo(supabase, user.id, job.id, job.video_url)
    : null;

  await supabase.from("dart_ads").upsert(
    {
      id: job.id,
      user_id: user.id,
      product_url: job.product_url,
      target_audience: job.target_audience,
      product_title: job.product?.title ?? null,
      product_image: job.product?.images?.[0] ?? null,
      video_url: videoUrl,
      aspect_ratio: job.aspect_ratio,
      duration_sec: job.duration_sec,
      resolution: job.resolution,
      status: job.status,
      cost_cents: job.cost_cents,
    },
    { onConflict: "id" },
  );
}

export async function listAds(): Promise<SavedAd[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("dart_ads")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as SavedAd[];
}

export async function getAd(id: string): Promise<SavedAd | null> {
  if (!supabase) return null;
  const { data } = await supabase
    .from("dart_ads")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as SavedAd) ?? null;
}

// Map a saved ad into the minimal Job shape the dashboard list renders.
export function savedAdToJob(ad: SavedAd): Job {
  return {
    id: ad.id,
    status: ad.status as Job["status"],
    product_url: ad.product_url,
    target_audience: ad.target_audience ?? "",
    aspect_ratio: ad.aspect_ratio as Job["aspect_ratio"],
    duration_sec: ad.duration_sec,
    resolution: ad.resolution as Job["resolution"],
    product: ad.product_title
      ? {
          title: ad.product_title,
          price: 0,
          currency: "USD",
          images: ad.product_image ? [ad.product_image] : [],
          specs: {},
          source: "web",
        }
      : null,
    script: null,
    video_url: ad.video_url,
    error: null,
    cost_cents: ad.cost_cents,
    created_at: ad.created_at,
    updated_at: ad.created_at,
  };
}
