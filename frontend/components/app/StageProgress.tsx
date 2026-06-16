import type { JobStatus } from "@/lib/types";
import { STAGES } from "@/lib/types";
import { pipelineProgress } from "@/lib/format";
import { Check } from "../icons";
import { Orb } from "../ui/Orb";

const ORDER: JobStatus[] = ["scraping", "scripting", "rendering", "ready"];

function stageState(
  stageKey: JobStatus,
  status: JobStatus,
): "done" | "active" | "pending" {
  if (status === "queued") return "pending";
  const cur = ORDER.indexOf(status === "failed" ? "scraping" : status);
  const idx = ORDER.indexOf(stageKey);
  if (status === "ready") return "done";
  if (idx < cur) return "done";
  if (idx === cur) return "active";
  return "pending";
}

// In-flight centerpiece. Stages fill in as the job advances; the active one
// pulses. Decorative orb signals the render coming to life.
export function StageProgress({ status }: { status: JobStatus }) {
  const activeStage = STAGES.find((s) => stageState(s.key, status) === "active");
  const headline =
    status === "queued"
      ? "Queued — starting up"
      : activeStage?.verb ?? "Working";

  return (
    <div className="rounded-card bg-white p-8 shadow-[var(--shadow-elevated)]">
      <div className="flex items-center justify-center rounded-[14px] bg-sand py-10">
        <Orb tone="cinematic" className="size-28" />
      </div>

      <div className="mt-8">
        <p className="t-caption text-fog">Generating</p>
        <h2 className="mt-2 font-display text-[24px] font-light tracking-tight text-ink">
          {headline}…
        </h2>

        {/* Overall progress */}
        <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-ash">
          <div
            className="h-full rounded-full bg-ink transition-[width] duration-500 ease-out"
            style={{ width: `${Math.round(pipelineProgress(status) * 100)}%` }}
          />
        </div>

        {/* Stage list */}
        <ol className="mt-7 flex flex-col gap-1">
          {STAGES.map((s) => {
            const state = stageState(s.key, status);
            return (
              <li
                key={s.key}
                className="flex items-center gap-3.5 rounded-xl px-2 py-2.5"
                data-state={state}
              >
                <span
                  className={
                    "relative flex size-7 shrink-0 items-center justify-center rounded-full border text-[13px] " +
                    (state === "done"
                      ? "border-ink bg-ink text-parchment"
                      : state === "active"
                        ? "border-ink text-ink"
                        : "border-ash text-fog")
                  }
                >
                  {state === "active" && (
                    <span className="absolute inline-flex size-full animate-ping rounded-full border border-ink opacity-40" />
                  )}
                  {state === "done" ? (
                    <Check className="text-[15px]" />
                  ) : (
                    <span className="font-mono text-[11px]">
                      {String(ORDER.indexOf(s.key) + 1)}
                    </span>
                  )}
                </span>
                <div className="flex-1">
                  <p
                    className={
                      "text-[15px] " +
                      (state === "pending"
                        ? "text-fog"
                        : "font-medium text-ink")
                    }
                  >
                    {s.label}
                  </p>
                  {state === "active" && (
                    <p className="text-[13px] text-driftwood">{s.verb}…</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
