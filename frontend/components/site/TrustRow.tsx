// Honest social proof: these are the platforms Dart reads from and hands off to
// (per the PRD) — not invented customer logos. A hairline strip, not another
// card, so the section rhythm varies: card (demo) → rule (this) → card (pipeline).
const PLATFORMS = ["Shopify", "Amazon", "Etsy", "WooCommerce", "TikTok", "Meta"];

export function TrustRow() {
  return (
    <section className="mx-auto max-w-[var(--page-max)] px-5 pb-6 sm:px-8">
      <div className="flex flex-col gap-4 border-y border-ash py-6 sm:flex-row sm:items-baseline sm:justify-between">
        <p className="t-caption shrink-0 text-driftwood">
          For the channels you sell on
        </p>
        <ul className="flex flex-wrap gap-x-7 gap-y-2 sm:justify-end">
          {PLATFORMS.map((name) => (
            <li
              key={name}
              className="font-display text-[17px] font-light tracking-tight text-driftwood"
            >
              {name}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
