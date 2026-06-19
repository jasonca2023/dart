import { redirect } from "next/navigation";

// The app now lives at "/" (it adapts to auth). Keep this path working for old
// links by sending it home.
export default function DashboardPage() {
  redirect("/");
}
