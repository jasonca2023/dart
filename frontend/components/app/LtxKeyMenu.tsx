"use client";

import { useEffect, useRef, useState } from "react";
import { api, USING_MOCK } from "@/lib/api";
import { Input } from "../ui/Field";
import { Button } from "../ui/Button";

// Top-bar control to paste an LTX API key. The key goes to the local backend
// (rebuilds the video provider) and is never returned to the browser.
export function LtxKeyMenu() {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [connected, setConnected] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (USING_MOCK) {
      setConnected(false);
      return;
    }
    api
      .getSettings()
      .then((s) => setConnected(s.ltx_key_set))
      .catch(() => setConnected(null));
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!key.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.setLtxKey(key.trim());
      setConnected(r.ltx_key_set);
      setKey("");
      setMsg(r.ltx_key_set ? "Saved — renders will use it." : "Key cleared.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Couldn’t save the key.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-full border border-ash bg-white px-2.5 py-1.5 text-[13px] text-ink transition-colors duration-150 ease-out hover:bg-sand"
      >
        <span
          className={"size-1.5 rounded-full " + (connected ? "bg-ink" : "bg-fog")}
        />
        LTX key
      </button>

      {open && (
        <div
          role="menu"
          className="dart-pop absolute right-0 top-[calc(100%+8px)] z-50 w-72 rounded-tooltip border border-ash bg-white p-4 shadow-[var(--shadow-elevated)]"
        >
          <p className="text-[14px] font-medium text-ink">LTX video engine</p>
          <p className="mt-0.5 text-[12px] text-driftwood">
            {connected
              ? "Key connected — ready to render."
              : "Paste your LTX key to enable real renders."}
          </p>
          <form onSubmit={save} className="mt-3 flex flex-col gap-2">
            <Input
              type="password"
              placeholder="ltxv_…"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              autoComplete="off"
              aria-label="LTX API key"
            />
            <Button
              type="submit"
              size="sm"
              loading={busy}
              disabled={!key.trim()}
              className="w-full"
            >
              Save key
            </Button>
          </form>
          {msg && <p className="mt-2 text-[12px] text-driftwood">{msg}</p>}
          <p className="mt-2 text-[11px] leading-relaxed text-fog">
            Get a key at app.ltx.video. Stored on your backend only — never in the
            browser.
          </p>
        </div>
      )}
    </div>
  );
}
