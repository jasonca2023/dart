// Save videos to the user's disk. No zip dependency — files download one by one
// (the browser asks once to allow multiple downloads from the site).

// A browser-rendered ad is saved in whatever container its WebCodecs encoder
// produced — mp4 on Chromium, webm on browsers without an mp4 encoder (Firefox,
// older Safari; see lib/ads.ts). The download name must carry the true extension,
// or the file is a .mp4 that isn't one and players reject it. Read it from the
// saved URL first (authoritative — that's what was uploaded), then a blob's MIME
// type, else mp4.
export function videoExt(
  url?: string | null,
  blobType?: string | null,
): "mp4" | "webm" {
  if (/\.webm(?:[?#]|$)/i.test(url ?? "")) return "webm";
  if (/\.mp4(?:[?#]|$)/i.test(url ?? "")) return "mp4";
  if (blobType && blobType.toLowerCase().includes("webm")) return "webm";
  return "mp4";
}

export function adFileName(
  title: string | null | undefined,
  aspect: string,
  id: string,
  ext: "mp4" | "webm" = "mp4",
): string {
  const slug = (title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `dart-${slug || id.slice(0, 8)}-${aspect.replace(":", "x")}.${ext}`;
}

export async function downloadUrl(url: string, filename: string): Promise<boolean> {
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(String(r.status));
    const blob = await r.blob();
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(u);
    return true;
  } catch {
    return false;
  }
}
