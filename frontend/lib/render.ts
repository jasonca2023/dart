import type { ProductAdProps } from "./remotion/ProductAd";
import type { AspectRatio } from "./types";

const FPS = 30;

export function dimsFor(aspectRatio: AspectRatio) {
  switch (aspectRatio) {
    case "9:16":
      return { width: 1080, height: 1920 };
    case "4:5":
      return { width: 1080, height: 1350 };
    case "1:1":
      return { width: 1080, height: 1080 };
    default:
      return { width: 1920, height: 1080 };
  }
}

// Render an arbitrary Remotion component to an MP4 Blob in the browser
// (WebCodecs). Used for both the built-in template and AI-written components.
export async function renderComponentInBrowser(
  component: React.FC<Record<string, unknown>>,
  inputProps: Record<string, unknown>,
  opts: { aspectRatio: AspectRatio; durationInSeconds: number; id?: string },
): Promise<Blob> {
  const { renderMediaOnWeb, canRenderMediaOnWeb } = await import(
    "@remotion/web-renderer"
  );
  const { width, height } = dimsFor(opts.aspectRatio);

  // Dart's ads are silent, so check + render MUTED. That drops the audio-codec
  // requirement, which is what let Chrome-only work before: browsers with
  // video-only WebCodecs (Safari 16.4–18) and modern Firefox/Safari can encode
  // the video, they just couldn't satisfy an audio track we never use.
  const support = await canRenderMediaOnWeb({ width, height, muted: true });
  if (!support.canRender) {
    const err = support.issues.find((i) => i.severity === "error");
    throw new Error(
      (err ? `${err.message} ` : "") +
        "In-browser rendering needs a recent Chrome, Edge, Firefox, or Safari 26+.",
    );
  }

  const { getBlob } = await renderMediaOnWeb({
    composition: {
      component,
      id: opts.id ?? "Ad",
      durationInFrames: Math.max(1, Math.round(opts.durationInSeconds * FPS)),
      fps: FPS,
      width,
      height,
      calculateMetadata: null,
    },
    inputProps,
    muted: true,
  });
  return getBlob();
}

// Render the Dart ad to an MP4 Blob entirely in the browser (WebCodecs). The
// heavy Remotion code is dynamically imported so it only loads when a render
// actually runs. Requires Chrome 94+ / Edge / Firefox 130+ / Safari 26+.
export async function renderAdInBrowser(props: ProductAdProps): Promise<Blob> {
  const [{ ProductAd }, { fontsReady }] = await Promise.all([
    import("./remotion/ProductAd"),
    import("./remotion/fonts"),
  ]);
  // Wait for the real webfonts before rasterizing (cap at 5s so a slow/blocked
  // font never stalls a render — the fallback stack renders either way). The
  // `.catch` matters too: if a font load *rejects*, we still proceed rather than
  // letting the rejection fail the whole render. Timer is cleared once either
  // side settles so a fast font-load doesn't leave a 5s no-op timer running.
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 5000);
    fontsReady
      .catch(() => {})
      .then(() => {
        clearTimeout(timer);
        resolve();
      });
  });
  return renderComponentInBrowser(
    ProductAd as unknown as React.FC<Record<string, unknown>>,
    props as unknown as Record<string, unknown>,
    {
      aspectRatio: props.aspectRatio,
      durationInSeconds: props.durationInSeconds,
      id: "ProductAd",
    },
  );
}

// Whether this browser can render client-side (needs WebCodecs).
export function canRenderInBrowser(): boolean {
  return typeof window !== "undefined" && "VideoEncoder" in window;
}

// Safari's WebCodecs encoder tags colours differently (full-range sRGB), so its
// exported video can look darker than Chrome's. Best-effort UA sniff — only used
// to show a soft "render in Chrome for the most accurate colour" hint.
export function isLikelySafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /safari/i.test(ua) && !/chrome|chromium|crios|fxios|edg|android/i.test(ua);
}
