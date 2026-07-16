import type { Metadata, Viewport } from "next";
import { Caveat, Inter, Lora } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

// Warm serif for display headings (landing, welcome moments). Body stays Inter.
const lora = Lora({
  subsets: ["latin"],
  variable: "--font-lora",
});

// Handwritten face for the hero scripture quote only.
const caveat = Caveat({
  subsets: ["latin"],
  variable: "--font-caveat",
});

export const metadata: Metadata = {
  title: "Round",
  description: "AI-facilitated Scripture reading circles",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#16302A",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${lora.variable} ${caveat.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
