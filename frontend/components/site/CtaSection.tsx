import Link from "next/link";
import { ArrowRight } from "../icons";

// The page's one deliberately dark moment. Everything above is parchment/sand;
// closing on an ink panel that echoes the hero orb's chromatic bloom bookends
// the page (open on the orb, close on its shadow) and makes the primary
// conversion point the strongest thing on screen, instead of a generic
// centred sand card.
export function CtaSection() {
  return (
    <section className="mx-auto max-w-[var(--page-max)] px-5 pb-24 pt-4 sm:px-8 sm:pb-28">
      <div className="relative isolate overflow-hidden rounded-card-lg bg-ink px-6 py-24 text-center sm:py-28">
        <div className="hero-glow" aria-hidden />
        <div className="relative z-[1] flex flex-col items-center">
          <p className="t-caption text-fog">Start free</p>
          <h2 className="mt-4 max-w-[18ch] text-balance font-display text-[2.25rem] font-light leading-[1.05] tracking-[-0.02em] text-parchment sm:text-[3rem]">
            Your next ad is one upload away.
          </h2>
          <p className="mt-5 max-w-md text-[16px] leading-relaxed text-mist">
            Upload a product image. Dart composes a short, polished animated ad
            around it, saved straight to your library, ready to post.
          </p>
          <Link
            href="/auth?mode=signup"
            className="mt-9 inline-flex h-12 items-center gap-2 rounded-full bg-parchment px-6 text-[15px] font-medium text-ink shadow-[var(--shadow-inset)] transition-[transform,background-color] duration-[140ms] ease-out hover:bg-white active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-parchment"
          >
            Get started free
            <ArrowRight className="text-[18px]" />
          </Link>
          <p className="mt-5 font-mono text-[12px] text-fog">
            No card to start · review every cut before it ships
          </p>
        </div>
      </div>
    </section>
  );
}
