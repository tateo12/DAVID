import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StitchLayout } from "@/components/stitch/stitch-layout";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-headline",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sentinel Command | AI Governance",
  description:
    "Tactical command interface for AI security, policy enforcement, and threat monitoring.",
  icons: {
    icon: "/shield-icon.svg",
    apple: "/shield-icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      {/*
        Do not add a manual <head> here — in the App Router it can interfere with Next.js
        injecting styles (Tailwind/globals.css), which looks like “no styling”.
        Material Symbols load via @import in globals.css.
      */}
      <body
        className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} min-h-screen bg-background font-body text-on-surface antialiased`}
      >
        <TooltipProvider delayDuration={0}>
          <StitchLayout>{children}</StitchLayout>
        </TooltipProvider>
      </body>
    </html>
  );
}
