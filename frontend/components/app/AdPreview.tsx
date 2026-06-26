"use client";

import type { ComponentType } from "react";
import { Player } from "@remotion/player";
import { ProductAd, type ProductAdProps } from "@/lib/remotion/ProductAd";
import { dimsFor } from "@/lib/render";

const FPS = 30;

// Live, scrubbable preview of the *actual* ad composition (the same ProductAd +
// AdSpec the export uses), so the user sees the result before committing to a
// full render + upload. Loaded only in the browser (dynamic, ssr:false) so
// Remotion stays out of the server bundle. Lives in its own file so the heavy
// Remotion code splits out and only loads once a product image is chosen.
export default function AdPreview(props: ProductAdProps) {
  const { width, height } = dimsFor(props.aspectRatio);
  const durationInFrames = Math.max(1, Math.round(props.durationInSeconds * FPS));
  const portrait = props.aspectRatio === "9:16";

  return (
    <Player
      component={ProductAd as unknown as ComponentType<Record<string, unknown>>}
      inputProps={props as unknown as Record<string, unknown>}
      durationInFrames={durationInFrames}
      compositionWidth={width}
      compositionHeight={height}
      fps={FPS}
      loop
      autoPlay
      controls
      acknowledgeRemotionLicense
      style={portrait ? { height: 360 } : { width: "100%" }}
    />
  );
}
