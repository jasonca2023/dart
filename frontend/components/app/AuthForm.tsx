"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { API_BASE } from "@/lib/api";
import { Field, Input } from "../ui/Field";
import { Button } from "../ui/Button";
import { Alert, ArrowRight } from "../icons";

type Mode = "signin" | "signup" | "reset";

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

// Errors from Dart's backend carry a stable machine-readable code — the UI
// branches on that, never on the message wording.
class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

// Friendlier wording for the Supabase sign-in errors people actually hit.
// (Backend errors are written for humans already and shown as-is.)
function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "Wrong email or password.";
  if (m.includes("security purposes") || m.includes("rate limit"))
    return "Please wait a minute between emails, then try again.";
  return message;
}

function errMsg(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  return err instanceof Error ? friendly(err.message) : fallback;
}

// Signup codes are emailed by Dart's own backend (Brevo), not Supabase — the
// account is only created once the code verifies, so it can't be bypassed.
async function postJson<T = unknown>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let code = "internal";
    let message = "Something went wrong.";
    try {
      const data = (await res.json()) as {
        error?: { code?: string; message?: string };
      };
      if (data.error?.code) code = data.error.code;
      if (data.error?.message) message = data.error.message;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(code, message);
  }
  return (await res.json()) as T;
}

// Email + password auth, with one twist: a new account must type the 6-digit
// code we email before it exists — proof the address is really theirs.
// Returning users log in with just their password, no code. Password reset
// runs the same code machinery: code → verify → new password.
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
  // Reset only: the code must check out server-side before the new-password
  // field appears.
  const [codeOk, setCodeOk] = useState(false);
  // Returned by /code and echoed on check/verify: proves this browser asked
  // for the code, so strangers' guesses can't burn the attempt cap.
  const [reqToken, setReqToken] = useState("");
  const codeRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);

  const pwErr = mode === "signin" ? null : passwordError(password);

  // Land the cursor in the email box — on arrival, on mode switch, and when
  // coming back from the code step. (The code step focuses its own input.)
  useEffect(() => {
    if (step === "form") emailRef.current?.focus();
  }, [mode, step]);

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
    // Whatever was typed into the log-in password box must not leak into the
    // reset flow's "new password".
    if (next === "reset") setPassword("");
  }

  function toConfirmStep(msg: string | null) {
    setStep("confirm");
    setCode("");
    setCodeOk(false);
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
      if (mode === "signup" || mode === "reset") {
        if (!API_BASE) {
          setError(
            (mode === "reset" ? "Password reset" : "Signup") +
              " isn’t configured (missing backend URL).",
          );
          return;
        }
        // Dart's backend emails the code (signup: no account exists yet;
        // reset: proves the address before the password changes).
        const data = await postJson<{ request?: string }>(
          `/auth/${mode === "reset" ? "reset" : "signup"}/code`,
          { email: addr },
        );
        setReqToken(data.request ?? "");
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
      // An email that already has an account belongs on the log-in form; an
      // email without one belongs on signup.
      if (err instanceof ApiError && err.code === "conflict") setMode("signin");
      if (err instanceof ApiError && err.code === "not_found") setMode("signup");
      setError(errMsg(err, "Something went wrong."));
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
    // Reset, stage 1: check the code server-side; only a valid code reveals
    // the new-password field. Wrong guesses still count against the cap.
    if (mode === "reset" && !codeOk) {
      setBusy(true);
      setError(null);
      try {
        await postJson("/auth/reset/check", { email, code: token, request: reqToken });
        setCodeOk(true);
        setNotice(null);
        setTimeout(() => pwRef.current?.focus(), 0);
      } catch (err) {
        setError(errMsg(err, "Couldn’t check the code."));
      } finally {
        setBusy(false);
      }
      return;
    }
    // Reset, stage 2: the code checked out — now the new password.
    if (mode === "reset") {
      const pe = passwordError(password);
      if (pe) {
        setError(pe);
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      // Verifying the code is what creates the account / sets the password
      // (backend, admin API).
      await postJson(
        mode === "reset" ? "/auth/reset/verify" : "/auth/signup/verify",
        { email, code: token, password, request: reqToken },
      );
    } catch (err) {
      if (err instanceof ApiError && err.code === "conflict") {
        setStep("form");
        setMode("signin");
      }
      if (err instanceof ApiError && err.code === "not_found") {
        setStep("form");
        setMode("signup");
      }
      // A code that stopped verifying (expired, consumed, replaced) sends
      // reset back to the code stage; a password complaint (invalid_input)
      // keeps the password field up.
      if (mode === "reset" && err instanceof ApiError && err.code === "invalid_code")
        setCodeOk(false);
      setError(errMsg(err, "Couldn’t verify the code."));
      setBusy(false);
      return;
    }
    // The account exists / the password is set — the code is spent. If the
    // automatic sign-in hiccups now, land on the log-in form (password still
    // filled in) instead of stranding the user on a consumed code.
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // Done and signed in — keep the button loading while we navigate.
      router.push("/");
      router.refresh();
    } catch {
      setStep("form");
      setCode("");
      setCodeOk(false);
      setError(null);
      setNotice(
        mode === "reset"
          ? "Password updated — log in with it below."
          : "Account created — log in below.",
      );
      setMode("signin");
      setBusy(false);
    }
  }

  async function resend() {
    if (cooldown > 0) return;
    // Start the countdown before the request — instant feedback, and a
    // double-click can't fire a second send.
    setCooldown(RESEND_COOLDOWN_SEC);
    setError(null);
    setNotice(null);
    try {
      const data = await postJson<{ request?: string }>(
        `/auth/${mode === "reset" ? "reset" : "signup"}/code`,
        { email },
      );
      setReqToken(data.request ?? "");
      setNotice("Sent a new code.");
      setCode("");
      setCodeOk(false);
      codeRef.current?.focus();
    } catch (err) {
      setCooldown(0);
      setError(errMsg(err, "Couldn’t resend the code."));
    }
  }

  // --- Step 2 of signup / reset: type the emailed code ---------------------
  if (step === "confirm") {
    const reset = mode === "reset";
    return (
      <div>
        <h1 className="t-heading">Check your email</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-driftwood">
          We sent a 6-digit code to{" "}
          <span className="font-medium text-ink">{email}</span>.{" "}
          {reset
            ? codeOk
              ? "Code confirmed — now choose your new password."
              : "Enter it below to continue."
            : "Enter it below — that’s what creates your account."}
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
              disabled={reset && codeOk}
              className="text-center font-mono text-[24px] tracking-[0.5em] placeholder:text-mist disabled:text-driftwood"
            />
          </Field>

          {reset && codeOk && (
            <Field
              label="New password"
              htmlFor="new-password"
              hint={!password ? PASSWORD_REQ : undefined}
            >
              <Input
                id="new-password"
                ref={pwRef}
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
              {password && (
                <p className={`text-[12px] ${pwErr ? "text-ink" : "text-driftwood"}`}>
                  {pwErr ?? "Strong password."}
                </p>
              )}
            </Field>
          )}

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
            {reset
              ? codeOk
                ? "Set new password"
                : "Confirm code"
              : "Confirm & create account"}
            {!busy && <ArrowRight className="text-[18px]" />}
          </Button>
        </form>

        <div className="mt-8 flex items-baseline justify-between border-t border-ash pt-4 text-[13px] text-driftwood">
          {reset && codeOk ? (
            <span>Code confirmed.</span>
          ) : cooldown > 0 ? (
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
              setCodeOk(false);
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

  // --- Log in / create account / reset a password ---------------------------
  const signup = mode === "signup";
  const reset = mode === "reset";
  return (
    <div>
      <h1 className="t-heading">
        {signup ? "Create your account" : reset ? "Reset your password" : "Welcome back"}
      </h1>
      <p className="mt-3 max-w-[36ch] text-[15px] leading-relaxed text-driftwood">
        {signup
          ? "Your first ad is one photo away."
          : reset
            ? "We’ll email you a code, then you choose a new password."
            : "Log in to your library and pick up where you left off."}
      </p>

      <form onSubmit={submit} className="mt-8 flex flex-col gap-5">
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            ref={emailRef}
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </Field>
        {!reset && (
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
            {!signup && (
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => switchMode("reset")}
                  className="text-[12px] text-driftwood transition-colors duration-150 ease-out hover:text-ink"
                >
                  Forgot password?
                </button>
              </div>
            )}
          </Field>
        )}

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
          {signup ? "Send my code" : reset ? "Send reset code" : "Log in"}
          {!busy && <ArrowRight className="text-[18px]" />}
        </Button>
      </form>

      {/* The other door — quiet, behind a hairline, clearly labelled. */}
      <div className="mt-8 flex items-baseline justify-between border-t border-ash pt-4 text-[13px] text-driftwood">
        <span>
          {signup ? "Already have an account?" : reset ? "Remembered it?" : "New to Dart?"}
        </span>
        <button
          type="button"
          onClick={() => switchMode(mode === "signin" ? "signup" : "signin")}
          className="font-medium text-ink underline-offset-2 transition-colors duration-150 ease-out hover:underline"
        >
          {mode === "signin" ? "Create an account" : "Log in"}
        </button>
      </div>
      {mode === "signin" && (
        <p className="mt-3 text-[12px] leading-relaxed text-fog">
          Every ad you generate saves to your library.
        </p>
      )}
    </div>
  );
}
