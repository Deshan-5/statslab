"use client";

import Link from "next/link";

const LINKS: { label: string; href: string }[] = [
  { label: "Privacy Policy",   href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
];

export default function Footer() {
  return (
    <footer className="border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 transition-colors">
      <div className="w-full px-6 md:px-12 py-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-3 text-sm flex-wrap">
          <Link href="/" className="font-medium tracking-tight text-neutral-900 dark:text-neutral-100 hover:opacity-80">
            Stats Lab
          </Link>
          <span className="text-neutral-500 dark:text-neutral-400">© 2026 Stats Lab Inc.</span>
          <span className="text-neutral-500 dark:text-neutral-400">hello@statslab.io</span>
        </div>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-neutral-600 dark:text-neutral-400">
            {LINKS.map((l) => (
              <li key={l.label}>
                <Link href={l.href} className="hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
