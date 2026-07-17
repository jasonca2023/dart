import { AppShell } from "@/components/app/AppShell";
import { JobReview } from "@/components/app/JobReview";

export const metadata = {
  title: "Ad · Dart",
};

export default async function JobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AppShell>
      {/* Keyed on the id: pager/regenerate navigation between /jobs/[id]
          pages re-renders this component in place (same position, only the
          route param changes), and JobReview holds a pile of per-ad state
          (saved row, render refs, client-video blob) that must not leak from
          one ad onto the next. The key forces a clean remount per ad. */}
      <JobReview key={id} id={id} />
    </AppShell>
  );
}
