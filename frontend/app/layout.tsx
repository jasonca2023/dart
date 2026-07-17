import type { Metadata, Viewport } from "next";
import {
  Bricolage_Grotesque,
  Hanken_Grotesk,
  Space_Grotesk,
  JetBrains_Mono,
} from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase-server";

// Display — a characterful modern grotesque (varied terminals + width) so
// headlines read made, not defaulted.
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-bricolage",
  display: "swap",
});

// Body — warmer + more humanist than Inter, still highly readable at text sizes.
const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-hanken",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Dart · Product photo to finished ad, in your browser",
  description:
    "Dart turns a product photo into a short, polished animated ad: AI-written copy, your colours and logo, rendered free in your browser. No editing suite, no render farm.",
  metadataBase: new URL("https://dart-frontend.blink-cursor.workers.dev"),
  applicationName: "Dart",
  openGraph: {
    title: "Dart · Product photo to finished ad",
    description:
      "Upload a product photo. Dart writes the copy, designs a look in your colours, and renders a short animated ad in your browser, then saves it to your library.",
    type: "website",
    siteName: "Dart",
  },
  twitter: {
    card: "summary_large_image",
    title: "Dart · Product photo to finished ad",
    description:
      "A short, polished animated ad from one product photo. Rendered free, in your browser.",
  },
  // Favicon is auto-detected from app/icon.svg (file-convention metadata).
};

// Browser-chrome color follows the OS scheme; the in-app toggle can diverge
// from it (meta themeColor can't react to a data attribute), which is fine.
// The dark value is the Broadsheet night canvas (oklch(13% 0.012 82) ≈
// #090703) — the old #16161f was the retired Midnight build's blue-grey,
// which matched nothing in the shipped theme.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#090703" },
    { media: "(prefers-color-scheme: light)", color: "#fdfcfc" },
  ],
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Read the signed-in user on the server so the first render is already correct.
  const supabase = await createSupabaseServer();
  const { data } = supabase
    ? await supabase.auth.getUser()
    : { data: { user: null } };

  return (
    <html
      lang="en"
      // The inline script below stamps data-theme before hydration.
      suppressHydrationWarning
      className={`${bricolage.variable} ${hanken.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        {/* No-FOUC theme stamp: saved choice, else light — Dart defaults to
            light regardless of OS scheme; dark is opt-in via the toggle.
            Signed-in only: something in the app-shell's post-hydration
            render clears <html data-theme> a couple hundred ms after this
            script sets it (reproduced — correct at paint, gone by
            ~200ms, landing unaffected). Rather than chase that specific
            React/Next timing, a MutationObserver self-heals it: any time
            the attribute changes to something that doesn't match
            localStorage, re-apply immediately. This can't fight a real
            toggle — ThemeToggle sets the attribute and localStorage
            together, so by the time this (async, microtask-queued)
            callback runs, they already agree and the re-apply is a no-op. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              '(function(){try{var KEY="dart-theme";var apply=function(){var t=localStorage.getItem(KEY);var v=t==="night"?"night":"bloom";if(document.documentElement.dataset.theme!==v){document.documentElement.dataset.theme=v}};apply();new MutationObserver(function(muts){for(var i=0;i<muts.length;i++){if(muts[i].attributeName==="data-theme")apply()}}).observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]})}catch(e){}})()',
          }}
        />
      </head>
      <body>
        <AuthProvider initialUser={data.user}>{children}</AuthProvider>
      </body>
    </html>
  );
}
