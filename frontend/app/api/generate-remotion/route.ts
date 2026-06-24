// Codegen endpoint: an HF model writes a bespoke Remotion component for the
// product. Runs server-side (on the Cloudflare Worker) so the HF token is never
// exposed to the browser. The browser transpiles + renders whatever comes back,
// inside a locked-down require()-shim, and falls back to the template if it's bad.

const HF_URL = "https://router.huggingface.co/v1/chat/completions";
const CODE_MODEL = process.env.HF_CODE_MODEL || "Qwen/Qwen3-Coder-30B-A3B-Instruct";

interface GenBody {
  title: string;
  audience: string;
  price: string;
  durationInSeconds: number;
  aspectRatio: "16:9" | "9:16";
  width: number;
  height: number;
  fps: number;
  previousCode?: string;
  feedback?: string;
}

// The renderer exposes exactly these to the generated module (see aiRemotion.ts).
const ALLOWED = [
  "AbsoluteFill",
  "Sequence",
  "Series",
  "Img",
  "useCurrentFrame",
  "useVideoConfig",
  "interpolate",
  "spring",
  "random",
  "Easing",
];

function systemPrompt(b: GenBody): string {
  return `You are a senior motion designer who writes Remotion (React) ad videos.
You output ONE self-contained TypeScript React component and nothing else.

HARD RULES (a violation means the ad fails to render):
- Output a single \`\`\`tsx code block. No prose before or after.
- The module MUST: import React from "react"; import the components/hooks you use from "remotion". Import ONLY from "react" and "remotion". No other imports, no fonts, no network, no fetch, no external assets.
- The ONLY "remotion" names you may import are: ${ALLOWED.join(", ")}.
- \`export default\` a component named Ad that takes props:
  { productImage: string; productTitle: string; price: string; audience: string }.
- productImage is a real photo URL — render it with <Img src={props.productImage}/> as the visual hero, large and fully visible (use objectFit:"contain", never crop the product).
- Canvas is EXACTLY ${b.width}x${b.height} px, ${b.fps}fps, ${Math.round(
    b.durationInSeconds * b.fps,
  )} frames total (${b.durationInSeconds}s). Animate across the WHOLE duration — no static frames, no dead air, no blank end.
- Drive every animation from useCurrentFrame(); keep it deterministic (no Date, no Math.random — use Remotion's random(seed)).
- Keep ALL text inside a safe margin (>=6% from every edge), high-contrast, legible, and never overlapping the product. Use system fonts only (system-ui, Georgia, "SF Mono").
- No comments that aren't valid code. The file must compile as-is.

CREATIVE BRIEF — tailor the design to THIS product and audience (this is the point; do not output a generic template):
- Product: "${b.title}"
- Price: ${b.price || "(not provided — do not invent one)"}
- Target audience: "${b.audience}"
- Aspect ratio: ${b.aspectRatio}
Think about what look (color, type, pacing, motion, composition) best sells THIS product to THIS audience, then build it. Make confident, specific design choices. Use multiple scenes/sequences with motion (entrances, easing, scale/opacity/position) so it feels like a real ad, not a slideshow.`;
}

function userPrompt(b: GenBody): string {
  if (b.previousCode && b.feedback) {
    return `Your previous component did not pass visual review.

REVIEWER FEEDBACK: ${b.feedback}

Here is your previous code:
\`\`\`tsx
${b.previousCode}
\`\`\`

Rewrite the component to fix the feedback. Keep all HARD RULES. Output only the corrected \`\`\`tsx block.`;
  }
  return `Design and write the Remotion ad component now. Output only the \`\`\`tsx block.`;
}

function extractCode(content: string): string | null {
  const fenced = content.match(/```(?:tsx|ts|jsx|js)?\s*([\s\S]*?)```/);
  const code = (fenced ? fenced[1] : content).trim();
  if (!code || !/export\s+default/.test(code)) return null;
  return code;
}

export async function POST(req: Request): Promise<Response> {
  const token = process.env.HF_TOKEN;
  if (!token) {
    return Response.json(
      { error: "HF_TOKEN is not set on the server." },
      { status: 500 },
    );
  }
  let body: GenBody;
  try {
    body = (await req.json()) as GenBody;
  } catch {
    return Response.json({ error: "Bad request body." }, { status: 400 });
  }

  let hfRes: Response;
  try {
    hfRes = await fetch(HF_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: CODE_MODEL,
        temperature: 0.7,
        max_tokens: 4000,
        messages: [
          { role: "system", content: systemPrompt(body) },
          { role: "user", content: userPrompt(body) },
        ],
      }),
    });
  } catch (e) {
    return Response.json(
      { error: `HF request failed: ${(e as Error).message}` },
      { status: 502 },
    );
  }

  if (!hfRes.ok) {
    const detail = await hfRes.text().catch(() => "");
    return Response.json(
      { error: `HF ${hfRes.status}: ${detail.slice(0, 300)}` },
      { status: 502 },
    );
  }

  const data = (await hfRes.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  const code = extractCode(content);
  if (!code) {
    return Response.json(
      { error: "Model did not return a usable component." },
      { status: 422 },
    );
  }
  return Response.json({ code, model: CODE_MODEL });
}
