import type { Metadata } from "next";
import { DM_Sans, Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-dm-sans",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-inter",
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
