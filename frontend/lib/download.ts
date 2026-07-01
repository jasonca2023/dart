// Save videos to the user's disk. No zip dependency — files download one by one
// (the browser asks once to allow multiple downloads from the site).

export function adFileName(
  title: string | null | undefined,
  aspect: string,
  id: string,
): string {
  const slug = (title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `dart-${slug || id.slice(0, 8)}-${aspect.replace(":", "x")}.mp4`;
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
