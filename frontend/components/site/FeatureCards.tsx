import { Frame, Bolt, Clock } from "../icons";

const CARDS = [
  {
    icon: Frame,
    title: "AI image-to-video",
    body: "Upload a single product photo and Dart animates it into a short, cinematic ad — the product becomes the hero, in motion, with sound.",
  },
  {
    icon: Clock,
    title: "Saved to your library",
    body: "Every ad — the finished video, the product and the settings — is kept in your account, so nothing is lost and you can come back to it anytime.",
  },
  {
    icon: Bolt,
    title: "Ready for any channel",
    body: "Generate on demand in 16:9 or 9:16, then post straight to your feed, story or reel — no editing suite required.",
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
