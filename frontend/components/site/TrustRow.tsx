// Honest social proof: these are the platforms Dart reads from and hands off to
// (per the PRD), rendered uniformly — not invented customer logos.
const PLATFORMS = ["Shopify", "Amazon", "Etsy", "WooCommerce", "TikTok", "Meta"];

export function TrustRow() {
  return (
    <section className="mx-auto max-w-[var(--page-max)] px-5 pb-8 sm:px-8">
      <p className="mb-4 text-center text-[14px] text-driftwood">
        For the channels you already sell and advertise on
      </p>
      <div className="rounded-card bg-sand px-6 py-7">
        <ul className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 md:grid-cols-6">
          {PLATFORMS.map((name) => (
            <li
              key={name}
              className="text-center font-display text-[18px] font-light tracking-tight text-driftwood"
            >
              {name}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
