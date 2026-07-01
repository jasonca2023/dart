import { AppShell } from "@/components/app/AppShell";
import { RecentJobs } from "@/components/app/RecentJobs";

export const metadata = {
  title: "Ads · Dart",
};

export default function AdsPage() {
  return (
    <AppShell>
      <div className="mb-5 flex items-baseline justify-between">
        <h1 className="text-[18px] font-medium text-ink">Your ads</h1>
        <span className="text-[13px] text-fog">Newest first</span>
      </div>
      <RecentJobs />
    </AppShell>
  );
}
