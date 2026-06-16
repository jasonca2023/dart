import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Svg({ children, ...p }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden {...p}>
      {children}
    </svg>
  );
}

export function ArrowRight(p: IconProps) {
  return (
    <Svg {...p}>
      <g {...stroke}>
        <path d="M5 12h14" />
        <path d="m13 6 6 6-6 6" />
      </g>
    </Svg>
  );
}

export function ArrowUpRight(p: IconProps) {
  return (
    <Svg {...p}>
      <g {...stroke}>
        <path d="M7 17 17 7" />
        <path d="M8 7h9v9" />
      </g>
    </Svg>
  );
}

export function Check(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m5 12.5 4.5 4.5L19 6.5" {...stroke} />
    </Svg>
  );
}

export function Link(p: IconProps) {
  return (
    <Svg {...p}>
      <g {...stroke}>
        <path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" />
        <path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" />
      </g>
    </Svg>
  );
}

export function Play(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8 5.5v13l11-6.5z" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" fill="currentColor" />
    </Svg>
  );
}

export function Download(p: IconProps) {
  return (
    <Svg {...p}>
      <g {...stroke}>
        <path d="M12 4v11" />
        <path d="m7.5 11 4.5 4.5 4.5-4.5" />
        <path d="M5 19h14" />
      </g>
    </Svg>
  );
}

export function Refresh(p: IconProps) {
  return (
    <Svg {...p}>
      <g {...stroke}>
        <path d="M4.5 12a7.5 7.5 0 0 1 12.8-5.3L20 9" />
        <path d="M20 4.5V9h-4.5" />
        <path d="M19.5 12a7.5 7.5 0 0 1-12.8 5.3L4 15" />
        <path d="M4 19.5V15h4.5" />
      </g>
    </Svg>
  );
}

export function Film(p: IconProps) {
  return (
    <Svg {...p}>
      <g {...stroke}>
        <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
        <path d="M3.5 9h17M3.5 15h17M8.5 4.5v15M15.5 4.5v15" />
      </g>
    </Svg>
  );
}

export function Wand(p: IconProps) {
  return (
    <Svg {...p}>
      <g {...stroke}>
        <path d="m5 19 9-9" />
        <path d="m13 5 1.2 2.3L16.5 8.5 14.2 9.7 13 12l-1.2-2.3L9.5 8.5l2.3-1.2z" />
        <path d="M18 13.5v2M17 14.5h2" />
      </g>
    </Svg>
  );
}

export function Search(p: IconProps) {
  return (
    <Svg {...p}>
      <g {...stroke}>
        <circle cx="11" cy="11" r="6" />
        <path d="m20 20-3.5-3.5" />
      </g>
    </Svg>
  );
}

export function Clock(p: IconProps) {
  return (
    <Svg {...p}>
      <g {...stroke}>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v4.5l3 2" />
      </g>
    </Svg>
  );
}

export function Bolt(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M13 3 5 13h5l-1 8 8-10h-5z" {...stroke} />
    </Svg>
  );
}

export function Frame(p: IconProps) {
  return (
    <Svg {...p}>
      <g {...stroke}>
        <rect x="4" y="4" width="16" height="16" rx="2.5" />
        <path d="M4 9h16M9 4v16" />
      </g>
    </Svg>
  );
}

export function X(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6 6l12 12M18 6 6 18" {...stroke} />
    </Svg>
  );
}

export function Alert(p: IconProps) {
  return (
    <Svg {...p}>
      <g {...stroke}>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v4.5" />
        <path d="M12 15.6h.01" />
      </g>
    </Svg>
  );
}

export function Bar(p: IconProps) {
  // The wordmark glyph: stacked parallel bars (||)
  return (
    <Svg {...p}>
      <g stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
        <path d="M9 4.5v15M15 4.5v15" />
      </g>
    </Svg>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`dart-spin ${className ?? ""}`} aria-hidden>
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.25" />
      <path
        d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
