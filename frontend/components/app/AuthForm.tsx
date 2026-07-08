"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Field, Input } from "../ui/Field";
import { Button } from "../ui/Button";
import { Alert, ArrowRight } from "../icons";

// Supabase sends at most one code per address per minute.
const RESEND_COOLDOWN_SEC = 60;

// Friendlier wording for the Supabase errors people actually hit.
function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("expired") || m.includes("invalid"))
    return "That code didn’t match — check for typos, or resend a fresh one.";
  if (m.includes("security purposes") || m.includes("rate limit"))
    return "Codes can only be sent once a minute — give it a moment, then resend.";
  return message;
}

// Passwordless email-code sign-in (Supabase OTP). One flow covers both signup
// and sign-in: enter an email, get a 6-digit code, type it, you're in. Access
// requires reading the inbox, so nobody can claim an address they don't own.
export function AuthForm() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  // Tick the resend cooldown down once a second.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    if (!supabase) {
      setError("Auth isn’t configured (missing Supabase env).");
      return;
    }
    const addr = email.trim().toLowerCase();
    if (!addr) return;
    setBusy(true);
    setError(null);
    try {
      // shouldCreateUser defaults to true, so a new email signs up and an
      // existing one signs in — one flow for both.
      const { error } = await supabase.auth.signInWithOtp({ email: addr });
      if (error) throw error;
      setEmail(addr);
      setStep("code");
      setCode("");
      setCooldown(RESEND_COOLDOWN_SEC);
      setTimeout(() => codeRef.current?.focus(), 0);
    } catch (err) {
      setError(err instanceof Error ? friendly(err.message) : "Couldn’t send the code.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    const token = code.replace(/\D/g, "");
    if (token.length < 6) {
      setError("Enter the 6-digit code from the email.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
      if (error) throw error;
      // Keep the button in its loading state while we navigate.
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? friendly(err.message) : "Couldn’t verify the code.");
      setBusy(false);
    }
  }

  if (step === "code") {
    return (
      <div className="flex flex-col gap-5">
        <form onSubmit={verify} className="flex flex-col gap-4">
          <p className="text-[14px] leading-relaxed text-driftwood">
            We emailed a 6-digit code to{" "}
            <span className="font-medium text-ink">{email}</span>. It may take a
            minute — check spam too.
          </p>
          <Field label="Code" htmlFor="otp">
            <Input
              id="otp"
              ref={codeRef}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="••••••"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="text-center font-mono text-[22px] tracking-[0.45em]"
            />
          </Field>

          {error && (
            <p role="alert" className="flex items-center gap-2 text-[14px] text-ink">
              <Alert className="text-[18px] text-driftwood" />
              {error}
            </p>
          )}

          <Button type="submit" size="lg" loading={busy} className="w-full">
            Verify &amp; sign in
            {!busy && <ArrowRight className="text-[18px]" />}
          </Button>
        </form>

        <p className="text-center text-[13px] text-driftwood">
          {cooldown > 0 ? (
            <>Resend available in {cooldown}s</>
          ) : (
            <button
              type="button"
              onClick={() => sendCode()}
              className="font-medium text-ink underline-offset-2 hover:underline"
            >
              Resend code
            </button>
          )}
          {" · "}
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setCode("");
              setError(null);
            }}
            className="font-medium text-ink underline-offset-2 hover:underline"
          >
            Different email
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={sendCode} className="flex flex-col gap-4">
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="you@store.com"
          />
        </Field>

        {error && (
          <p role="alert" className="flex items-center gap-2 text-[14px] text-ink">
            <Alert className="text-[18px] text-driftwood" />
            {error}
          </p>
        )}

        <Button type="submit" size="lg" loading={busy} className="w-full">
          Email me a code
          {!busy && <ArrowRight className="text-[18px]" />}
        </Button>
      </form>

      <p className="text-center text-[12px] leading-relaxed text-fog">
        No passwords. We email a one-time code — typing it proves the inbox is
        yours. New emails get a workspace automatically.
      </p>
    </div>
  );
}
