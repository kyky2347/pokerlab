import type { Metadata, Viewport } from "next";

import { AppShell } from "@/components/app-shell";
import { Providers } from "@/components/providers";

import "./globals.css";

export const metadata: Metadata = {
  applicationName: "PokerLab",
  title: {
    default: "PokerLab — Probability. Strategy. Uncertainty.",
    template: "%s · PokerLab",
  },
  description:
    "A bilingual educational laboratory for poker probability, simulation, decision theory, and game theory.",
  keywords: [
    "poker probability",
    "equity calculator",
    "Monte Carlo simulation",
    "counterfactual regret minimization",
    "poker education",
  ],
  authors: [{ name: "PokerLab contributors" }],
  creator: "PokerLab contributors",
  category: "education",
  robots: { index: true, follow: true },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0c100f",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
