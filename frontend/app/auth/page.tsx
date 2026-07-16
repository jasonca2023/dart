import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { Orb } from "@/components/ui/Orb";
import { AuthForm } from "@/components/app/AuthForm";
import { TONE_ACCENTS } from "@/lib/adSpec";

export const metadata = {
  title: "Sign in · Dart",
};

// /auth = log in · /auth?mode=signup = create an account. The two entries get
// clearly distinct headings and copy inside AuthForm.
export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  return (
    <div className="app-canvas grid min-h-screen bg-parchment lg:grid-cols-2">
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
            One photo. One finished ad.
          </h2>
          <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-driftwood">
            Sign in to turn a product photo into a finished ad, rendered in your
            browser and saved to your library.
          </p>
        </div>
        <span aria-hidden />
      </aside>

      {/* Form */}
      <main className="flex flex-col items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <AuthForm initialMode={mode === "signup" ? "signup" : "signin"} />
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
