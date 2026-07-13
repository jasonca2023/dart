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
} from "./types";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "";
export const API_BASE = BASE;
export const USING_MOCK = !BASE;

// Wake the (free-tier) backend early, so the first save doesn't wait ~50s for a
// cold start. Fire-and-forget on real user intent (reaching the generator, then
// again on generate), throttled so repeated calls don't spam /health. No-op in
// mock mode. By the time a user has filled the form + rendered, it's warm.
let lastWarm = 0;
export function warmBackend(): void {
  if (!API_BASE) return;
  const now = Date.now();
  if (now - lastWarm < 120_000) return; // at most once per 2 min
  lastWarm = now;
  fetch(`${API_BASE}/health`, { cache: "no-store" }).catch(() => {});
}

// A small artificial latency on the mock so loading states are exercised.
const tick = () => new Promise<void>((r) => setTimeout(r, 280));

// Errors from the backend carry a stable machine-readable code (see
// docs/API_CONTRACT.md) — UIs branch on that, never on the message wording.
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

// JSON POST against the backend; throws ApiError on a contract error.
export async function postJson<T = unknown>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let code = "internal";
    let message = "Something went wrong.";
    try {
      const data = (await res.json()) as {
        error?: { code?: string; message?: string };
      };
      if (data.error?.code) code = data.error.code;
      if (data.error?.message) message = data.error.message;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(code, message);
  }
  return (await res.json()) as T;
}

// The logged-in user's access token — for endpoints that take it in the body.
export async function getAccessToken(): Promise<string> {
  if (!supabase) return "";
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? "";
}

// The logged-in user's Supabase access token, so the backend can authorize
// write calls. Empty when signed out / Supabase not configured.
async function authHeader(): Promise<Record<string, string>> {
  const token = await getAccessToken();
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
};
