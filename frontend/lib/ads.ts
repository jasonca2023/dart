// Per-user saved ads, backed by Supabase (table: dart_ads, row-level secured).
// All calls no-op when Supabase isn't configured or no user is signed in.

import { supabase } from "./supabase";
import type { Job } from "./types";

export interface SavedAd {
  id: string;
  product_url: string;
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

// Upsert a finished job into the signed-in user's library (idempotent on id).
export async function saveAd(job: Job): Promise<void> {
  if (!supabase) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("dart_ads").upsert(
    {
      id: job.id,
      user_id: user.id,
      product_url: job.product_url,
      product_title: job.product?.title ?? null,
      product_image: job.product?.images?.[0] ?? null,
      video_url: job.video_url,
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
    target_audience: "",
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
