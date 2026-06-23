import type { Product } from "@/lib/types";
import { money } from "@/lib/format";

export function ProductCard({ product }: { product: Product }) {
  const specs = Object.entries(product.specs);
  return (
    <div className="overflow-hidden rounded-card bg-sand">
      {product.images[0] && (
        <div className="aspect-square bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={product.images[0]}
            alt={product.title}
            loading="lazy"
            className="size-full object-cover"
          />
        </div>
      )}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="t-caption text-fog">Product</p>
            <h3 className="mt-1.5 text-[17px] font-medium text-ink">
              {product.title}
            </h3>
          </div>
          <span className="shrink-0 rounded-full border border-ash bg-white px-2.5 py-1 font-mono text-[11px] text-driftwood">
            {product.source}
          </span>
        </div>
        <p className="mt-2 font-display text-[22px] font-light text-ink">
          {money(product.price, product.currency)}
        </p>

        {specs.length > 0 && (
          <dl className="mt-4 flex flex-col gap-2 border-t border-ash pt-4">
            {specs.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 text-[13px]">
                <dt className="capitalize text-driftwood">{k}</dt>
                <dd className="text-right text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}
