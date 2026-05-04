import type { Metadata } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import { ThemeProvider, themeInitScript } from "@/components/ThemeProvider";
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
  "Drop a dataset, see it analyzed instantly across 20+ tools — no AI fluff, " +
  "just statistics. Histograms, regressions, hypothesis tests and more, " +
  "all in your browser.";

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
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
