import type { JobStatus } from "@/lib/types";
import { STATUS_LABEL, isTerminal } from "@/lib/format";

// Monochrome status — no semantic color. State is shown by a dot that pulses
// while work is live and holds steady when terminal (Hallmark: no green/red UI).
export function StatusPill({ status }: { status: JobStatus }) {
  const live = !isTerminal(status);
  const failed = status === "failed";
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-ash bg-white px-2.5 py-1 text-[12px] font-medium text-ink">
      <span className="relative flex size-2">
        {live && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-ink opacity-50" />
        )}
        <span
          className={
            "relative inline-flex size-2 rounded-full " +
            (failed ? "border border-ink bg-transparent" : "bg-ink")
          }
        />
      </span>
      {STATUS_LABEL[status]}
    </span>
  );
}
