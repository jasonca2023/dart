import { AppShell } from "@/components/app/AppShell";
import { RecentJobs } from "@/components/app/RecentJobs";

export const metadata = {
  title: "Ads · Dart",
};

export default function AdsPage() {
  return (
    <AppShell>
      {/* Page title shares the dashboard's display-heading voice so the app
          reads as one system, not a primary page + a plainer index. */}
      <div className="mb-8">
        <h1 className="t-heading">Your ads</h1>
        <p className="mt-2 max-w-xl text-[16px] text-driftwood">
          Every ad you&rsquo;ve saved, newest first. Open one to preview, edit, or
          download it.
        </p>
      </div>
      <RecentJobs />
    </AppShell>
  );
}
