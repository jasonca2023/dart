"use client";

import { useEffect } from "react";
import { initMonitoring } from "@/lib/monitoring";

// Mounts once in the root layout to start error monitoring in the browser.
// Renders nothing. Inert unless NEXT_PUBLIC_SENTRY_DSN is set (see
// lib/monitoring.ts), so it's safe to keep mounted everywhere.
export function Monitoring() {
  useEffect(() => {
    void initMonitoring();
  }, []);
  return null;
}
