"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import ThemeToggle from "./ThemeToggle";

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    router.prefetch("/app");
    router.prefetch("/signin");
  }, [router]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("mousedown", onDoc);
    return () => window.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const authed = status === "authenticated";
  const loading = status === "loading";
  const avatar  = session?.user?.image ?? null;
  const userName = session?.user?.name ?? session?.user?.email ?? "Account";
  const initials = (userName?.[0] ?? "A").toUpperCase();

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-200 ${
        scrolled
          ? "bg-white/85 dark:bg-neutral-950/85 backdrop-blur-md border-b border-neutral-200 dark:border-neutral-800"
          : "bg-white dark:bg-neutral-950 border-b border-transparent"
      }`}
    >
      <div className="w-full px-6 md:px-12 h-16 flex items-center justify-between">
        {/* ── Logo ─────────────────────────────────────────────────────── */}
        <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <span className="font-medium tracking-tight text-[1.05rem] text-neutral-900 dark:text-neutral-100">
            Stats Lab
          </span>
          <span className="rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 px-2 py-0.5 text-[10px] font-medium tracking-wider uppercase">
            Beta
          </span>
        </Link>

        {/* ── Middle nav (navigation links) ────────────────────────────── */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-neutral-500 dark:text-neutral-450">
          <Link href="/#gallery" className="hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors">
            Gallery
          </Link>
          <Link href="/#tutor" className="hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors">
            AI Tutor
          </Link>
          <Link href="/blog" className="hover:text-neutral-950 dark:hover:text-white transition-colors">
            Blog
          </Link>
          <Link href="/careers" className="hover:text-neutral-950 dark:hover:text-white transition-colors">
            Careers
          </Link>
        </nav>

        {/* ── Right-side nav ────────────────────────────────────────────── */}
        <nav className="flex items-center gap-3 sm:gap-5">
          <ThemeToggle compact />

          {/*
           * We always reserve fixed-size space for the auth controls to
           * prevent layout shift while the session resolves.
           * "loading" renders an invisible placeholder of identical size.
           */}
          <div className="flex items-center gap-3" aria-live="polite" aria-busy={loading}>

            {loading ? (
              /* Skeleton placeholder — same size as the real controls */
              <>
                <span className="inline-block w-20 h-8 rounded-full bg-neutral-100 dark:bg-neutral-800 animate-pulse" />
                <span className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-neutral-800 animate-pulse shrink-0" />
              </>
            ) : authed ? (
              <>
                {pathname === "/app" && (
                  <button
                    type="button"
                    onClick={() => {
                      const roomId = Math.random().toString(36).substring(2, 9);
                      const url = new URL(window.location.href);
                      url.searchParams.set("room", roomId);
                      navigator.clipboard.writeText(url.toString());
                      alert("Copied multiplayer link to clipboard! Send it to a friend.");
                      router.push(url.pathname + url.search);
                    }}
                    className="hidden sm:inline-flex items-center rounded-full border border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400 px-3 py-1.5 text-xs font-medium hover:bg-orange-500/20 transition-colors"
                  >
                    Collaborate (WebRTC)
                  </button>
                )}
                
                <Link
                  href="/app"
                  prefetch
                  className="inline-flex items-center rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  Open Lab
                </Link>

                {/* Avatar button — explicit dimensions prevent layout shift */}
                <div className="relative" ref={menuRef}>
                  <button
                    type="button"
                    onClick={() => setMenuOpen((v) => !v)}
                    aria-label="Account menu"
                    aria-expanded={menuOpen}
                    aria-haspopup="menu"
                    className="w-8 h-8 rounded-full overflow-hidden border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-800 hover:opacity-90 transition-opacity shrink-0 flex items-center justify-center"
                  >
                    {avatar ? (
                      /*
                       * next/image — replaces bare <img>.
                       * Benefits vs raw <img>:
                       *  • Serves WebP / AVIF automatically
                       *  • Reserves exact 32×32 px bounding box → zero layout shift
                       *  • Lazy-loads by default; `priority` skips LCP penalty since
                       *    the navbar is always above the fold
                       *  • referrerPolicy forwarded via next.config.js remotePatterns
                       */
                      <Image
                        src={avatar}
                        alt={userName}
                        width={32}
                        height={32}
                        priority
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                        unoptimized={
                          /* Google / GitHub profile photos already serve
                             their own optimised variants; skip the Next.js
                             image-optimisation proxy to avoid a second
                             round-trip and a Vercel usage charge. */
                          avatar.includes("googleusercontent.com") ||
                          avatar.includes("avatars.githubusercontent.com")
                        }
                      />
                    ) : (
                      <span className="flex items-center justify-center w-full h-full text-xs font-medium text-neutral-600 dark:text-neutral-300 select-none">
                        {initials}
                      </span>
                    )}
                  </button>

                  {menuOpen && (
                    <div
                      role="menu"
                      className="absolute right-0 mt-2 w-44 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-lg overflow-hidden"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          signOut({ callbackUrl: "/" });
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        Sign out
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <Link
                href="/signin"
                prefetch
                className="inline-flex items-center rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Sign in
              </Link>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
