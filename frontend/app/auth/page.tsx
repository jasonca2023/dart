import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { Orb } from "@/components/ui/Orb";
import { AuthForm } from "@/components/app/AuthForm";
import { TONE_ACCENTS } from "@/lib/adSpec";

export const metadata = {
  title: "Sign in — Dart",
};

export default function AuthPage() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <aside className="relative hidden flex-col justify-between bg-sand p-12 lg:flex">
        <Logo />
        <div>
          <div className="mb-10 flex gap-6">
            <Orb accent={TONE_ACCENTS.luxe} className="size-20" />
            <Orb accent={TONE_ACCENTS.techy} className="size-20" />
            <Orb accent={TONE_ACCENTS.energetic} className="size-20" />
          </div>
          <h2 className="t-heading-lg max-w-[14ch]">
            One product link. One cinematic ad.
          </h2>
          <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-driftwood">
            Sign in to launch a job, watch it render, and export — all from one
            quiet dashboard.
          </p>
        </div>
        <p className="font-mono text-[12px] text-fog">
          People in generated ads are synthetic.
        </p>
      </aside>

      {/* Form */}
      <main className="flex flex-col items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h1 className="t-heading">Sign in to Dart</h1>
          <p className="mt-2 text-[15px] text-driftwood">
            New here? Continuing makes your workspace.
          </p>
          <div className="mt-8">
            <AuthForm />
          </div>
          <p className="mt-8 text-center text-[13px] text-driftwood">
            <Link
              href="/"
              className="transition-colors duration-150 ease-out hover:text-ink"
            >
              ← Back to home
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
