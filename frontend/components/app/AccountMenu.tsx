"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Button, ButtonLink } from "../ui/Button";

// Auth-aware nav slot: "Log in" when signed out, email + "Log out" when signed in.
export function AccountMenu() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();

  if (loading) {
    return <span className="block h-8 w-16 animate-pulse rounded-full bg-sand" />;
  }

  if (!user) {
    return (
      <ButtonLink href="/auth" variant="ghost" size="sm">
        Log in
      </ButtonLink>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span
        className="hidden max-w-[160px] truncate text-[13px] text-driftwood sm:inline"
        title={user.email ?? undefined}
      >
        {user.email}
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={async () => {
          await signOut();
          router.push("/");
          router.refresh();
        }}
      >
        Log out
      </Button>
    </div>
  );
}
