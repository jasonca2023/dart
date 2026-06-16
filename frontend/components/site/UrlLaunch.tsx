"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Link as LinkIcon } from "../icons";

// Hero / CTA entry point. Carries the pasted URL into the dashboard launch form,
// where the merchant sets audience + format and fires the one-click generate.
export function UrlLaunch({ size = "lg" }: { size?: "lg" | "md" }) {
  const router = useRouter();
  const [url, setUrl] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    router.push(trimmed ? `/dashboard?url=${encodeURIComponent(trimmed)}` : "/dashboard");
  };

  const tall = size === "lg";

  return (
    <form
      onSubmit={submit}
      className={
        "group flex w-full items-center gap-2 rounded-full border border-ash bg-white p-1.5 pl-4 " +
        "shadow-[var(--shadow-ring)] transition-colors duration-150 ease-out focus-within:border-ink " +
        (tall ? "max-w-xl" : "max-w-lg")
      }
    >
      <LinkIcon className="shrink-0 text-[18px] text-fog" />
      <input
        type="url"
        inputMode="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Paste a product URL…"
        aria-label="Product URL"
        className={
          "min-w-0 flex-1 bg-transparent text-ink placeholder:text-fog outline-none " +
          (tall ? "py-2.5 text-[16px]" : "py-2 text-[15px]")
        }
      />
      <button
        type="submit"
        className={
          "inline-flex shrink-0 items-center gap-1.5 rounded-full bg-ink px-4 font-medium text-parchment " +
          "transition-transform duration-[140ms] ease-out active:scale-[0.97] " +
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink " +
          (tall ? "h-10 text-[15px]" : "h-9 text-[14px]")
        }
      >
        Generate
        <ArrowRight className="text-[16px]" />
      </button>
    </form>
  );
}
