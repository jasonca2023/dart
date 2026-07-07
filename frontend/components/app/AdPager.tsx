"use client";

// Prev/next pager shown on an ad page so the ads generated together in one run can
// be flipped through in place, instead of only landing on the first and hunting for
// the rest. Scoped to that batch (remembered in session storage) — renders nothing
// when the current ad wasn't part of a multi-ad batch.

import Link from "next/link";
import { useEffect, useState } from "react";
import { getBatch, getBatchLabel } from "@/lib/batch";
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
    <Link href={href} className={cls} aria-label={dir === "prev" ? "Previous ad" : "Next ad"}>
      {icon}
    </Link>
  );
}

export function AdPager({ currentId }: { currentId: string }) {
  const [ids, setIds] = useState<string[] | null>(null);
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    setIds(getBatch());
    setLabel(getBatchLabel(currentId));
  }, [currentId]);

  if (!ids) return null;
  const i = ids.indexOf(currentId);
  if (i === -1 || ids.length < 2) return null;
  const prev = i > 0 ? ids[i - 1] : null; // batch is in generation order
  const next = i < ids.length - 1 ? ids[i + 1] : null;

  return (
    <div className="flex items-center gap-2">
      <PagerButton href={prev ? `/jobs/${prev}` : null} dir="prev" />
      <span className="font-mono text-[12px] tabular-nums text-driftwood">
        {label && <span className="text-ink">{label} · </span>}
        {i + 1} / {ids.length}
      </span>
      <PagerButton href={next ? `/jobs/${next}` : null} dir="next" />
    </div>
  );
}
