"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Field, Input } from "../ui/Field";
import { Button } from "../ui/Button";
import { Alert, ArrowRight } from "../icons";

type Mode = "signin" | "signup";

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

// Real Supabase email/password auth. On success the session is persisted and the
// nav reflects it; from then on, finished ads are saved to the user's library.
export function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const pwErr = mode === "signup" ? passwordError(password) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) {
      setError("Auth isn’t configured (missing Supabase env).");
      return;
    }
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
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        // If email confirmation is on, there's no session yet.
        if (!data.session) {
          setNotice("Account created — check your email to confirm, then sign in.");
          setMode("signin");
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
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
        {notice && (
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
        Sign in to save every ad you generate to your library. People in
        generated ads are synthetic.
      </p>
    </div>
  );
}
