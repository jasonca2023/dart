import Link from "next/link";
import { ArrowRight } from "../icons";

// The closing panel: one elevated night surface holding the orb's chromatic
// bloom, so the page ends where it began — on the light the factory throws.
// The conversion point is the brightest thing on screen.
export function CtaSection() {
  return (
    <section className="mx-auto max-w-[var(--page-max)] px-5 pb-24 pt-4 sm:px-8 sm:pb-28">
      <div className="relative isolate overflow-hidden rounded-card-lg bg-night-2 px-6 py-24 text-center sm:py-28">
        <div className="hero-glow" aria-hidden />
        <div className="relative z-[1] flex flex-col items-center">
          <h2 className="max-w-[18ch] text-balance font-display text-[2.25rem] font-light leading-[1.05] tracking-[-0.02em] text-linen sm:text-[3rem]">
            Your next ad is one upload away.
          </h2>
          <p className="mt-5 max-w-md text-[16px] leading-relaxed text-moth">
            Upload a product image. Dart composes a short, polished animated ad
            around it, saved straight to your library, ready to post.
          </p>
          <Link
            href="/auth?mode=signup"
            className="mt-9 inline-flex h-12 items-center gap-2 rounded-full bg-linen px-6 text-[15px] font-medium text-night transition-[transform,background-color] duration-[140ms] ease-out hover:bg-linen-2 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-linen"
          >
            Get started free
            <ArrowRight className="text-[18px]" />
          </Link>
          <p className="mt-5 font-mono text-[12px] text-dusk">
            No card to start · review every cut before it ships
          </p>
        </div>
      </div>
    </section>
  );
}
