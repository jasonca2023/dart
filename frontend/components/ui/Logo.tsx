import Link from "next/link";

// Brand mark: an arrow drawn up-and-to-the-right (aim, launch, growth) — a solid
// broadhead at the tip, feather fletching at the nock. Pure `currentColor`, so it
// inherits the ink and reads on any surface.
function DartMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" className={className} aria-hidden>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* shaft */}
        <path d="M6 18 16.8 7.2" />
        {/* feather fletching at the nock — barbs swept toward the tip */}
        <path d="M6.1 20.3 6.6 17.4 3.7 17.9" strokeWidth={1.9} />
        <path d="M8.1 18.3 8.6 15.4 5.7 15.9" strokeWidth={1.9} />
        <path d="M10.1 16.3 10.6 13.4 7.7 13.9" strokeWidth={1.9} />
      </g>
      {/* solid broadhead */}
      <path d="M20.5 3.5 18.6 10.1 13.9 5.4Z" fill="currentColor" />
    </svg>
  );
}

export function Logo({
  href = "/",
  className = "text-ink",
}: {
  href?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-label="Dart home"
      className={
        "inline-flex items-center gap-2 transition-opacity duration-150 ease-out hover:opacity-70 " +
        className
      }
    >
      <DartMark className="text-[20px]" />
      <span
        className="font-wordmark text-[15px] font-bold leading-none"
        style={{ letterSpacing: "0.04em" }}
      >
        Dart
      </span>
    </Link>
  );
}
