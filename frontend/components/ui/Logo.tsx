import Link from "next/link";

// Brand mark: a feathered dart striking a bullseye — precision + aim ("Dart"),
// the ring echoing the brand's signature orb. Strokes inherit the text color
// (ink); the centre carries a single ember spark — the one place "ad energy"
// shows in the chrome, tying the mark to the orb's violet↔ember system.
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
        <circle cx="15" cy="9" r="6" />
        <path d="M3.5 20.5 15 9" strokeWidth={2.2} />
        {/* fletching — two feathers at the tail */}
        <path d="M3.2 17.4 6.6 20.8" />
        <path d="M5.4 15.2 8.8 18.6" />
      </g>
      {/* the spark in the bullseye */}
      <circle cx="15" cy="9" r="2.3" fill="var(--color-ember)" />
    </svg>
  );
}

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      aria-label="Dart — home"
      className="inline-flex items-center gap-2 text-ink transition-opacity duration-150 ease-out hover:opacity-70"
    >
      <DartMark className="text-[19px]" />
      <span
        className="font-wordmark text-[15px] font-bold leading-none"
        style={{ letterSpacing: "0.04em" }}
      >
        Dart
      </span>
    </Link>
  );
}
