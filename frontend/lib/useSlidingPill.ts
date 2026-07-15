"use client";

import { useEffect, useRef, useState } from "react";

export interface Pill {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Drives the single white pill that slides to the active option — shared by the
// landing pipeline tabs, the mood picker and the Segmented control. It measures
// the active button off the DOM and keeps the pill in sync across font swaps and
// resizes. `deps` covers anything besides the active index that changes the
// button layout (e.g. a changing option count).
//
// `L` is the list element type (div, ul, …); assign the returned `btnRefs` to
// each option button and `listRef` to their container.
export function useSlidingPill<L extends HTMLElement>(
  active: number,
  deps: unknown[] = [],
) {
  const listRef = useRef<L>(null);
  const btnRefs = useRef<(HTMLElement | null)[]>([]);
  const [pill, setPill] = useState<Pill | null>(null);

  useEffect(() => {
    const measure = () => {
      const el = btnRefs.current[active];
      if (!el) return;
      setPill({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
    };
    measure();
    // A late webfont swap can change button widths without resizing the list's
    // own box, which the ResizeObserver wouldn't catch.
    document.fonts.ready.then(measure);
    const ro = new ResizeObserver(measure);
    if (listRef.current) ro.observe(listRef.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ...deps]);

  return { listRef, btnRefs, pill };
}
