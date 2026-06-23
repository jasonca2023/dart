import { Frame, Bolt, Clock } from "../icons";

const CARDS = [
  {
    icon: Frame,
    title: "Provider-agnostic by design",
    body: "Scraper, model and video engine each sit behind an interface. Swap Kling for another renderer, or Opus for Haiku, without touching the dashboard.",
  },
  {
    icon: Clock,
    title: "Every job is a tracked job",
    body: "Status, cost in cents, the script, the scraped product and the final artifact are all persisted — so nothing is a black box and nothing is lost.",
  },
  {
    icon: Bolt,
    title: "Built for volume",
    body: "Rendering runs async, so concurrent jobs don't block each other. Paste one URL or batch a catalogue — the queue keeps up.",
  },
];

export function FeatureCards() {
  return (
    <section className="mx-auto max-w-[var(--page-max)] px-5 py-20 sm:px-8">
      <div className="grid gap-4 md:grid-cols-3">
        {CARDS.map(({ icon: Icon, title, body }) => (
          <article
            key={title}
            className="flex flex-col rounded-card bg-sand p-7"
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-white text-ink shadow-[var(--shadow-inset-warm)]">
              <Icon className="text-[20px]" />
            </span>
            <h3 className="mt-5 text-[17px] font-medium text-ink">{title}</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-driftwood">
              {body}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
