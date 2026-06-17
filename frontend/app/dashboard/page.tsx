import { AppShell } from "@/components/app/AppShell";
import { LaunchForm } from "@/components/app/LaunchForm";
import { RecentJobs } from "@/components/app/RecentJobs";

export const metadata = {
  title: "Dashboard — Dart",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  const { url } = await searchParams;

  return (
    <AppShell>
      <div className="mb-10">
        <h1 className="t-heading">New ad</h1>
        <p className="mt-2 text-[16px] text-driftwood">
          One product link in, one cinematic 4K ad out.
        </p>
      </div>

      <LaunchForm initialUrl={url ?? ""} />

      <section className="mt-16">
        <div className="mb-5 flex items-baseline justify-between">
          <h2 className="text-[18px] font-medium text-ink">Recent ads</h2>
          <span className="text-[13px] text-fog">Newest first</span>
        </div>
        <RecentJobs />
      </section>
    </AppShell>
  );
}
