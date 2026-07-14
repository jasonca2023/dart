import { Check } from "../icons";

// The catalogue feature, previously unsold on the landing page: paste a store
// link, get an ad per product. Copy left, mock import right.
const ROWS: { name: string; price: string }[] = [
  { name: "Atlas Bottle", price: "$48" },
  { name: "Trail Tumbler", price: "$36" },
  { name: "Canteen Mini", price: "$28" },
  { name: "Peak Flask", price: "$52" },
];

export function StoreImport() {
  return (
    <section className="mx-auto max-w-[var(--page-max)] px-5 py-20 sm:px-8">
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        {/* Copy */}
        <div>
          <p className="t-caption text-driftwood">Store import</p>
          <h2 className="t-heading-lg mt-3 max-w-[14ch]">
            One link. An ad for every product.
          </h2>
          <p className="mt-5 max-w-md text-[16px] leading-relaxed text-driftwood">
            Paste your store&rsquo;s link and Dart reads the public catalogue.
            No OAuth, no API key, nothing to install. Pick the products you
            want and it generates an ad for each one, batch after batch.
          </p>
          <ul className="mt-6 flex flex-col gap-3">
            {[
              "Works with any public Shopify catalogue, up to 100 products",
              "Each product gets its own copy, palette and motion",
              "Skip any product; the rest keep rendering",
            ].map((t) => (
              <li key={t} className="flex items-start gap-3 text-[15px] text-ink">
                <Check className="mt-0.5 shrink-0 text-[18px] text-driftwood" />
                {t}
              </li>
            ))}
          </ul>
        </div>

        {/* Mock import */}
        <div className="mx-auto w-full max-w-md rounded-card bg-white p-5 shadow-[var(--shadow-elevated)]">
          <div className="flex items-baseline justify-between gap-3 rounded-input border border-ash bg-parchment px-4 py-3">
            <span className="truncate font-mono text-[13px] text-driftwood">
              https://atlas-goods.com
            </span>
            <span className="shrink-0 text-[12px] font-medium text-ink">Import</span>
          </div>
          <ul className="mt-4 flex flex-col">
            {ROWS.map(({ name, price }) => (
              <li
                key={name}
                className="flex items-center justify-between border-t border-ash py-3 first:border-t-0"
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-6 items-center justify-center rounded-full bg-ink text-parchment">
                    <Check className="text-[13px]" />
                  </span>
                  <span className="text-[14px] text-ink">{name}</span>
                </div>
                <span className="font-mono text-[12px] text-fog">{price}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 border-t border-ash pt-3 text-center font-mono text-[12px] text-fog">
            + 96 more from the catalogue
          </p>
        </div>
      </div>
    </section>
  );
}
