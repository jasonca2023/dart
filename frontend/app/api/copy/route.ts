import { getCloudflareContext } from "@opennextjs/cloudflare";

// The LLM copy brain. Runs on the Cloudflare Worker and calls Workers AI (free
// tier, no external key) to write bespoke ad copy for a product. Always returns
// 200 with `{ copy }` — `copy: null` when the model is unavailable/over quota or
// the output can't be parsed, so the client cleanly falls back to rule-based copy.

// Swap this one line to change models (e.g. @cf/mistralai/mistral-small-3.1-24b-instruct,
// @cf/qwen/qwen3-30b-a3b-fp8, @cf/deepseek-ai/deepseek-r1-distill-qwen-32b).
const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

// NB: do NOT pass `temperature` to the binding — it throws inside Workers AI here.

interface WorkersAI {
  run: (
    model: string,
    options: Record<string, unknown>,
  ) => Promise<{ response?: unknown } | string>;
}

export interface AdCopy {
  name?: string; // the core product name (colour/variant stripped)
  eyebrow?: string;
  hook?: string;
  subhead?: string;
  cta?: string;
}

const SYSTEM = `You are an expert advertising copywriter for short, silent product video ads.
Write punchy, concrete copy that could ONLY describe THIS product, never generic filler that would fit any product.
Match the requested tone. Do not invent specs, numbers, prices, or claims that aren't given.
Use plain punctuation. Never use an em-dash (—); use a period or comma instead.
Keep every line SHORT and COMPLETE. Never cut a line off mid-word, and never end with "…". Hard word caps:
- name: the core product, meaning its product type and edition or model. Read the WHOLE title and drop every colour, size, material, capacity, pack count, condition and marketing or variant word WHEREVER it sits (start, middle, end, parentheses, or after a dash or slash), keeping only the words a shopper would actually use to name the product. ALWAYS keep the brand and any audience or gender qualifier (Men's, Women's, Kids', Unisex, Youth) — those are part of the name, not noise. Copy the kept words verbatim from the title in their original order; never invent, translate, or reorder. 2 to 6 words. Examples: "Sony WH-1000XM5 Wireless Noise Cancelling Black Headphones" becomes "Sony WH-1000XM5 Headphones"; "Men's Strider - Natural Black (Natural Black Sole)" becomes "Men's Strider".
- eyebrow: 1-3 words
- hook: 2-5 words
- subhead: one short phrase, 9 words max. Describe the product itself, not its colour or variant.
- cta: 2-3 words (button text, e.g. "Shop now")
"hook" is the opening line; "cta" is the closing button text.
Output a SINGLE JSON object with exactly the keys "name", "eyebrow", "hook", "subhead", "cta" and NOTHING else: no markdown, no preamble, no explanation, no second attempt. Stop after the closing brace.`;

function clip(s: unknown, max: number): string | undefined {
  if (typeof s !== "string") return undefined;
  const t = s.trim().replace(/^["']|["']$/g, "");
  if (!t) return undefined;
  if (t.length <= max) return t;
  // Truncate on a word boundary so we never leave a mid-word stub ("…player, j…").
  let cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > max * 0.5) cut = cut.slice(0, lastSpace);
  return cut.replace(/[\s.,;:!?-]+$/, "") + "…";
}

// Return the FIRST balanced {...} block that parses as an object. The model can
// be chatty (prose, self-critique, a second attempt) — a naive first-{ to last-}
// slice would span multiple objects and fail, so walk brace depth instead.
function firstJsonObject(raw: string): Record<string, unknown> | null {
  let depth = 0;
  let start = -1;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}" && depth > 0) {
      depth--;
      if (depth === 0 && start !== -1) {
        try {
          const obj = JSON.parse(raw.slice(start, i + 1));
          if (obj && typeof obj === "object") return obj as Record<string, unknown>;
        } catch {
          /* not valid JSON — keep scanning for the next block */
        }
        start = -1;
      }
    }
  }
  return null;
}

// The model returns a shortened product name. Trust it only if every kept word is
// drawn from the title, in the title's own order — a word-subsequence. That lets the
// model drop colour/size/variant words from ANYWHERE in the name (start, middle, or
// end), while still blocking invented or reordered words, so it trims rather than
// renames. e.g. from "Sony WH-1000XM5 Wireless Noise Cancelling Black Headphones" it
// may keep "Sony WH-1000XM5 Headphones"; "Premium Running Shoe" is rejected.
function validName(v: unknown, title: string): string | undefined {
  if (typeof v !== "string") return undefined;
  const name = v.trim().replace(/^["']|["']$/g, "");
  if (name.length < 2) return undefined;
  const words = (s: string) => s.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const nameWords = words(name);
  const titleWords = words(title);
  if (nameWords.length === 0) return undefined;
  let ti = 0;
  for (const w of nameWords) {
    while (ti < titleWords.length && titleWords[ti] !== w) ti++;
    if (ti >= titleWords.length) return undefined; // word missing (or out of order) → invented
    ti++;
  }
  return name;
}

// A leading audience/gender qualifier (Men's, Women's, Kids'…) is part of the
// product's identity, not noise — re-add it if the model trimmed it off.
function withQualifier(name: string | undefined, title: string): string | undefined {
  if (!name) return name;
  const m = title.trim().match(/^(men'?s|women'?s|kids'?|boys'?|girls'?|unisex|youth|childrens?'?)\b/i);
  if (!m) return name;
  const firstWord = (s: string) => (s.toLowerCase().match(/[a-z]+/) ?? [""])[0];
  return firstWord(name).startsWith(firstWord(m[0])) ? name : `${m[0]} ${name}`;
}

function parseCopy(raw: string, title: string): AdCopy | null {
  const obj = firstJsonObject(raw);
  if (!obj) return null;
  const copy: AdCopy = {
    name: withQualifier(validName(obj.name, title), title),
    eyebrow: clip(obj.eyebrow, 28),
    hook: clip(obj.hook, 40),
    subhead: clip(obj.subhead, 58),
    cta: clip(obj.cta, 22),
  };
  return copy.name || copy.hook || copy.subhead ? copy : null;
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

  // Try the chat (messages) shape first; fall back to a plain prompt so swapping
  // MODEL to one that only accepts `prompt` keeps working.
  const run = async (inputs: Record<string, unknown>): Promise<string | null> => {
    try {
      const result = await ai!.run(MODEL, inputs);
      if (typeof result === "string") return result;
      return typeof result.response === "string" ? result.response : null;
    } catch {
      return null;
    }
  };

  let text = await run({
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: user },
    ],
    max_tokens: 256,
  });
  if (text === null) {
    text = await run({ prompt: `${SYSTEM}\n\n${user}`, max_tokens: 256 });
  }

  return Response.json({ copy: text ? parseCopy(text, title) : null });
}
