"use client";

import { useEffect, useRef, type ComponentType } from "react";
import { Player, type PlayerRef } from "@remotion/player";
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
  // Tall formats (9:16, 4:5) are height-constrained; wide/square fill the width.
  const tall = props.aspectRatio === "9:16" || props.aspectRatio === "4:5";

  // The composition has no audio, but the Player defers to the browser's
  // autoplay policy anyway — before the user's first interaction, un-muted
  // autoplay is blocked and the preview sits paused at 0:00. Declaring it
  // muted (which it effectively is) lets autoplay through everywhere, and the
  // effect re-kicks playback in case the mount-time attempt was still refused.
  const playerRef = useRef<PlayerRef>(null);
  useEffect(() => {
    const player = playerRef.current;
    if (player && !player.isPlaying()) player.play();
  }, []);

  return (
    <Player
      ref={playerRef}
      component={ProductAd as unknown as ComponentType<Record<string, unknown>>}
      inputProps={props as unknown as Record<string, unknown>}
      durationInFrames={durationInFrames}
      compositionWidth={width}
      compositionHeight={height}
      fps={FPS}
      loop
      autoPlay
      initiallyMuted
      showVolumeControls={false}
      controls
      acknowledgeRemotionLicense
      style={tall ? { height: 380 } : { width: "100%" }}
    />
  );
}
