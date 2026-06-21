import type { Metadata, Viewport } from "next";
import { Inter, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/shell/app-shell";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-heading",
  display: "swap",
});

export const metadata: Metadata = {
  title: "UrbanPulse AI — Traffic Intelligence",
  description:
    "Real-time traffic intelligence and ML-driven decision support for the Bengaluru Traffic Police.",
  applicationName: "UrbanPulse AI",
  authors: [{ name: "ASTraM Intelligence" }],
  icons: { icon: "/favicon.ico" },
};

export const viewport: Viewport = {
  themeColor: "#16130E",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${inter.variable} ${geistMono.variable} ${instrumentSerif.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
