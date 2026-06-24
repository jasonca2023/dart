import type { ProductAdProps } from "./remotion/ProductAd";

const FPS = 30;

export function dimsFor(aspectRatio: "16:9" | "9:16") {
  return aspectRatio === "9:16"
    ? { width: 1080, height: 1920 }
    : { width: 1920, height: 1080 };
}

// Render an arbitrary Remotion component to an MP4 Blob in the browser
// (WebCodecs). Used for both the built-in template and AI-written components.
export async function renderComponentInBrowser(
  component: React.FC<Record<string, unknown>>,
  inputProps: Record<string, unknown>,
  opts: { aspectRatio: "16:9" | "9:16"; durationInSeconds: number; id?: string },
): Promise<Blob> {
  const { renderMediaOnWeb } = await import("@remotion/web-renderer");
  const { getBlob } = await renderMediaOnWeb({
    composition: {
      component,
      id: opts.id ?? "Ad",
      durationInFrames: Math.max(1, Math.round(opts.durationInSeconds * FPS)),
      fps: FPS,
      ...dimsFor(opts.aspectRatio),
      calculateMetadata: null,
    },
    inputProps,
  });
  return getBlob();
}

// Render the Dart ad to an MP4 Blob entirely in the browser (WebCodecs). The
// heavy Remotion code is dynamically imported so it only loads when a render
// actually runs. Requires Chrome 94+ / Edge / Firefox 130+ / Safari 26+.
export async function renderAdInBrowser(props: ProductAdProps): Promise<Blob> {
  const { ProductAd } = await import("./remotion/ProductAd");
  return renderComponentInBrowser(
    ProductAd as unknown as React.FC<Record<string, unknown>>,
    props as unknown as Record<string, unknown>,
    {
      aspectRatio: props.aspectRatio === "9:16" ? "9:16" : "16:9",
      durationInSeconds: props.durationInSeconds,
      id: "ProductAd",
    },
  );
}

// Whether this browser can render client-side (needs WebCodecs).
export function canRenderInBrowser(): boolean {
  return typeof window !== "undefined" && "VideoEncoder" in window;
}
