// Remove a product photo's background entirely in the browser (WASM/WebGPU via
// @imgly/background-removal) so it sits cleanly on the ad's stage — no server, no
// key, nothing leaves the browser. Returns a transparent PNG Blob, or null if it
// fails/times out so the caller can fall back to the original image and never
// block a render. Model assets are fetched + cached on first use.

const TIMEOUT_MS = 120_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("background removal timed out")), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export async function removeProductBackground(
  file: File | Blob,
  onStatus?: (msg: string) => void,
): Promise<Blob | null> {
  try {
    const { removeBackground } = await import("@imgly/background-removal");
    const blob = await withTimeout(
      removeBackground(file as Blob, {
        // Full-precision model (vs the default isnet_fp16) — the best cutout this
        // free in-browser library offers. Larger one-time download, $0.
        model: "isnet",
        output: { format: "image/png" },
        progress: (key: string, current: number, total: number) => {
          if (!onStatus) return;
          const pct = total ? Math.min(100, Math.round((current / total) * 100)) : 0;
          // First run downloads the model/wasm; after that it's instant (cached).
          const downloading = key.startsWith("fetch") || key.startsWith("download");
          onStatus(
            downloading ? `Preparing background remover… ${pct}%` : "Removing the background…",
          );
        },
      }),
      TIMEOUT_MS,
    );
    return blob;
  } catch (e) {
    console.warn("background removal failed, using the original image:", e);
    return null;
  }
}
