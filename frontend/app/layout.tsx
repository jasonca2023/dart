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
  title: "Dart — Product photo to finished ad, in your browser",
  description:
    "Dart turns a product photo into a short, polished animated ad — AI-written copy, your colours and logo, rendered free in your browser. No editing suite, no render farm.",
  metadataBase: new URL("https://dart-frontend.blink-cursor.workers.dev"),
  applicationName: "Dart",
  openGraph: {
    title: "Dart — Product photo to finished ad",
    description:
      "Upload a product photo. Dart writes the copy, designs a look in your colours, and renders a short animated ad in your browser — then saves it to your library.",
    type: "website",
    siteName: "Dart",
  },
  twitter: {
    card: "summary_large_image",
    title: "Dart — Product photo to finished ad",
    description:
      "A short, polished animated ad from one product photo. Rendered free, in your browser.",
  },
  // Favicon is auto-detected from app/icon.svg (file-convention metadata).
};

export const viewport: Viewport = {
  themeColor: "#fdfcfc",
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
      className={`${bricolage.variable} ${hanken.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <AuthProvider initialUser={data.user}>{children}</AuthProvider>
      </body>
    </html>
  );
}
