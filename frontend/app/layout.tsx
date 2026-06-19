import type { Metadata } from "next";
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
  title: "Dart — One product link. One cinematic ad.",
  description:
    "Dart is an autonomous ad factory. Paste a product URL and get a 4K cinematic commercial featuring a virtual human with your real product. No actors, no editing, no delays.",
  metadataBase: new URL("https://dart.example"),
  openGraph: {
    title: "Dart — One product link. One cinematic ad.",
    description:
      "Paste a product URL. Dart scrapes it, writes the script, and renders a 4K ad. Review and export.",
    type: "website",
  },
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
