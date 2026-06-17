import type { AspectRatio } from "@/lib/types";

const RATIO: Record<AspectRatio, string> = {
  "16:9": "16 / 9",
  "9:16": "9 / 16",
  "1:1": "1 / 1",
};

// Native <video> — real chrome, no hand-built player frame (Hallmark gate 57).
export function VideoPlayer({
  src,
  aspect,
}: {
  src: string;
  aspect: AspectRatio;
}) {
  const portrait = aspect === "9:16";
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
            width: portrait ? "auto" : "100%",
            maxHeight: portrait ? "70vh" : undefined,
          }}
        />
      </div>
    </div>
  );
}
