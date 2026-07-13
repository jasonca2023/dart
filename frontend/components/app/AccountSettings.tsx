"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { API_BASE, ApiError, getAccessToken, postJson } from "@/lib/api";
import { PASSWORD_REQ, passwordError } from "@/lib/password";
import { Field, Input } from "../ui/Field";
import { Button } from "../ui/Button";
import { Alert } from "../icons";

function errMsg(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

// Change password + delete account. Both re-confirm the current password on
// the backend, so a stolen open tab can't quietly do either.
export function AccountSettings() {
  const { user, signOut } = useAuth();
  const router = useRouter();

  // -- change password ----
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwNotice, setPwNotice] = useState<string | null>(null);
  const nextErr = passwordError(next);

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
      if (err instanceof ApiError && err.code === "unauthorized") {
        setPwError("Your session expired — log in again.");
      } else {
        setPwError(errMsg(err, "Couldn’t update the password."));
      }
    } finally {
      setPwBusy(false);
    }
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
    <div className="max-w-md">
      <h1 className="t-heading">Account</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-driftwood">
        Signed in as <span className="font-medium text-ink">{user?.email}</span>.
      </p>

      {/* -- Change password -------------------------------------------------- */}
      <section className="mt-10 border-t border-ash pt-6">
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
      </section>

      {/* -- Delete account --------------------------------------------------- */}
      <section className="mt-10 border-t border-ash pt-6">
        <p className="t-caption text-driftwood">Delete account</p>
        <p className="mt-3 max-w-[44ch] text-[14px] leading-relaxed text-driftwood">
          Deletes your account and every ad in your library, permanently. There
          is no undo and no grace period.
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
            <Field
              label="Confirm with your password"
              htmlFor="delete-password"
            >
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
      </section>
    </div>
  );
}
