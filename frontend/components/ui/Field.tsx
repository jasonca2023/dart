import type { ComponentProps, ReactNode } from "react";

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={htmlFor}
        className="text-[13px] font-medium text-ink"
      >
        {label}
      </label>
      {children}
      {hint && <p className="text-[12px] leading-relaxed text-fog">{hint}</p>}
    </div>
  );
}

// Flat, editorial input — 4px radius keeps it distinct from pills and cards.
// Only border-color actually changes state here (hover/focus) — bg/text stay
// constant. Tailwind's `transition-colors` bundled background-color/color in
// too, which don't need a local transition and only served to compound with
// the theme-token's own animation on a switch (measured settling ~475ms vs
// the page background's ~305ms). Scoping to just border-color lets bg/text
// track the theme fade cleanly instead.
export function Input({ className, ...rest }: ComponentProps<"input">) {
  return (
    <input
      className={
        "w-full rounded-input border border-ash bg-white px-4 py-3 text-[15px] " +
        "text-ink placeholder:text-fog outline-none transition-[border-color] duration-150 ease-out " +
        "hover:border-mist focus:border-ink focus-visible:outline-none " +
        (className ?? "")
      }
      {...rest}
    />
  );
}

export function Select({
  className,
  children,
  ...rest
}: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        className={
          "w-full appearance-none rounded-input border border-ash bg-white px-4 py-3 " +
          "pr-10 text-[15px] text-ink outline-none transition-[border-color] duration-150 ease-out " +
          "hover:border-mist focus:border-ink " +
          (className ?? "")
        }
        {...rest}
      >
        {children}
      </select>
      <svg
        viewBox="0 0 24 24"
        className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-driftwood"
        aria-hidden
      >
        <path
          d="m7 10 5 5 5-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
