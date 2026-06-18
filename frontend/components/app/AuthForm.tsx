"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Field, Input } from "../ui/Field";
import { Button } from "../ui/Button";
import { Alert, ArrowRight } from "../icons";

type Mode = "signin" | "signup";

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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) {
      setError("Auth isn’t configured (missing Supabase env).");
      return;
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
            placeholder="you@store.com"
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
            minLength={6}
            placeholder="At least 6 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />
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
