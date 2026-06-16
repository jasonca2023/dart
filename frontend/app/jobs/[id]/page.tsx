import { AppShell } from "@/components/app/AppShell";
import { JobReview } from "@/components/app/JobReview";

export const metadata = {
  title: "Ad — Dart",
};

export default async function JobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AppShell>
      <JobReview id={id} />
    </AppShell>
  );
}
