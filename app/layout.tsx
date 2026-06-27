import type { Metadata } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import { ThemeProvider, themeInitScript } from "@/components/ThemeProvider";
import Providers from "./providers";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const serif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-source-serif",
  display: "swap",
});

const SITE = "https://statslab.io";
const TITLE = "Stats Lab — Interactive Statistics Workbench";
const DESCRIPTION =
  "Drop a CSV. See it analyzed across 22 statistical tools — distributions, " +
  "regression, hypothesis tests, Bayesian, causal, time series. " +
  "No install. No paywall.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "statistics", "data visualization", "probability",
    "hypothesis testing", "Bayesian", "Monte Carlo", "regression",
    "CSV analysis", "interactive workbench",
  ],
  openGraph: {
    title: TITLE, description: DESCRIPTION, url: SITE,
    siteName: "Stats Lab", type: "website", locale: "en_US",
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${serif.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="font-sans bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 selection:bg-amber-200 transition-colors">
        <Providers>
          <ThemeProvider>{children}</ThemeProvider>
        </Providers>
      </body>
    </html>
  );
}
