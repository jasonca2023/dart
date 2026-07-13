import { AppShell } from "@/components/app/AppShell";
import { AccountSettings } from "@/components/app/AccountSettings";

export const metadata = {
  title: "Account · Dart",
};

export default function AccountPage() {
  return (
    <AppShell>
      <AccountSettings />
    </AppShell>
  );
}
