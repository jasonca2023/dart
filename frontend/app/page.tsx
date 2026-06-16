import { SiteNav } from "@/components/site/SiteNav";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Hero } from "@/components/site/Hero";
import { TrustRow } from "@/components/site/TrustRow";
import { PipelineSwitcher } from "@/components/site/PipelineSwitcher";
import { MoodCarousel } from "@/components/site/MoodCarousel";
import { FeatureShowcase } from "@/components/site/FeatureShowcase";
import { FeatureCards } from "@/components/site/FeatureCards";
import { CtaSection } from "@/components/site/CtaSection";
import { Reveal } from "@/components/Reveal";

export default function Home() {
  return (
    <>
      <SiteNav />
      <main>
        <Hero />
        <Reveal>
          <TrustRow />
        </Reveal>
        <Reveal>
          <PipelineSwitcher />
        </Reveal>
        <Reveal>
          <MoodCarousel />
        </Reveal>
        <Reveal>
          <FeatureShowcase />
        </Reveal>
        <Reveal>
          <FeatureCards />
        </Reveal>
        <Reveal>
          <CtaSection />
        </Reveal>
      </main>
      <SiteFooter />
    </>
  );
}
