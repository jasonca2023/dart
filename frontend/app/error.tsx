"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/icons";
import { reportError } from "@/lib/monitoring";

// Route-level error boundary: an unhandled client exception anywhere in the
// tree lands here instead of on Next's unstyled default error screen.
export default function RouteError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  // Report to monitoring (no-op unless a DSN is configured).
  useEffect(() => {
    reportError(error);
  }, [error]);

  return (
    <div className="grid min-h-screen place-items-center bg-parchment px-5">
      <div className="mx-auto max-w-md rounded-card bg-sand px-6 py-14 text-center">
        <Alert className="mx-auto text-[28px] text-driftwood" />
        <h1 className="mt-4 text-[18px] font-medium text-ink">
          Something went wrong
        </h1>
        <p className="mt-2 text-[14px] text-driftwood">
          An unexpected error interrupted this page. Your saved ads are safe.
        </p>
        <div className="mt-6 flex justify-center">
          <Button variant="secondary" onClick={reset}>
            Try again
          </Button>
        </div>
      </div>
    </div>
  );
}
