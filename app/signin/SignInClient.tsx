"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import ThemeToggle from "@/components/ThemeToggle";
import { Github } from "lucide-react";

const CELL = 30;
const HIGHLIGHT_RADIUS = 150;

export default function SignInClient({ githubEnabled = false }: { githubEnabled?: boolean }) {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/app";

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const isCoarse =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(pointer: coarse)").matches;

    let width = 0;
    let height = 0;

    let gridPath = new Path2D();

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Pre-calculate the grid path once on resize for extreme performance
      gridPath = new Path2D();
      for (let x = 0; x <= width; x += CELL) {
        gridPath.moveTo(Math.floor(x) + 0.5, 0);
        gridPath.lineTo(Math.floor(x) + 0.5, height);
      }
      for (let y = 0; y <= height; y += CELL) {
        gridPath.moveTo(0, Math.floor(y) + 0.5);
        gridPath.lineTo(width, Math.floor(y) + 0.5);
      }
    };

    const tick = (time: number) => {
      ctx.clearRect(0, 0, width, height);
      const isDark = document.documentElement.classList.contains("dark");

      // --- 1. The Autonomous Carpet Wave ---
      const waveSpeed = 0.13; // smooth speed
      const waveBand = 400; // total height of the wave glow
      const waveSpacing = 1000; // consistent spacing
      
      const totalOffset = (time * waveSpeed) % waveSpacing;
      
      // We calculate y starting from the bottom + offset and go upwards
      let y = (height + waveBand) - totalOffset;
      
      while (y > -waveBand) {
        const waveGrad = ctx.createLinearGradient(0, y - waveBand / 2, 0, y + waveBand / 2);
        if (isDark) {
          waveGrad.addColorStop(0, "rgba(99, 102, 241, 0)");
          waveGrad.addColorStop(0.5, "rgba(99, 102, 241, 0.45)");
          waveGrad.addColorStop(1, "rgba(99, 102, 241, 0)");
        } else {
          waveGrad.addColorStop(0, "rgba(79, 70, 229, 0)");
          waveGrad.addColorStop(0.5, "rgba(79, 70, 229, 0.25)");
          waveGrad.addColorStop(1, "rgba(79, 70, 229, 0)");
        }

        ctx.strokeStyle = waveGrad;
        ctx.lineWidth = 1;
        ctx.stroke(gridPath);
        
        y -= waveSpacing;
      }

      // --- 2. The Interactive Mouse Glow ---
      const mouse = mouseRef.current;
      if (mouse && !isCoarse) {
        const mouseGrad = ctx.createRadialGradient(
          mouse.x, mouse.y, 0,
          mouse.x, mouse.y, HIGHLIGHT_RADIUS
        );

        if (isDark) {
          mouseGrad.addColorStop(0, "rgba(99, 102, 241, 0.6)");
          mouseGrad.addColorStop(0.4, "rgba(99, 102, 241, 0.2)");
          mouseGrad.addColorStop(1, "rgba(99, 102, 241, 0)");
        } else {
          mouseGrad.addColorStop(0, "rgba(79, 70, 229, 0.4)");
          mouseGrad.addColorStop(0.4, "rgba(79, 70, 229, 0.12)");
          mouseGrad.addColorStop(1, "rgba(79, 70, 229, 0)");
        }

        ctx.strokeStyle = mouseGrad;
        // Make the two glows beautifully overlap
        ctx.globalCompositeOperation = "screen";
        ctx.stroke(gridPath);
        ctx.globalCompositeOperation = "source-over"; // reset
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    let lastMove = 0;
    const onMove = (e: MouseEvent) => {
      const now = performance.now();
      // debounce ~16ms
      if (now - lastMove < 16) return;
      lastMove = now;
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onLeave = () => {
      mouseRef.current = null;
    };

    const onResize = () => resize();

    resize();
    rafRef.current = requestAnimationFrame(tick);
    window.addEventListener("resize", onResize);
    if (!isCoarse) {
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseleave", onLeave);
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  return (
    <main className="min-h-screen relative bg-white dark:bg-neutral-950 overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none w-full h-full"
        aria-hidden
      />

      {/* Top centered pill */}
      <div className="relative z-10 pt-8 flex justify-center items-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-3 rounded-full border border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/70 backdrop-blur-md px-4 py-1.5 animate-fade-in"
        >
          <span className="font-medium tracking-tight text-sm text-neutral-900 dark:text-neutral-100">
            Stats Lab
          </span>
          <span className="rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 px-2 py-0.5 text-[10px] font-medium tracking-wider uppercase">
            Beta
          </span>
        </Link>
        <ThemeToggle compact />
      </div>

      {/* Center content */}
      <div className="relative z-10 mx-auto max-w-xl px-6 pt-24 md:pt-32 pb-32 flex flex-col items-center text-center">
        <h1 className="text-5xl md:text-6xl font-medium text-indigo-400">
          Sign In
        </h1>

        <button
          type="button"
          onClick={() => signIn("google", { callbackUrl })}
          className="mt-10 inline-flex items-center gap-3 rounded-full border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-6 py-3 text-sm font-medium text-neutral-900 dark:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors shadow-sm w-full justify-center max-w-xs"
        >
          <GoogleG className="w-5 h-5" />
          Continue with Google
        </button>

        {githubEnabled && (
          <button
            type="button"
            onClick={() => signIn("github", { callbackUrl })}
            className="mt-3 inline-flex items-center gap-3 rounded-full border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-6 py-3 text-sm font-medium text-neutral-900 dark:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors shadow-sm w-full justify-center max-w-xs"
          >
            <Github className="w-5 h-5" />
            Continue with GitHub
          </button>
        )}

        {/* Developer bypass — only rendered when NEXT_PUBLIC_ENABLE_DEV_AUTH=true (local dev only) */}
        {process.env.NEXT_PUBLIC_ENABLE_DEV_AUTH === "true" && (
          <button
            type="button"
            onClick={() => signIn("credentials", { email: "dev@statslab.io", name: "Guest User", callbackUrl })}
            className="mt-3 inline-flex items-center gap-3 rounded-full border border-dashed border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/30 px-6 py-3 text-sm font-medium text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950/60 transition-colors shadow-sm w-full justify-center max-w-xs"
          >
            ⚠ Dev bypass — local only
          </button>
        )}

        <p className="mt-8 max-w-sm text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
          By signing in you agree to our{" "}
          <Link
            href="/terms"
            className="underline underline-offset-2 hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            Terms
          </Link>{" "}
          and{" "}
          <Link
            href="/privacy"
            className="underline underline-offset-2 hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            Privacy Policy
          </Link>
          .
        </p>
      </div>

    </main>
  );
}

function GoogleG({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 8.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}
