// Smart logo prep — runs in the browser on a <canvas>. Removes a *useless*
// backdrop (a uniform near-white or near-black border, the classic "exported on
// a white card" case) by flood-keying from the edges, while leaving a logo whose
// background is part of the design (colourful, non-uniform, or already
// transparent) untouched. Because dark logos vanish on the ad's dark panel, it
// also returns a backing-chip colour so a dark cutout still reads.

export interface PreparedLogo {
  original: string; // downscaled data URL, as uploaded
  cutout: string; // background-removed + cropped (or === original if nothing removed)
  cutoutChip: string | null; // chip colour behind the cutout when it's dark, else null
  removed: boolean; // did we actually strip a backdrop?
}

const MAX = 440;

function loadImage(file: File): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

const lum = (r: number, g: number, b: number) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

export async function prepareLogo(file: File): Promise<PreparedLogo | null> {
  if (typeof document === "undefined") return null;
  if (file.size > 3_000_000) return null; // 3MB pre-downscale cap
  const img = await loadImage(file);
  if (!img || !img.width || !img.height) return null;

  const scale = Math.min(1, MAX / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  const original = canvas.toDataURL("image/png");

  const image = ctx.getImageData(0, 0, w, h);
  const px = image.data;
  const N = w * h;

  // Already has real transparency? Then the designer cut it out — leave it.
  let transparentPx = 0;
  for (let i = 0; i < N; i++) if (px[i * 4 + 3] < 240) transparentPx++;
  const hasAlpha = transparentPx / N > 0.06;

  // Sample the border ring to find the backdrop colour + how uniform it is.
  const sample: number[][] = [];
  const step = Math.max(1, Math.floor(Math.min(w, h) / 60));
  for (let x = 0; x < w; x += step) {
    sample.push([px[x * 4], px[x * 4 + 1], px[x * 4 + 2]]);
    const b = ((h - 1) * w + x) * 4;
    sample.push([px[b], px[b + 1], px[b + 2]]);
  }
  for (let y = 0; y < h; y += step) {
    const l = y * w * 4;
    sample.push([px[l], px[l + 1], px[l + 2]]);
    const r = (y * w + w - 1) * 4;
    sample.push([px[r], px[r + 1], px[r + 2]]);
  }
  const mean = [0, 0, 0];
  for (const s of sample) for (let k = 0; k < 3; k++) mean[k] += s[k];
  for (let k = 0; k < 3; k++) mean[k] /= sample.length;
  let dev = 0;
  for (const s of sample)
    dev = Math.max(dev, Math.abs(s[0] - mean[0]), Math.abs(s[1] - mean[1]), Math.abs(s[2] - mean[2]));

  const uniform = dev < 26;
  const bgLum = lum(mean[0], mean[1], mean[2]);
  // "Useless" = a uniform border that's clearly a neutral export backdrop
  // (near-white or near-black). A uniform *saturated* colour is left alone — it
  // may be a branded badge.
  const sat = Math.max(mean[0], mean[1], mean[2]) - Math.min(mean[0], mean[1], mean[2]);
  const useless = uniform && sat < 30 && (bgLum > 0.85 || bgLum < 0.16);

  let removed = false;
  if (!hasAlpha && useless) {
    // Flood-key the backdrop colour, seeded from every border pixel that matches.
    const tol2 = 52 * 52;
    const match = (i: number) => {
      const dr = px[i * 4] - mean[0];
      const dg = px[i * 4 + 1] - mean[1];
      const db = px[i * 4 + 2] - mean[2];
      return dr * dr + dg * dg + db * db <= tol2;
    };
    const visited = new Uint8Array(N);
    const stack: number[] = [];
    const seed = (i: number) => {
      if (!visited[i] && match(i)) {
        visited[i] = 1;
        stack.push(i);
      }
    };
    for (let x = 0; x < w; x++) {
      seed(x);
      seed((h - 1) * w + x);
    }
    for (let y = 0; y < h; y++) {
      seed(y * w);
      seed(y * w + w - 1);
    }
    let count = 0;
    while (stack.length) {
      const i = stack.pop() as number;
      px[i * 4 + 3] = 0;
      count++;
      const x = i % w;
      const y = (i / w) | 0;
      if (x > 0) seed(i - 1);
      if (x < w - 1) seed(i + 1);
      if (y > 0) seed(i - w);
      if (y < h - 1) seed(i + w);
    }
    const frac = count / N;
    // Removed a sensible amount (not nothing, not basically-everything).
    if (frac > 0.04 && frac < 0.92) {
      ctx.putImageData(image, 0, 0);
      removed = true;
    }
  }

  // Crop the (transparent) logo to its content box + small padding, and measure
  // its luminance so a dark mark can sit on a light chip.
  const transparentNow = hasAlpha || removed;
  let cutout = original;
  let cutoutChip: string | null = null;
  if (transparentNow) {
    let minX = w,
      minY = h,
      maxX = -1,
      maxY = -1;
    let lr = 0,
      lg = 0,
      lb = 0,
      ln = 0;
    const cur = ctx.getImageData(0, 0, w, h).data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = cur[(y * w + x) * 4 + 3];
        if (a > 24) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          lr += cur[(y * w + x) * 4];
          lg += cur[(y * w + x) * 4 + 1];
          lb += cur[(y * w + x) * 4 + 2];
          ln++;
        }
      }
    }
    if (maxX >= minX && maxY >= minY && ln > 0) {
      const pad = Math.round(Math.min(w, h) * 0.04);
      const cx = Math.max(0, minX - pad);
      const cy = Math.max(0, minY - pad);
      const cw = Math.min(w - cx, maxX - minX + 1 + pad * 2);
      const chh = Math.min(h - cy, maxY - minY + 1 + pad * 2);
      const crop = document.createElement("canvas");
      crop.width = cw;
      crop.height = chh;
      const cctx = crop.getContext("2d");
      if (cctx) {
        cctx.drawImage(canvas, cx, cy, cw, chh, 0, 0, cw, chh);
        cutout = crop.toDataURL("image/png");
      }
      const logoLum = lum(lr / ln, lg / ln, lb / ln);
      // Dark mark on the dark ad panel → give it a light bone chip to read on.
      if (logoLum < 0.5) cutoutChip = "#f4f1ea";
    }
  }

  return { original, cutout, cutoutChip, removed };
}
