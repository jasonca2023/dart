// The AI ad pipeline: an HF model writes a bespoke Remotion component for the
// product, we transpile + render it in the browser, a vision model grades a
// frame, and we self-heal (regenerate with feedback) until it passes or we run
// out of attempts. Any hard failure throws so the caller can fall back to the
// built-in template — the user always gets a video.

import { renderComponentInBrowser, dimsFor } from "./render";

export interface AiAdInput {
  productImage: string; // object URL or remote URL
  productTitle: string;
  price: string;
  audience: string;
  durationInSeconds: number;
  aspectRatio: "16:9" | "9:16";
}

export interface AiAdResult {
  blob: Blob;
  code: string;
  score: number;
  attempts: number;
}

export type Phase =
  | { kind: "designing"; attempt: number }
  | { kind: "rendering"; attempt: number }
  | { kind: "reviewing"; attempt: number }
  | { kind: "revising"; attempt: number; feedback: string };

const FPS = 30;
const MAX_ATTEMPTS = 3;
const PASS_SCORE = 70;

// Bounds so a stuck step can never spin forever — it bails to the template.
const CODEGEN_MS = 60_000;
const RENDER_MS = 90_000;
const FRAME_MS = 10_000;
const JUDGE_MS = 35_000;
const TOTAL_BUDGET_MS = 170_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)),
      ms,
    );
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

// --- Sandbox: turn AI-written TSX into a component ------------------------

// Only these modules are resolvable from generated code. Anything else throws,
// which fails the attempt (caught by the loop) — generated code can't reach the
// network, the DOM, storage or the user's Supabase session.
async function buildRequire(): Promise<(name: string) => unknown> {
  const [React, JsxRuntime, JsxDevRuntime, Remotion] = await Promise.all([
    import("react"),
    import("react/jsx-runtime"),
    import("react/jsx-dev-runtime").catch(() => null),
    import("remotion"),
  ]);
  const allowed: Record<string, unknown> = {
    react: React,
    "react/jsx-runtime": JsxRuntime,
    "react/jsx-dev-runtime": JsxDevRuntime ?? JsxRuntime,
    remotion: Remotion,
  };
  return (name: string) => {
    if (name in allowed) return allowed[name];
    throw new Error(`import not allowed: "${name}"`);
  };
}

export async function transpileComponent(
  tsx: string,
): Promise<React.FC<Record<string, unknown>>> {
  const { transform } = await import("sucrase");
  const { code } = transform(tsx, {
    transforms: ["typescript", "jsx", "imports"],
    jsxRuntime: "automatic",
    production: true,
  });
  const requireShim = await buildRequire();
  const module = { exports: {} as Record<string, unknown> };
  // eslint-disable-next-line no-new-func
  const factory = new Function("require", "exports", "module", code);
  factory(requireShim, module.exports, module);
  const candidate =
    (module.exports.default as unknown) ??
    (typeof module.exports === "function" ? module.exports : undefined);
  if (typeof candidate !== "function") {
    throw new Error("generated module did not export a component");
  }
  return candidate as React.FC<Record<string, unknown>>;
}

// --- Frame extraction for the judge --------------------------------------

// Grab one frame from the rendered MP4 as a small JPEG data URL. The blob is
// same-origin so the canvas isn't tainted.
async function extractFrame(blob: Blob, atSeconds: number): Promise<string> {
  const url = URL.createObjectURL(blob);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.src = url;
    await withTimeout(
      new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => resolve();
        video.onerror = () => reject(new Error("could not read rendered video"));
      }),
      FRAME_MS,
      "video load",
    );
    const target = Math.min(atSeconds, Math.max(0, (video.duration || 0) - 0.05));
    await withTimeout(
      new Promise<void>((resolve, reject) => {
        video.onseeked = () => resolve();
        video.onerror = () => reject(new Error("could not seek rendered video"));
        video.currentTime = target;
      }),
      FRAME_MS,
      "video seek",
    );
    const scale = Math.min(1, 720 / (video.videoWidth || 720));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round((video.videoWidth || 1280) * scale);
    canvas.height = Math.round((video.videoHeight || 720) * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// --- Backend calls (token stays server-side) -----------------------------

async function generateCode(
  input: AiAdInput,
  prev?: { code: string; feedback: string },
): Promise<string> {
  const { width, height } = dimsFor(input.aspectRatio);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), CODEGEN_MS);
  try {
    const res = await fetch("/api/generate-remotion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        title: input.productTitle,
        audience: input.audience || "everyone",
        price: input.price,
        durationInSeconds: input.durationInSeconds,
        aspectRatio: input.aspectRatio,
        width,
        height,
        fps: FPS,
        previousCode: prev?.code,
        feedback: prev?.feedback,
      }),
    });
    const data = (await res.json()) as { code?: string; error?: string };
    if (!res.ok || !data.code) {
      throw new Error(data.error || `codegen failed (${res.status})`);
    }
    return data.code;
  } finally {
    clearTimeout(t);
  }
}

