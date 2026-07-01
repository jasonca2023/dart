"use client";

// Prev/next pager shown on an ad page so a batch of generated ads can be flipped
// through in place (newest → oldest across the user's library), instead of only
// landing on one and hunting for the rest on the dashboard. Renders nothing when
// there's only a single ad or the current one isn't in the library.

import Link from "next/link";
import { useEffect, useState } from "react";
import { listAds } from "@/lib/ads";
import { ArrowRight } from "../icons";

function PagerButton({ href, dir }: { href: string | null; dir: "prev" | "next" }) {
  const cls =
    "grid size-8 place-items-center rounded-full border border-ash bg-white text-ink " +
    "transition-colors duration-150 ease-out hover:border-driftwood";
  const icon = <ArrowRight className={"text-[16px] " + (dir === "prev" ? "rotate-180" : "")} />;
  if (!href) {
    return (
      <span className={cls + " pointer-events-none opacity-35"} aria-hidden>
        {icon}
      </span>
    );
  }
  return (
    <Link href={href} className={cls} aria-label={dir === "prev" ? "Newer ad" : "Older ad"}>
      {icon}
    </Link>
  );
}

export function AdPager({ currentId }: { currentId: string }) {
  const [ids, setIds] = useState<string[] | null>(null);
  useEffect(() => {
    let active = true;
    listAds().then((ads) => active && setIds(ads.map((a) => a.id)));
    return () => {
      active = false;
    };
  }, []);

  if (!ids) return null;
  const i = ids.indexOf(currentId);
  if (i === -1 || ids.length < 2) return null;
  const newer = i > 0 ? ids[i - 1] : null; // library is newest-first
  const older = i < ids.length - 1 ? ids[i + 1] : null;

  return (
    <div className="flex items-center gap-2">
      <PagerButton href={newer ? `/jobs/${newer}` : null} dir="prev" />
      <span className="font-mono text-[12px] tabular-nums text-driftwood">
        {i + 1} / {ids.length}
      </span>
      <PagerButton href={older ? `/jobs/${older}` : null} dir="next" />
    </div>
  );
}
