// Visual judge: grades a rendered frame of the AI-written ad. Server-side so the
// HF token stays off the client. The browser sends one mid-video frame as a data
// URL; a vision model decides whether it's a polished ad or should be regenerated.

const HF_URL = "https://router.huggingface.co/v1/chat/completions";
const VISION_MODEL =
  process.env.HF_VISION_MODEL || "Qwen/Qwen2.5-VL-72B-Instruct";

interface JudgeBody {
  image: string; // data URL (jpeg/png)
  title: string;
  audience: string;
}

interface Verdict {
  pass: boolean;
  score: number;
  feedback: string;
}

const PROMPT = (title: string, audience: string) =>
  `This is one frame from a short product ad video for "${title}", aimed at "${audience}".
Judge it as a paying customer's marketing director would. Check:
1. Is the product clearly visible and not cropped or hidden?
2. Is any text fully on-screen (not cut off at edges), legible, and not overlapping the product?
3. Does it look intentional and polished (not blank, not broken, not a wall of plain text, good contrast and balance)?
4. Does the style suit the audience?

Respond with ONLY strict JSON, no markdown:
{"pass": <true if this is a good, shippable ad frame; false if it needs another attempt>, "score": <0-100>, "feedback": "<one concrete sentence on the biggest thing to fix; empty if pass>"}`;

function parseVerdict(content: string): Verdict {
  const match = content.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const v = JSON.parse(match[0]) as Partial<Verdict>;
      return {
        pass: !!v.pass,
        score: typeof v.score === "number" ? v.score : v.pass ? 80 : 40,
        feedback: typeof v.feedback === "string" ? v.feedback : "",
      };
    } catch {
      /* fall through */
    }
  }
  // Unparseable judge output: don't block the user — accept.
  return { pass: true, score: 70, feedback: "" };
}

export async function POST(req: Request): Promise<Response> {
  const token = process.env.HF_TOKEN;
  if (!token) {
    return Response.json({ error: "HF_TOKEN is not set." }, { status: 500 });
  }
  let body: JudgeBody;
  try {
    body = (await req.json()) as JudgeBody;
  } catch {
    return Response.json({ error: "Bad request body." }, { status: 400 });
  }
  if (!body.image?.startsWith("data:")) {
    return Response.json({ error: "image must be a data URL." }, { status: 400 });
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
        model: VISION_MODEL,
        temperature: 0,
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT(body.title, body.audience) },
              { type: "image_url", image_url: { url: body.image } },
            ],
          },
        ],
      }),
    });
  } catch (e) {
    // Judge unreachable: accept rather than fail the whole render.
    return Response.json({ pass: true, score: 70, feedback: "" });
  }

  if (!hfRes.ok) {
    return Response.json({ pass: true, score: 70, feedback: "" });
  }
  const data = (await hfRes.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  return Response.json(parseVerdict(content));
}
