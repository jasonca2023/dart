// Smart logo prep — runs in the browser on a <canvas>. Removes a *useless*
// backdrop (a uniform near-white or near-black border, the classic "exported on
// a white card" case) by colour-keying it out, while leaving a logo whose
// background is part of the design (colourful, non-uniform, or already
// transparent) untouched. The renderer knocks a transparent cutout out to a flat
// colour, so the mark stays legible on any scene.

export interface PreparedLogo {
  original: string; // downscaled data URL, as uploaded
  cutout: string; // background-removed + cropped (or === original if nothing removed)
  removed: boolean; // did we actually strip a backdrop?
  transparent: boolean; // is the result transparent (a real cutout) vs an opaque image?
}

const MAX = 800;

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
  if (file.size > 10_000_000) return null; // 10MB pre-downscale cap (decode bound)
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
    // Colour-key the backdrop *everywhere*, not just the edge-connected exterior,
    // so a letter's counter (the hole in A, O, R, e…), an island of backdrop the
    // edge flood can't reach, is cleared too. Ramp the alpha across a feathered
    // band at the colour boundary rather than a binary cut, so letter edges stay
    // anti-aliased — a hard cut looks choppy once the cutout is shown large (the
    // end-card). Safe here because `useless` established a uniform neutral backdrop.
    const inner2 = 28 * 28; // ≤ this far from the backdrop ⇒ fully cleared
    const outer2 = 160 * 160; // ≥ this far ⇒ untouched (the mark itself)
    const band = outer2 - inner2;
    let count = 0;
    for (let i = 0; i < N; i++) {
      const dr = px[i * 4] - mean[0];
      const dg = px[i * 4 + 1] - mean[1];
      const db = px[i * 4 + 2] - mean[2];
      const d2 = dr * dr + dg * dg + db * db;
      if (d2 <= inner2) {
        px[i * 4 + 3] = 0; // unambiguous backdrop
        count++;
      } else if (d2 < outer2) {
        // boundary pixel: ease the alpha from 0 (inner) to full (outer)
        px[i * 4 + 3] = Math.round(px[i * 4 + 3] * ((d2 - inner2) / band));
        if (d2 - inner2 < band * 0.5) count++;
      }
    }
    const frac = count / N;
    // Removed a sensible amount (not nothing, not basically-everything). The
    // ceiling is generous because keying the whole backdrop — a logo with lots of
    // white padding is legitimately mostly background — should still be accepted.
    if (frac > 0.04 && frac < 0.97) {
      ctx.putImageData(image, 0, 0);
      removed = true;
    }
  }

  // Crop the (transparent) logo to its content box + small padding.
  const transparentNow = hasAlpha || removed;
  let cutout = original;
  if (transparentNow) {
    let minX = w,
      minY = h,
      maxX = -1,
      maxY = -1;
    let ln = 0;
    const cur = ctx.getImageData(0, 0, w, h).data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (cur[(y * w + x) * 4 + 3] > 24) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
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
    }
  }

  return { original, cutout, removed, transparent: transparentNow };
}
