"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { API_BASE } from "@/lib/api";
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
    return "That email already has an account — log in instead.";
  if (m.includes("security purposes") || m.includes("rate limit"))
    return "Please wait a minute between emails, then try again.";
  if (m.includes("expired") || m.includes("invalid"))
    return "That code didn’t match — check for typos, or resend a fresh one.";
  return message;
}

// Signup codes are emailed by Dart's own backend (Brevo), not Supabase — the
// account is only created once the code verifies, so it can't be bypassed.
async function postJson(path: string, body: unknown): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = "Something went wrong.";
    try {
      const data = (await res.json()) as { error?: { message?: string } };
      if (data.error?.message) message = data.error.message;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(message);
  }
}

// Email + password auth, with one twist: a new account must type the 6-digit
// code we email before it exists — proof the address is really theirs.
// Returning users log in with just their password, no code.
export function AuthForm({ initialMode = "signin" }: { initialMode?: Mode }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
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

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
  }

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
        if (!API_BASE) {
          setError("Signup isn’t configured (missing backend URL).");
          return;
        }
        // Dart's backend emails the code; no account exists yet.
        await postJson("/auth/signup/code", { email: addr });
        setEmail(addr);
        toConfirmStep(null);
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: addr,
          password,
        });
        if (error) throw error;
        router.push("/");
        router.refresh();
      }
    } catch (err) {
      const msg = err instanceof Error ? friendly(err.message) : "Something went wrong.";
      // An email that already has an account belongs on the log-in form.
      if (msg.includes("already has an account")) setMode("signin");
      setError(msg);
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
      // Verifying the code is what creates the account (backend, admin API).
      await postJson("/auth/signup/verify", { email, code: token, password });
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // Created and signed in — keep the button loading while we navigate.
      router.push("/");
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? friendly(err.message) : "Couldn’t verify the code.";
      if (msg.includes("already has an account")) {
        setStep("form");
        setMode("signin");
      }
      setError(msg);
      setBusy(false);
    }
  }

  async function resend() {
    if (cooldown > 0) return;
    setError(null);
    try {
      await postJson("/auth/signup/code", { email });
      setNotice("Sent a new code.");
      setCooldown(RESEND_COOLDOWN_SEC);
    } catch (err) {
      setError(err instanceof Error ? friendly(err.message) : "Couldn’t resend the code.");
    }
  }

  // --- Step 2 of signup: type the emailed code -----------------------------
  if (step === "confirm") {
    return (
      <div>
        <h1 className="t-heading">Check your email</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-driftwood">
          We sent a 6-digit code to{" "}
          <span className="font-medium text-ink">{email}</span>. Enter it below
          — that’s what creates your account.
        </p>

        <form onSubmit={verify} className="mt-8 flex flex-col gap-5">
          <Field label="Code" htmlFor="otp" hint="It can take a minute — check spam too.">
            <Input
              id="otp"
              ref={codeRef}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="text-center font-mono text-[24px] tracking-[0.5em] placeholder:text-mist"
            />
          </Field>

          {error && (
            <p role="alert" className="flex items-center gap-2 text-[14px] text-ink">
              <Alert className="shrink-0 text-[18px] text-driftwood" />
              {error}
            </p>
          )}
          {notice && !error && (
            <p className="text-[14px] leading-relaxed text-driftwood">{notice}</p>
          )}

          <Button type="submit" size="lg" loading={busy} className="w-full">
            Confirm &amp; create account
            {!busy && <ArrowRight className="text-[18px]" />}
          </Button>
        </form>

        <div className="mt-8 flex items-baseline justify-between border-t border-ash pt-4 text-[13px] text-driftwood">
          {cooldown > 0 ? (
            <span className="font-mono tabular-nums">Resend in {cooldown}s</span>
          ) : (
            <button
              type="button"
              onClick={resend}
              className="font-medium text-ink underline-offset-2 transition-colors duration-150 ease-out hover:underline"
            >
              Resend code
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setStep("form");
              setCode("");
              setError(null);
              setNotice(null);
            }}
            className="transition-colors duration-150 ease-out hover:text-ink"
          >
            ← Different email
          </button>
        </div>
      </div>
    );
  }

  // --- Log in / create account ---------------------------------------------
  const signup = mode === "signup";
  return (
    <div>
      <h1 className="t-heading">{signup ? "Create your account" : "Welcome back"}</h1>
      <p className="mt-3 max-w-[36ch] text-[15px] leading-relaxed text-driftwood">
        {signup
          ? "Your first ad is one photo away."
          : "Log in to your library and pick up where you left off."}
      </p>

      <form onSubmit={submit} className="mt-8 flex flex-col gap-5">
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
        <Field
          label="Password"
          htmlFor="password"
          hint={signup && !password ? PASSWORD_REQ : undefined}
        >
          <Input
            id="password"
            type="password"
            required
            minLength={signup ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={signup ? "new-password" : "current-password"}
          />
          {signup && password && (
            <p className={`text-[12px] ${pwErr ? "text-ink" : "text-driftwood"}`}>
              {pwErr ?? "Strong password."}
            </p>
          )}
        </Field>

        {error && (
          <p role="alert" className="flex items-center gap-2 text-[14px] text-ink">
            <Alert className="shrink-0 text-[18px] text-driftwood" />
            {error}
          </p>
        )}
        {notice && !error && (
          <p className="text-[14px] leading-relaxed text-driftwood">{notice}</p>
        )}

        <Button type="submit" size="lg" loading={busy} className="w-full">
          {signup ? "Send my code" : "Log in"}
          {!busy && <ArrowRight className="text-[18px]" />}
        </Button>
      </form>

      {/* The other door — quiet, behind a hairline, clearly labelled. */}
      <div className="mt-8 flex items-baseline justify-between border-t border-ash pt-4 text-[13px] text-driftwood">
        <span>{signup ? "Already have an account?" : "New to Dart?"}</span>
        <button
          type="button"
          onClick={() => switchMode(signup ? "signin" : "signup")}
          className="font-medium text-ink underline-offset-2 transition-colors duration-150 ease-out hover:underline"
        >
          {signup ? "Log in" : "Create an account"}
        </button>
      </div>
      {!signup && (
        <p className="mt-3 text-[12px] leading-relaxed text-fog">
          Every ad you generate saves to your library.
        </p>
      )}
    </div>
  );
}
