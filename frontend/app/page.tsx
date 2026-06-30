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
import { HomeSwitch } from "@/components/app/HomeSwitch";
import { AppShell } from "@/components/app/AppShell";
import { Generate } from "@/components/app/Generate";
import { RecentJobs } from "@/components/app/RecentJobs";

export default function Home() {
  // Signed-out: the marketing landing (generate CTAs → sign-in).
  const landing = (
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

  // Signed-in: the app — generate, plus the user's saved ads.
  const app = (
    <AppShell>
      <Generate />

      <section className="mt-16">
        <div className="mb-5 flex items-baseline justify-between">
          <h2 className="text-[18px] font-medium text-ink">Your ads</h2>
          <span className="text-[13px] text-fog">Newest first</span>
        </div>
        <RecentJobs />
      </section>
    </AppShell>
  );

  return <HomeSwitch landing={landing} app={app} />;
}
