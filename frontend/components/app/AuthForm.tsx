"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Field, Input } from "../ui/Field";
import { Button } from "../ui/Button";
import { Alert, ArrowRight } from "../icons";

type Mode = "signin" | "signup";

// Supabase sends at most one email per address per minute.
const RESEND_COOLDOWN_SEC = 60;

const PASSWORD_REQ =
  "8+ characters with a capital letter and a special character (or 12+ characters).";

// Policy: a capital letter always; 8+ chars when a special character is present,
// otherwise 12+ chars. Returns an error string, or null when the password is OK.
function passwordError(pw: string): string | null {
  if (!/[A-Z]/.test(pw)) return "Add a capital letter.";
  const hasSpecial = /[^A-Za-z0-9]/.test(pw);
  if (hasSpecial && pw.length < 8) return "At least 8 characters.";
  if (!hasSpecial && pw.length < 12)
    return "Add a special character, or use 12+ characters.";
  return null;
}

// Friendlier wording for the Supabase errors people actually hit.
function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "Wrong email or password.";
  if (m.includes("already registered"))
    return "That email already has an account — sign in instead.";
  if (m.includes("security purposes") || m.includes("rate limit"))
    return "Please wait a minute between emails, then try again.";
  if (m.includes("expired") || m.includes("invalid"))
    return "That code didn’t match — check for typos, or resend a fresh one.";
  return message;
}

// Email + password auth, with one twist: a new account must type the 6-digit
// code we email before it works — proof the address is really theirs. Returning
// users sign in with just their password, no code.
export function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  const pwErr = mode === "signup" ? passwordError(password) : null;

  // Tick the resend cooldown down once a second.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  function toConfirmStep(msg: string | null) {
    setStep("confirm");
    setCode("");
    setNotice(msg);
    setCooldown(RESEND_COOLDOWN_SEC);
    setTimeout(() => codeRef.current?.focus(), 0);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) {
      setError("Auth isn’t configured (missing Supabase env).");
      return;
    }
    const addr = email.trim().toLowerCase();
    if (mode === "signup") {
      const pe = passwordError(password);
      if (pe) {
        setError(pe);
        return;
      }
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email: addr, password });
        if (error) throw error;
        // With confirmation on, Supabase obfuscates existing accounts as a
        // user with no identities — route those to sign-in instead.
        if (data.user && data.user.identities?.length === 0) {
          setMode("signin");
          setError("That email already has an account — sign in instead.");
          return;
        }
        if (data.session) {
          // Email confirmation is disabled server-side; nothing to verify.
          router.push("/");
          router.refresh();
          return;
        }
        setEmail(addr);
        toConfirmStep(null);
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: addr,
          password,
        });
        if (error) {
          // Account exists but the email was never verified — send a fresh
          // code and finish the confirmation instead of dead-ending.
          if (error.message.toLowerCase().includes("not confirmed")) {
            await supabase.auth
              .resend({ type: "signup", email: addr })
              .catch(() => {});
            setEmail(addr);
            toConfirmStep("This email was never confirmed — we just sent a fresh code.");
            return;
          }
          throw error;
        }
        router.push("/");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? friendly(err.message) : "Something went wrong.");
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
      // Verified — the session is live; keep the button loading while we go.
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? friendly(err.message) : "Couldn’t verify the code.");
      setBusy(false);
    }
  }

  async function resend() {
    if (!supabase || cooldown > 0) return;
    setError(null);
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email });
      if (error) throw error;
      setNotice("Sent a new code.");
      setCooldown(RESEND_COOLDOWN_SEC);
    } catch (err) {
      setError(err instanceof Error ? friendly(err.message) : "Couldn’t resend the code.");
    }
  }

  if (step === "confirm") {
    return (
      <div className="flex flex-col gap-5">
        <form onSubmit={verify} className="flex flex-col gap-4">
          <p className="text-[14px] leading-relaxed text-driftwood">
            We emailed a 6-digit code to{" "}
            <span className="font-medium text-ink">{email}</span> to confirm
            it’s yours. It may take a minute — check spam too.
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
          {notice && !error && (
            <p className="text-[14px] leading-relaxed text-driftwood">{notice}</p>
          )}

          <Button type="submit" size="lg" loading={busy} className="w-full">
            Confirm &amp; sign in
            {!busy && <ArrowRight className="text-[18px]" />}
          </Button>
        </form>

        <p className="text-center text-[13px] text-driftwood">
          {cooldown > 0 ? (
            <>Resend available in {cooldown}s</>
          ) : (
            <button
              type="button"
              onClick={resend}
              className="font-medium text-ink underline-offset-2 hover:underline"
            >
              Resend code
            </button>
          )}
          {" · "}
          <button
            type="button"
            onClick={() => {
              setStep("form");
              setCode("");
              setError(null);
              setNotice(null);
            }}
            className="font-medium text-ink underline-offset-2 hover:underline"
          >
            Back
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input
            id="password"
            type="password"
            required
            minLength={mode === "signup" ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />
          {mode === "signup" && (
            <p
              className={`text-[12px] ${password && pwErr ? "text-ember" : "text-driftwood"}`}
            >
              {password ? (pwErr ?? "Strong password.") : PASSWORD_REQ}
            </p>
          )}
        </Field>

        {error && (
          <p role="alert" className="flex items-center gap-2 text-[14px] text-ink">
            <Alert className="text-[18px] text-driftwood" />
            {error}
          </p>
        )}
        {notice && !error && (
          <p className="text-[14px] leading-relaxed text-driftwood">{notice}</p>
        )}

        <Button type="submit" size="lg" loading={busy} className="w-full">
          {mode === "signup" ? "Create account" : "Sign in"}
          {!busy && <ArrowRight className="text-[18px]" />}
        </Button>
      </form>

      <p className="text-center text-[13px] text-driftwood">
        {mode === "signin" ? "New to Dart?" : "Already have an account?"}{" "}
        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
            setNotice(null);
          }}
          className="font-medium text-ink underline-offset-2 hover:underline"
        >
          {mode === "signin" ? "Create one" : "Sign in"}
        </button>
      </p>

      <p className="text-center text-[12px] leading-relaxed text-fog">
        {mode === "signup"
          ? "We’ll email a 6-digit code to confirm the address is yours."
          : "Sign in to save every ad you generate to your library."}
      </p>
    </div>
  );
}
