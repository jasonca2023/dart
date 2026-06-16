import Link from "next/link";
import { Bar } from "../icons";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      aria-label="Dart — home"
      className="inline-flex items-center gap-1.5 text-ink transition-opacity duration-150 ease-out hover:opacity-70"
    >
      <Bar className="text-[18px]" />
      <span
        className="font-wordmark text-[14px] font-bold leading-none"
        style={{ letterSpacing: "0.05em" }}
      >
        Dart
      </span>
    </Link>
  );
}
