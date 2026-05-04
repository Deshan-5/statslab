"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    router.prefetch("/app");
  }, [router]);

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-200 ${
        scrolled
          ? "bg-white/85 backdrop-blur-md border-b border-neutral-200"
          : "bg-white border-b border-transparent"
      }`}
    >
      <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <span className="font-medium tracking-tight text-[1.05rem] text-neutral-900">Stats Lab</span>
          <span className="rounded-full bg-neutral-100 text-neutral-500 px-2 py-0.5 text-[10px] font-medium tracking-wider uppercase">
            Beta
          </span>
        </Link>

        <nav className="flex items-center gap-3 sm:gap-5">
          <a
            href="mailto:hello@statslab.io"
            className="hidden sm:inline text-sm text-neutral-600 hover:text-neutral-900 transition-colors"
          >
            Talk to us
          </a>
          <Link
            href="/app"
            prefetch
            className="inline-flex items-center rounded-full bg-neutral-900 text-white px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Open Lab
          </Link>
        </nav>
      </div>
    </header>
  );
}