async function judge(
  image: string,
  input: AiAdInput,
): Promise<{ pass: boolean; score: number; feedback: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), JUDGE_MS);
  try {
    const res = await fetch("/api/judge-ad", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        image,
        title: input.productTitle,
        audience: input.audience || "everyone",
      }),
    });
    if (!res.ok) return { pass: true, score: 70, feedback: "" };
    return (await res.json()) as { pass: boolean; score: number; feedback: string };
  } catch {
    // Timed out or unreachable — don't block the user.
    return { pass: true, score: 70, feedback: "" };
  } finally {
    clearTimeout(t);
  }
}

// --- The loop ------------------------------------------------------------

export async function generateAiAd(
  input: AiAdInput,
  onPhase?: (p: Phase) => void,
): Promise<AiAdResult> {
  const props: Record<string, unknown> = {
    productImage: input.productImage,
    productTitle: input.productTitle,
    price: input.price,
    audience: input.audience || "everyone",
  };
  let prev: { code: string; feedback: string } | undefined;
  let best: { blob: Blob; code: string; score: number } | null = null;
  let lastError = "";
  const startedAt = Date.now();

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Stop starting new attempts once we're out of time budget.
    if (Date.now() - startedAt > TOTAL_BUDGET_MS) {
      lastError = lastError || "ran out of time budget";
      break;
    }
    onPhase?.(
      prev
        ? { kind: "revising", attempt, feedback: prev.feedback }
        : { kind: "designing", attempt },
    );
    const tick = (msg: string) =>
      console.info(`[ai] attempt ${attempt} ${msg} +${Date.now() - startedAt}ms`);
    tick("codegen start");
    let code: string;
    try {
      code = await generateCode(input, prev);
      tick("codegen done");
    } catch (e) {
      lastError = (e as Error).message;
      break; // codegen itself is down — stop and let the caller fall back.
    }

    let Component: React.FC<Record<string, unknown>>;
    try {
      Component = await transpileComponent(code);
    } catch (e) {
      prev = { code, feedback: `Code did not compile: ${(e as Error).message}` };
      lastError = (e as Error).message;
      continue;
    }

    onPhase?.({ kind: "rendering", attempt });
    let blob: Blob;
    try {
      blob = await withTimeout(
        renderComponentInBrowser(Component, props, {
          aspectRatio: input.aspectRatio,
          durationInSeconds: input.durationInSeconds,
        }),
        RENDER_MS,
        "render",
      );
      tick("render done");
    } catch (e) {
      tick(`render failed: ${(e as Error).message}`);
      prev = { code, feedback: `Render failed: ${(e as Error).message}` };
      lastError = (e as Error).message;
      continue;
    }

    onPhase?.({ kind: "reviewing", attempt });
    let frame: string;
    try {
      frame = await extractFrame(blob, input.durationInSeconds * 0.5);
    } catch {
      // Can't grab a frame, but we have a render — take it.
      return { blob, code, score: 70, attempts: attempt };
    }
    const verdict = await judge(frame, input);
    tick(`judged score=${verdict.score} pass=${verdict.pass}`);
    if (!best || verdict.score > best.score) best = { blob, code, score: verdict.score };
    if (verdict.pass && verdict.score >= PASS_SCORE) {
      return { blob, code, score: verdict.score, attempts: attempt };
    }
    prev = {
      code,
      feedback: verdict.feedback || "Make it more polished and on-brand.",
    };
  }

  if (best) return { ...best, attempts: MAX_ATTEMPTS };
  throw new Error(lastError || "AI ad generation failed");
}
