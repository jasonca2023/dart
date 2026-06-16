"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, Input } from "../ui/Field";
import { Button } from "../ui/Button";
import { ArrowRight } from "../icons";

// Placeholder auth (PRD: v1 may start unauthenticated). Routes to the dashboard;
// no real credential exchange yet — labelled honestly below.
export function AuthForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<null | "email" | "google">(null);

  function go(method: "email" | "google") {
    setBusy(method);
    setTimeout(() => router.push("/dashboard"), 400);
  }

  return (
    <div className="flex flex-col gap-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go("email");
        }}
        className="flex flex-col gap-4"
      >
        <Field label="Work email" htmlFor="email">
          <Input
            id="email"
            type="email"
            required
            placeholder="you@store.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </Field>
        <Button type="submit" size="lg" loading={busy === "email"} className="w-full">
          Continue with email
          {busy !== "email" && <ArrowRight className="text-[18px]" />}
        </Button>
      </form>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-ash" />
        <span className="text-[12px] text-fog">or</span>
        <span className="h-px flex-1 bg-ash" />
      </div>

      <Button
        variant="secondary"
        size="lg"
        loading={busy === "google"}
        onClick={() => go("google")}
        className="w-full"
      >
        Continue with Google
      </Button>

      <p className="text-center text-[12px] leading-relaxed text-fog">
        Demo sign-in — no account is created yet. By continuing you agree to
        Dart&rsquo;s terms and acknowledge people in generated ads are synthetic.
      </p>
    </div>
  );
}
