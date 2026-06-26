import { getCloudflareContext } from "@opennextjs/cloudflare";

// The LLM copy brain. Runs on the Cloudflare Worker and calls Workers AI (free
// tier, no external key) to write bespoke ad copy for a product. Always returns
// 200 with `{ copy }` — `copy: null` when the model is unavailable/over quota or
// the output can't be parsed, so the client cleanly falls back to rule-based copy.

// Swap this one line to change models (e.g. @cf/mistralai/mistral-small-3.1-24b-instruct).
const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

interface WorkersAI {
  run: (
    model: string,
    options: Record<string, unknown>,
  ) => Promise<{ response?: string } | string>;
}

export interface AdCopy {
  eyebrow?: string;
  hook?: string;
  subhead?: string;
  cta?: string;
}

const SYSTEM = `You are an expert advertising copywriter for short, silent product video ads.
Write punchy, concrete copy that could ONLY describe THIS product — never generic filler that would fit any product.
Match the requested tone. Do not invent specs, numbers, prices, or claims that aren't given.
Reply with ONLY a JSON object (no markdown, no commentary) with exactly these keys: "eyebrow", "hook", "subhead", "cta".
Character limits: eyebrow <= 28, hook <= 40, subhead <= 58, cta <= 22.
"hook" is the opening line; "cta" is the closing button text (e.g. "Shop now").`;

function clip(s: unknown, max: number): string | undefined {
  if (typeof s !== "string") return undefined;
  const t = s.trim().replace(/^["']|["']$/g, "");
  if (!t) return undefined;
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + "…";
}

// Pull a JSON object out of the model's reply (tolerates code fences / stray text).
function parseCopy(raw: string): AdCopy | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  const copy: AdCopy = {
    eyebrow: clip(obj.eyebrow, 28),
    hook: clip(obj.hook, 40),
    subhead: clip(obj.subhead, 58),
    cta: clip(obj.cta, 22),
  };
  // Only worth using if the model produced the lines that actually matter.
  return copy.hook || copy.subhead ? copy : null;
}

export async function POST(req: Request): Promise<Response> {
  let body: { title?: string; audience?: string; price?: string; tone?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ copy: null });
  }
  const title = (body.title || "").trim();
  if (!title) return Response.json({ copy: null });

  let ai: WorkersAI | undefined;
  try {
    ai = (getCloudflareContext().env as unknown as { AI?: WorkersAI }).AI;
  } catch {
    ai = undefined;
  }
  if (!ai) return Response.json({ copy: null });

  const user =
    `Product: "${title}"\n` +
    `Audience: ${(body.audience || "general shoppers").trim()}\n` +
    `Price: ${(body.price || "").trim() || "not given"}\n` +
    `Tone: ${(body.tone || "energetic").trim()}\n\n` +
    `Write the ad copy as JSON.`;

  try {
    const result = await ai.run(MODEL, {
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
      max_tokens: 256,
      temperature: 0.7,
    });
    const text = typeof result === "string" ? result : result.response ?? "";
    return Response.json({ copy: parseCopy(text) });
  } catch {
    return Response.json({ copy: null });
  }
}
