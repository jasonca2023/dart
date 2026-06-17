import type { ComponentProps, ReactNode } from "react";

type Surface = "sand" | "white";

interface CardProps extends ComponentProps<"div"> {
  surface?: Surface;
  large?: boolean;
  children: ReactNode;
}

// Warm Sand card (surface contrast does the elevation work) or White elevated
// card (hairline ring shadow) for screenshots / floating previews.
export function Card({
  surface = "sand",
  large = false,
  className,
  children,
  ...rest
}: CardProps) {
  const surfaceClass =
    surface === "white"
      ? "bg-white shadow-[var(--shadow-elevated)]"
      : "bg-sand";
  const radius = large ? "rounded-card-lg" : "rounded-card";
  return (
    <div
      className={`${surfaceClass} ${radius} ${className ?? ""}`}
      {...rest}
    >
      {children}
    </div>
  );
}
