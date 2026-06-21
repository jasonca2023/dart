import type { ProductAdProps } from "./remotion/ProductAd";

const FPS = 30;

// Render the Dart ad to an MP4 Blob entirely in the browser (WebCodecs). The
// heavy Remotion code is dynamically imported so it only loads when a render
// actually runs. Requires Chrome 94+ / Edge / Firefox 130+ / Safari 26+.
export async function renderAdInBrowser(props: ProductAdProps): Promise<Blob> {
  const [{ renderMediaOnWeb }, { ProductAd }] = await Promise.all([
    import("@remotion/web-renderer"),
    import("./remotion/ProductAd"),
  ]);

  const dims =
    props.aspectRatio === "9:16"
      ? { width: 1080, height: 1920 }
      : { width: 1920, height: 1080 };

  const { getBlob } = await renderMediaOnWeb({
    composition: {
      component: ProductAd as unknown as React.FC<Record<string, unknown>>,
      id: "ProductAd",
      durationInFrames: Math.max(1, Math.round(props.durationInSeconds * FPS)),
      fps: FPS,
      ...dims,
      calculateMetadata: null,
    },
    inputProps: props as unknown as Record<string, unknown>,
  });

  return getBlob();
}

// Whether this browser can render client-side (needs WebCodecs).
export function canRenderInBrowser(): boolean {
  return typeof window !== "undefined" && "VideoEncoder" in window;
}
