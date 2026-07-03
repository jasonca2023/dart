"use client";

import { useEffect, useRef, useState } from "react";
import { api, ApiRequestError } from "./api";
import { isTerminal } from "./format";
import type { Job } from "./types";

// Reveal-on-scroll. Sets data-revealed="true" once, when the node enters view.
export function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      node.dataset.revealed = "true";
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            node.dataset.revealed = "true";
            io.unobserve(node);
          }
        }
      },
      { threshold: 0.12, rootMargin: "-40px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);
  return ref;
}

// Polls a job (contract suggests 2s) until it reaches a terminal state.
export function useJobPolling(id: string | null, intervalMs = 2000) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let fails = 0; // tolerate transient network blips before giving up

    const poll = async () => {
      try {
        const next = await api.getJob(id);
        if (!active) return;
        fails = 0;
        setJob(next);
        setError(null);
        setLoading(false);
        if (!isTerminal(next.status)) {
          timer = setTimeout(poll, intervalMs);
        }
      } catch (e) {
        if (!active) return;
        // A definitive "not found" isn't a transient blip — fail immediately so
        // the caller can fall back (browser-rendered ads only exist in the
        // library, and retrying five times kept them loading for ~10s).
        const notFound = e instanceof ApiRequestError && e.status === 404;
        fails += 1;
        if (notFound || fails >= 5) {
          setError(e instanceof Error ? e.message : "Could not load job.");
          setLoading(false);
        } else {
          timer = setTimeout(poll, intervalMs); // retry through the blip
        }
      }
    };

    poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [id, intervalMs]);

  return { job, error, loading, setJob };
}

// Returns `value` delayed by `ms` after it last changed — so rapidly-changing
// inputs (typing) settle before driving an expensive consumer (the live preview).
export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

// Tracks prefers-reduced-motion for JS-driven flourishes.
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}
