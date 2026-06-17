"use client";

import type { ReactNode } from "react";

export interface SegOption<T extends string | number> {
  value: T;
  label: ReactNode;
}

// Radio-as-pills group. Active option gets the white inset-shadow treatment,
// echoing the product-switcher tabs. No scroll-jump (Hallmark gate 65).
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: SegOption<T>[];
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex flex-wrap gap-1 rounded-badge bg-sand p-1"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={
              "rounded-[14px] px-3.5 py-1.5 text-[13px] font-medium transition-[background-color,color,box-shadow,transform] " +
              "duration-[180ms] ease-out active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink " +
              (active
                ? "bg-white text-ink shadow-[var(--shadow-inset)]"
                : "text-driftwood hover:text-ink")
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
