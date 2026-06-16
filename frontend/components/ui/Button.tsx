import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Spinner } from "../icons";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

const base =
  "relative inline-flex items-center justify-center gap-2 rounded-full font-medium " +
  "whitespace-nowrap select-none transition-[transform,background-color,color,box-shadow] " +
  "duration-[140ms] ease-out active:scale-[0.97] focus-visible:outline-2 " +
  "focus-visible:outline-offset-2 focus-visible:outline-ink disabled:pointer-events-none " +
  "disabled:opacity-45";

const variants: Record<Variant, string> = {
  primary:
    "bg-ink text-parchment border border-ink hover:bg-[#1a1a1a] " +
    "shadow-[var(--shadow-inset)]",
  secondary:
    "bg-white text-ink border border-ash hover:bg-sand shadow-[var(--shadow-ring)]",
  ghost: "bg-transparent text-ink hover:text-driftwood",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-9 px-4 text-[15px]",
  lg: "h-11 px-5 text-[15px]",
};

interface CommonProps {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
}

function classes(variant: Variant, size: Size, extra?: string) {
  return [base, variants[variant], sizes[size], extra].filter(Boolean).join(" ");
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: CommonProps & ComponentProps<"button">) {
  return (
    <button
      className={classes(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Spinner className="size-4" />}
      <span className={loading ? "opacity-80" : undefined}>{children}</span>
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  children,
  href,
  ...rest
}: CommonProps & ComponentProps<typeof Link>) {
  return (
    <Link href={href} className={classes(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}
