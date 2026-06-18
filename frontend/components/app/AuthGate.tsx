"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { supabaseEnabled } from "@/lib/supabase";

// Gates the signed-in app. When real auth is configured (Supabase), logged-out
// visitors are sent to /auth instead of reaching the dashboard and erroring on a
// dead "Generate". In local mock dev (no Supabase) there's no gate.
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (supabaseEnabled && !loading && !user) router.replace("/auth");
  }, [loading, user, router]);

  if (supabaseEnabled && (loading || !user)) {
    return (
      <div className="grid min-h-screen place-items-center bg-parchment">
        <span
          aria-label="Loading"
          className="size-6 animate-spin rounded-full border-2 border-ash border-t-ink"
        />
      </div>
    );
  }

  return <>{children}</>;
}
