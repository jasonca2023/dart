import { SiteNav } from "@/components/site/SiteNav";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Hero } from "@/components/site/Hero";
import { TrustRow } from "@/components/site/TrustRow";
import { PipelineSwitcher } from "@/components/site/PipelineSwitcher";
import { MoodDemo } from "@/components/site/MoodDemo";
import { FeatureShowcase } from "@/components/site/FeatureShowcase";
import { StoreImport } from "@/components/site/StoreImport";
import { Faq } from "@/components/site/Faq";
import { CtaSection } from "@/components/site/CtaSection";
import { HomeSwitch } from "@/components/app/HomeSwitch";
import { AppShell } from "@/components/app/AppShell";
import { Generate } from "@/components/app/Generate";

export default function Home() {
  // Signed-out: the marketing landing (generate CTAs → sign-in).
  const landing = (
    <>
      <SiteNav />
      <main>
        {/* One orchestrated entrance (the hero's own rise); sections below
            stand still — scroll-stagger on every section is motion noise. */}
        <Hero />
        <MoodDemo />
        <TrustRow />
        <PipelineSwitcher />
        <StoreImport />
        <FeatureShowcase />
        <Faq />
        <CtaSection />
      </main>
      <SiteFooter />
    </>
  );

  // Signed-in: the app — just the generator. The saved ads live on /ads.
  const app = (
    <AppShell>
      <Generate />
    </AppShell>
  );

  return <HomeSwitch landing={landing} app={app} />;
}
