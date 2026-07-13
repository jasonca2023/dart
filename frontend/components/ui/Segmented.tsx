"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export interface SegOption<T extends string | number> {
  value: T;
  label: ReactNode;
}

// Radio-as-pills group. One white pill slides to the active option (same
// treatment as the landing pipeline tabs). No scroll-jump (Hallmark gate 65).
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
  const active = options.findIndex((opt) => opt.value === value);

  // Measured off the real buttons so the pill survives wrapping and resizes.
  const listRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [pill, setPill] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  useEffect(() => {
    const measure = () => {
      const el = btnRefs.current[active];
      if (!el) return;
      setPill({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
    };
    measure();
    // A late webfont swap can change button widths without resizing the
    // group's own box, which the ResizeObserver wouldn't see.
    document.fonts.ready.then(measure);
    const ro = new ResizeObserver(measure);
    if (listRef.current) ro.observe(listRef.current);
    return () => ro.disconnect();
  }, [active, options.length]);

  return (
    <div
      ref={listRef}
      role="radiogroup"
      aria-label={ariaLabel}
      className="relative inline-flex flex-wrap gap-1 rounded-badge bg-sand p-1"
    >
      {pill && (
        <span
          aria-hidden
          className="absolute left-0 top-0 rounded-[14px] bg-white shadow-[var(--shadow-inset)] transition-[transform,width,height] duration-[260ms] ease-out motion-reduce:transition-none"
          style={{
            transform: `translate(${pill.x}px, ${pill.y}px)`,
            width: pill.w,
            height: pill.h,
          }}
        />
      )}
      {options.map((opt, i) => {
        const on = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            ref={(el) => {
              btnRefs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(opt.value)}
            className={
              "relative z-[1] rounded-[14px] px-3.5 py-1.5 text-[13px] font-medium transition-[color,transform] " +
              "duration-[180ms] ease-out active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink " +
              (on ? "text-ink" : "text-driftwood hover:text-ink")
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
