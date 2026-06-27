import type { AspectRatio } from "@/lib/types";

const RATIO: Record<AspectRatio, string> = {
  "16:9": "16 / 9",
  "1:1": "1 / 1",
  "4:5": "4 / 5",
  "9:16": "9 / 16",
};

// Native <video> — real chrome, no hand-built player frame (Hallmark gate 57).
export function VideoPlayer({
  src,
  aspect,
}: {
  src: string;
  aspect: AspectRatio;
}) {
  // Tall formats (9:16, 4:5) are height-bounded so they don't dominate the page.
  const tall = aspect === "9:16" || aspect === "4:5";
  return (
    <div className="rounded-card bg-white p-3 shadow-[var(--shadow-elevated)]">
      <div className="flex justify-center">
        <video
          src={src}
          controls
          playsInline
          preload="metadata"
          className="rounded-[14px] bg-ink"
          style={{
            aspectRatio: RATIO[aspect],
            width: tall ? "auto" : "100%",
            maxHeight: tall ? "70vh" : undefined,
          }}
        />
      </div>
    </div>
  );
}
