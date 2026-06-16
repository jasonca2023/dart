import type { Script } from "@/lib/types";

export function ScriptView({ script }: { script: Script }) {
  return (
    <section className="rounded-card bg-sand p-6 sm:p-8">
      <p className="t-caption text-fog">The script</p>
      <h3 className="mt-2 font-display text-[22px] font-light tracking-tight text-ink">
        Director&rsquo;s prompt
      </h3>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-driftwood">
        {script.video_prompt}
      </p>

      <div className="mt-8">
        <p className="t-caption mb-4 text-fog">Scene plan</p>
        <ol className="flex flex-col">
          {script.scenes.map((scene, i) => (
            <li
              key={i}
              className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t border-ash py-4 first:border-t-0 sm:grid-cols-[80px_140px_1fr]"
            >
              <span className="font-mono text-[13px] text-ink">
                {scene.t_start}–{scene.t_end}s
              </span>
              <span className="rounded-full border border-ash bg-white px-2.5 py-0.5 text-center text-[12px] text-driftwood sm:justify-self-start">
                {scene.camera}
              </span>
              <p className="col-span-2 text-[14px] leading-relaxed text-ink sm:col-span-1">
                {scene.description}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
