"use client";

import { useAuth } from "@/lib/auth";
import { supabaseEnabled } from "@/lib/supabase";

// The home page adapts to auth: signed-in users get the app (generate + their
// ads); everyone else gets the marketing landing. Defaults to the landing while
// auth resolves and in local mock dev (no Supabase).
export function HomeSwitch({
  landing,
  app,
}: {
  landing: React.ReactNode;
  app: React.ReactNode;
}) {
  const { user } = useAuth();
  if (supabaseEnabled && user) return <>{app}</>;
  return <>{landing}</>;
}
