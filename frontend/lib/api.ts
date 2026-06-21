// Single client used by every screen. Talks to the real backend when
// NEXT_PUBLIC_API_BASE_URL is set; otherwise drives the local mock pipeline so
// the whole frontend is functional standalone (per frontend README + AGENTS.md).

import { mock } from "./mock";
import { supabase } from "./supabase";
import type {
  CreateJobInput,
  ExportDestination,
  ExportHandoff,
  Job,
  VideoSettings,
} from "./types";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "";
export const API_BASE = BASE;
export const USING_MOCK = !BASE;

// A small artificial latency on the mock so loading states are exercised.
const tick = () => new Promise<void>((r) => setTimeout(r, 280));

// The logged-in user's Supabase access token, so the backend can authorize
// write calls. Empty when signed out / Supabase not configured.
async function authHeader(): Promise<Record<string, string>> {
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(await authHeader()),
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiRequestError(
      body?.error?.message || `Request failed (${res.status})`,
      body?.error?.code || "internal",
      res.status,
    );
  }
  return res.json();
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export const api = {
  async createJob(input: CreateJobInput): Promise<Job> {
    if (USING_MOCK) {
      await tick();
      return mock.createJob(input);
    }
    return http<Job>("/jobs", { method: "POST", body: JSON.stringify(input) });
  },

  async getJob(id: string): Promise<Job> {
    if (USING_MOCK) {
      const job = mock.getJob(id);
      if (!job) throw new ApiRequestError("Job not found.", "not_found", 404);
      return job;
    }
    return http<Job>(`/jobs/${id}`);
  },

  async listJobs(): Promise<Job[]> {
    if (USING_MOCK) {
      await tick();
      return mock.listJobs();
    }
    const data = await http<{ jobs: Job[] }>("/jobs");
    return data.jobs;
  },

  async regenerate(id: string): Promise<Job> {
    if (USING_MOCK) {
      await tick();
      const job = mock.regenerate(id);
      if (!job) throw new ApiRequestError("Job not found.", "not_found", 404);
      return job;
    }
    return http<Job>(`/jobs/${id}/regenerate`, { method: "POST" });
  },

  async exportJob(
    id: string,
    destination: ExportDestination,
  ): Promise<ExportHandoff> {
    if (USING_MOCK) {
      await tick();
      if (destination === "download") {
        return {
          destination,
          handoff_url: "https://media.w3.org/2010/05/sintel/trailer.mp4",
          expires_at: new Date(Date.now() + 36e5).toISOString(),
        };
      }
      const platforms: Record<string, string> = {
        tiktok: "https://ads.tiktok.com/",
        meta: "https://business.facebook.com/adsmanager/",
        youtube: "https://studio.youtube.com/",
      };
      return {
        destination,
        handoff_url: platforms[destination] ?? "https://ads.tiktok.com/",
        expires_at: new Date(Date.now() + 36e5).toISOString(),
      };
    }
    return http<ExportHandoff>(`/jobs/${id}/export`, {
      method: "POST",
      body: JSON.stringify({ destination }),
    });
  },

  async getSettings(): Promise<VideoSettings> {
    if (USING_MOCK) {
      return {
        video_provider: "mock",
        video_generator: "MockVideoGenerator",
        ltx_key_set: false,
      };
    }
    return http<VideoSettings>("/settings");
  },

  async setLtxKey(apiKey: string): Promise<VideoSettings & { ok: boolean }> {
    return http<VideoSettings & { ok: boolean }>("/settings/ltx-key", {
      method: "POST",
      body: JSON.stringify({ api_key: apiKey }),
    });
  },
};
