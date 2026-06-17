"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { ExportDestination } from "@/lib/types";
import { Button } from "../ui/Button";
import { Download, Refresh, ArrowUpRight, Check } from "../icons";

const DESTS: { value: ExportDestination; label: string }[] = [
  { value: "tiktok", label: "TikTok Ads Manager" },
  { value: "meta", label: "Meta Ads Manager" },
];

export function JobActions({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<null | "download" | "regen" | ExportDestination>(
    null,
  );
  const [done, setDone] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function download() {
    setBusy("download");
    try {
      const res = await api.exportJob(jobId, "download");
      window.open(res.handoff_url, "_blank", "noopener");
      flash("Download ready");
    } finally {
      setBusy(null);
    }
  }

  async function exportTo(dest: ExportDestination) {
    setBusy(dest);
    setOpen(false);
    try {
      const res = await api.exportJob(jobId, dest);
      window.open(res.handoff_url, "_blank", "noopener");
      flash(`Handoff opened`);
    } finally {
      setBusy(null);
    }
  }

  async function regenerate() {
    setBusy("regen");
    try {
      const job = await api.regenerate(jobId);
      router.push(`/jobs/${job.id}`);
    } finally {
      setBusy(null);
    }
  }

  function flash(msg: string) {
    setDone(msg);
    setTimeout(() => setDone(null), 2400);
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <Button onClick={download} loading={busy === "download"}>
        <Download className="text-[18px]" />
        Download 4K
      </Button>

      <div className="relative" ref={menuRef}>
        <Button variant="secondary" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}>
          Export to…
        </Button>
        {open && (
          <div
            role="menu"
            className="dart-pop absolute right-0 top-[calc(100%+8px)] z-30 w-60 rounded-tooltip border border-ash bg-white p-1.5 shadow-[var(--shadow-elevated)]"
          >
            {DESTS.map((d) => (
              <button
                key={d.value}
                role="menuitem"
                onClick={() => exportTo(d.value)}
                disabled={busy === d.value}
                className="flex w-full items-center justify-between gap-2 rounded-[10px] px-3 py-2.5 text-left text-[14px] text-ink transition-colors duration-150 ease-out hover:bg-sand disabled:opacity-50"
              >
                {d.label}
                <ArrowUpRight className="text-[16px] text-fog" />
              </button>
            ))}
            <p className="px-3 py-2 text-[12px] leading-snug text-fog">
              Opens a draft handoff — nothing publishes without your confirm.
            </p>
          </div>
        )}
      </div>

      <Button variant="ghost" onClick={regenerate} loading={busy === "regen"}>
        <Refresh className="text-[18px]" />
        Regenerate
      </Button>

      {done && (
        <span className="inline-flex items-center gap-1.5 text-[13px] text-driftwood">
          <Check className="text-[16px]" />
          {done}
        </span>
      )}
    </div>
  );
}
