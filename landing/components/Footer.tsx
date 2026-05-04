"use client";

import Link from "next/link";

const LINKS: { label: string; href: string; external?: boolean }[] = [
  { label: "Contact Us",       href: "mailto:hello@statslab.io", external: true },
  { label: "Careers",          href: "/careers" },
  { label: "Blog",             href: "/blog" },
  { label: "Privacy Policy",   href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
];

export default function Footer() {
  return (
    <footer className="border-t border-neutral-200">
      <div className="mx-auto max-w-7xl px-6 py-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-3 text-sm">
          <Link href="/" className="font-medium tracking-tight text-neutral-900 hover:opacity-80">Stats Lab</Link>
          <span className="text-neutral-500">© 2026 Stats Lab Inc.</span>
        </div>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-neutral-600">
            {LINKS.map((l) => (
              <li key={l.label}>
                {l.external ? (
                  <a
                    href={l.href}
                    rel="noopener noreferrer"
                    className="hover:text-neutral-900 transition-colors"
                  >
                    {l.label}
                  </a>
                ) : (
                  <Link href={l.href} className="hover:text-neutral-900 transition-colors">
                    {l.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
