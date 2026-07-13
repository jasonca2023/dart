"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { ButtonLink } from "../ui/Button";
import { ChevronDown } from "../icons";

// Auth-aware nav slot: "Log in" when signed out; when signed in, the email is
// a quiet menu — Account settings and Log out live behind it.
export function AccountMenu() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click and Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

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
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={
          "flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[13px] transition-colors duration-150 ease-out " +
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink " +
          (open ? "bg-sand text-ink" : "text-driftwood hover:text-ink")
        }
      >
        <span className="max-w-[160px] truncate" title={user.email ?? undefined}>
          {user.email}
        </span>
        <ChevronDown
          className={
            "shrink-0 text-[14px] transition-transform duration-150 ease-out " +
            (open ? "rotate-180" : "")
          }
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-44 rounded-[14px] border border-ash bg-white p-1 shadow-[var(--shadow-elevated)]"
        >
          <Link
            role="menuitem"
            href="/account"
            onClick={() => setOpen(false)}
            className="block rounded-[10px] px-3 py-2 text-[13px] text-ink transition-colors duration-150 ease-out hover:bg-sand"
          >
            Account settings
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              setOpen(false);
              await signOut();
              router.push("/");
              router.refresh();
            }}
            className="block w-full rounded-[10px] px-3 py-2 text-left text-[13px] text-ink transition-colors duration-150 ease-out hover:bg-sand"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
