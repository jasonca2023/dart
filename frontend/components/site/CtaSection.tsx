import { UrlLaunch } from "./UrlLaunch";

export function CtaSection() {
  return (
    <section className="mx-auto max-w-[var(--page-max)] px-5 py-20 sm:px-8">
      <div className="flex flex-col items-center rounded-card-lg bg-sand px-6 py-20 text-center sm:py-24">
        <h2 className="t-heading-lg max-w-[18ch] text-balance">
          Your next ad is one link away.
        </h2>
        <p className="mt-5 max-w-md text-[16px] leading-relaxed text-driftwood">
          Paste a product URL. Dart does the scrape, the script and the 4K
          render. You review and export.
        </p>
        <div className="mt-8 flex w-full justify-center">
          <UrlLaunch size="lg" />
        </div>
        <p className="mt-4 font-mono text-[12px] text-fog">
          No card to start · review every cut before it ships
        </p>
      </div>
    </section>
  );
}
