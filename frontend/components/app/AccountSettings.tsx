"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { API_BASE, ApiError, getAccessToken, postJson } from "@/lib/api";
import { PASSWORD_REQ, passwordError } from "@/lib/password";
import { listAds, type SavedAd } from "@/lib/ads";
import { TONE_ACCENTS } from "@/lib/adSpec";
import { Card } from "../ui/Card";
import { Field, Input } from "../ui/Field";
import { Button } from "../ui/Button";
import { Orb } from "../ui/Orb";
import { Alert, Download } from "../icons";

function errMsg(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.code === "unauthorized")
    return "Your session expired. Log in again.";
  return err instanceof Error ? err.message : fallback;
}

function fmtBytes(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} GB`;
  if (n >= 1_000_000) return `${Math.round(n / 1_000_000)} MB`;
  if (n > 0) return `${Math.max(1, Math.round(n / 1_000))} KB`;
  return "0 KB";
}

// Two-step email change: password + new address, then the 6-digit code that
// was emailed to the NEW address. Same code machinery as signup and reset.
function ChangeEmailCard({ className }: { className?: string }) {
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [reqToken, setReqToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const addr = newEmail.trim().toLowerCase();
    try {
      const token = await getAccessToken();
      const d = await postJson<{ request?: string }>("/auth/email/code", {
        token,
        password,
        new_email: addr,
      });
      setReqToken(d.request ?? "");
      setNewEmail(addr);
      setStep("confirm");
      setCode("");
      setCooldown(60);
    } catch (err) {
      setError(errMsg(err, "Couldn’t send the code."));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    const token6 = code.replace(/\D/g, "");
    if (token6.length < 6) {
      setError("Enter the 6-digit code from the email.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const token = await getAccessToken();
      await postJson("/auth/email/verify", {
        token,
        new_email: newEmail,
        code: token6,
        request: reqToken,
      });
      // Pick up the new email everywhere (header, identity card).
      await supabase?.auth.refreshSession();
      setStep("form");
      setNewEmail("");
      setPassword("");
      setCode("");
      setNotice("Email updated.");
    } catch (err) {
      setError(errMsg(err, "Couldn’t confirm the code."));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (cooldown > 0) return;
    setCooldown(60);
    setError(null);
    setNotice(null);
    try {
      const token = await getAccessToken();
      const d = await postJson<{ request?: string }>("/auth/email/code", {
        token,
        password,
        new_email: newEmail,
      });
      setReqToken(d.request ?? "");
      setCode("");
      setNotice("Sent a new code.");
    } catch (err) {
      setCooldown(0);
      setError(errMsg(err, "Couldn’t resend the code."));
    }
  }

  return (
    <Card className={`p-6 ${className ?? ""}`}>
      <p className="t-caption text-driftwood">Change email</p>

      {step === "form" ? (
        <>
          <p className="mt-3 max-w-[44ch] text-[14px] leading-relaxed text-driftwood">
            We send a 6-digit code to the new address to prove it’s yours.
            Nothing changes until you enter it.
          </p>
          <form onSubmit={sendCode} className="mt-5 flex flex-col gap-5">
            <Field label="New email" htmlFor="new-email">
              <Input
                id="new-email"
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                autoComplete="email"
              />
            </Field>
            <Field label="Confirm with your password" htmlFor="email-password">
              <Input
                id="email-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
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

            <div>
              <Button type="submit" loading={busy}>
                Send code
              </Button>
            </div>
          </form>
        </>
      ) : (
        <>
          <p className="mt-3 max-w-[44ch] text-[14px] leading-relaxed text-driftwood">
            Enter the code we sent to{" "}
            <span className="font-medium text-ink">{newEmail}</span>.
          </p>
          <form onSubmit={confirm} className="mt-5 flex flex-col gap-5">
            <Field label="Code" htmlFor="email-otp" hint="It can take a minute. Check spam too.">
              <Input
                id="email-otp"
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

            <div>
              <Button type="submit" loading={busy}>
                Confirm new email
              </Button>
            </div>
          </form>

          <div className="mt-5 flex items-baseline justify-between border-t border-ash pt-4 text-[13px] text-driftwood">
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
              Cancel
            </button>
          </div>
        </>
      )}
    </Card>
  );
}

// Overview + change password + change email + sign out everywhere + export +
// delete. The mutating actions re-confirm the current password on the backend,
// so a stolen open tab can't quietly do any of them.
export function AccountSettings() {
  const { user, signOut } = useAuth();
  const router = useRouter();

  // -- overview stats ----
  const [ads, setAds] = useState<SavedAd[] | null>(null);
  const [bytes, setBytes] = useState<number | null>(null);

  useEffect(() => {
    let on = true;
    (async () => {
      const rows = await listAds();
      if (on) setAds(rows);
      try {
        const token = await getAccessToken();
        const d = await postJson<{ storage_bytes: number }>("/auth/overview", { token });
        if (on) setBytes(d.storage_bytes);
      } catch {
        if (on) setBytes(-1); // stat unavailable — hide it, everything else works
      }
    })();
    return () => {
      on = false;
    };
  }, []);

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      })
    : null;

  // -- change password ----
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwNotice, setPwNotice] = useState<string | null>(null);
  const nextErr = passwordError(next);

  // -- sign out everywhere ----
  const [soBusy, setSoBusy] = useState(false);

  // -- delete account ----
  const [armed, setArmed] = useState(false);
  const [delPassword, setDelPassword] = useState("");
  const [delBusy, setDelBusy] = useState(false);
  const [delError, setDelError] = useState<string | null>(null);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (nextErr) {
      setPwError(nextErr);
      return;
    }
    setPwBusy(true);
    setPwError(null);
    setPwNotice(null);
    try {
      const token = await getAccessToken();
      await postJson("/auth/password", {
        token,
        current_password: current,
        new_password: next,
      });
      setPwNotice("Password updated.");
      setCurrent("");
      setNext("");
    } catch (err) {
      setPwError(errMsg(err, "Couldn’t update the password."));
    } finally {
      setPwBusy(false);
    }
  }

  async function signOutEverywhere() {
    setSoBusy(true);
    // Revokes every session on every device — including this one.
    await supabase?.auth.signOut({ scope: "global" });
    router.push("/auth");
    router.refresh();
  }

  function exportData() {
    const payload = {
      exported_at: new Date().toISOString(),
      account: { email: user?.email, created_at: user?.created_at },
      ads: ads ?? [],
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dart-export.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function deleteAccount(e: React.FormEvent) {
    e.preventDefault();
    setDelBusy(true);
    setDelError(null);
    try {
      const token = await getAccessToken();
      await postJson("/auth/delete-account", { token, password: delPassword });
      // Gone — sign out locally and land on the homepage.
      await signOut();
      router.push("/");
      router.refresh();
    } catch (err) {
      setDelError(errMsg(err, "Couldn’t delete the account."));
      setDelBusy(false);
    }
  }

  if (!API_BASE) {
    return (
      <p className="text-[15px] text-driftwood">
        Account settings need the backend (demo mode has none).
      </p>
    );
  }

  return (
    <div className="max-w-4xl">
      <h1 className="t-heading">Account</h1>

      {/* -- Who you are, at a glance ----------------------------------------- */}
      <Card className="mt-6 flex items-center gap-5 p-6">
        <Orb accent={TONE_ACCENTS.luxe} className="size-14 shrink-0" float={false} />
        <div className="min-w-0">
          <p className="truncate text-[16px] font-medium text-ink">{user?.email}</p>
          <p className="mt-1 text-[13px] text-driftwood">
            {memberSince && <>Member since {memberSince}</>}
            <span className="tabular-nums">
              {ads !== null && (
                <>
                  {" · "}
                  {ads.length} {ads.length === 1 ? "ad" : "ads"} in your library
                </>
              )}
              {bytes !== null && bytes >= 0 && <> · {fmtBytes(bytes)} stored</>}
            </span>
          </p>
        </div>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
        {/* -- Change password ------------------------------------------------ */}
        <Card className="p-6">
          <p className="t-caption text-driftwood">Change password</p>
          <form onSubmit={changePassword} className="mt-5 flex flex-col gap-5">
            <Field label="Current password" htmlFor="current-password">
              <Input
                id="current-password"
                type="password"
                required
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
              />
            </Field>
            <Field
              label="New password"
              htmlFor="next-password"
              hint={!next ? PASSWORD_REQ : undefined}
            >
              <Input
                id="next-password"
                type="password"
                required
                minLength={8}
                value={next}
                onChange={(e) => setNext(e.target.value)}
                autoComplete="new-password"
              />
              {next && (
                <p className={`text-[12px] ${nextErr ? "text-ink" : "text-driftwood"}`}>
                  {nextErr ?? "Strong password."}
                </p>
              )}
            </Field>

            {pwError && (
              <p role="alert" className="flex items-center gap-2 text-[14px] text-ink">
                <Alert className="shrink-0 text-[18px] text-driftwood" />
                {pwError}
              </p>
            )}
            {pwNotice && !pwError && (
              <p className="text-[14px] leading-relaxed text-driftwood">{pwNotice}</p>
            )}

            <div>
              <Button type="submit" loading={pwBusy}>
                Update password
              </Button>
            </div>
          </form>
        </Card>

        {/* -- Change email --------------------------------------------------- */}
        <ChangeEmailCard className="flex-1" />
        </div>

        <div className="flex flex-col gap-6">
          {/* -- Sessions ------------------------------------------------------ */}
          <Card className="p-6">
            <p className="t-caption text-driftwood">Sessions</p>
            <p className="mt-3 max-w-[44ch] text-[14px] leading-relaxed text-driftwood">
              Left yourself logged in somewhere? This signs you out on every
              device, including this one.
            </p>
            <div className="mt-4">
              <Button variant="ghost" loading={soBusy} onClick={signOutEverywhere}>
                Sign out everywhere
              </Button>
            </div>
          </Card>

          {/* -- Your data ----------------------------------------------------- */}
          <Card className="p-6">
            <p className="t-caption text-driftwood">Your data</p>
            <p className="mt-3 max-w-[44ch] text-[14px] leading-relaxed text-driftwood">
              Your account details plus every ad’s metadata and video links,
              bundled into one JSON file.
            </p>
            <div className="mt-4">
              <Button variant="ghost" onClick={exportData} disabled={ads === null}>
                <Download className="text-[16px]" />
                Download my data
              </Button>
            </div>
          </Card>

          {/* -- Delete account ------------------------------------------------ */}
          <div className="flex-1 rounded-card border border-ash p-6">
            <p className="t-caption text-driftwood">Delete account</p>
            <p className="mt-3 max-w-[44ch] text-[14px] leading-relaxed text-driftwood">
              Deletes your account and every ad in your library, permanently.
              There is no undo and no grace period.
            </p>
            {!armed ? (
              <button
                type="button"
                onClick={() => setArmed(true)}
                className="mt-4 text-[13px] font-medium text-ink underline-offset-2 transition-colors duration-150 ease-out hover:underline"
              >
                Delete my account…
              </button>
            ) : (
              <form onSubmit={deleteAccount} className="mt-5 flex flex-col gap-5">
                <Field label="Confirm with your password" htmlFor="delete-password">
                  <Input
                    id="delete-password"
                    type="password"
                    required
                    value={delPassword}
                    onChange={(e) => setDelPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </Field>

                {delError && (
                  <p role="alert" className="flex items-center gap-2 text-[14px] text-ink">
                    <Alert className="shrink-0 text-[18px] text-driftwood" />
                    {delError}
                  </p>
                )}

                <div className="flex items-center gap-4">
                  <Button type="submit" loading={delBusy}>
                    Permanently delete
                  </Button>
                  <button
                    type="button"
                    onClick={() => {
                      setArmed(false);
                      setDelPassword("");
                      setDelError(null);
                    }}
                    className="text-[13px] text-driftwood transition-colors duration-150 ease-out hover:text-ink"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
