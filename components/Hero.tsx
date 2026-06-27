"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import ScatterRegressionDemo from "./demos/ScatterRegressionDemo";
import HeroBackground from "./HeroBackground";

export default function Hero() {
  const [hover, setHover] = useState(false);
  const [show3D, setShow3D] = useState(false);
  const router = useRouter();
  const { status } = useSession();
  const authed = status === "authenticated";
  const labHref = authed ? "/app" : "/signin";
  const toolHref = authed ? "/app?tool=linear-regression" : "/signin";
  const goToTool = () => router.push(toolHref);

  return (
    <section
      id="hero"
      className="relative overflow-hidden min-h-[calc(100vh-4rem)] flex items-center w-full"
    >
      <HeroBackground />

      <div
        className="absolute inset-0 z-[1] pointer-events-none
                   bg-gradient-to-b from-white/40 via-white/0 to-white dark:from-neutral-950/40 dark:via-neutral-950/0 dark:to-neutral-950"
        aria-hidden
      />

      <div className="relative z-10 w-full px-6 md:px-12 py-16 lg:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <div className="flex flex-wrap gap-2 mb-7">
              {["33 Tools", "3D WebGL", "AI Tutor", "Bring Your Data"].map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-full border border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm px-3 py-1 text-xs font-medium text-neutral-600 dark:text-neutral-400"
                >
                  {tag}
                </span>
              ))}
            </div>

            <h1 className="font-medium tracking-tightest text-5xl md:text-7xl leading-[1.02] text-neutral-900 dark:text-neutral-100">
              Statistics.<br />
              AI &amp; ML.<br />
              <span className="sl-ai-gradient font-semibold">
                One interactive lab.
              </span>
            </h1>
            <p className="mt-6 text-xl text-neutral-600 dark:text-neutral-400 max-w-lg leading-relaxed">
              From regression to transformers — 33 tools, real-time 3D visualizations, and an AI tutor. Drop your data and start exploring.
            </p>
            <div className="mt-10 flex items-center gap-4 flex-wrap">
              <Link
                href={labHref}
                prefetch
                className="inline-flex items-center rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-8 py-3 text-base font-medium hover:opacity-90 transition-opacity"
              >
                Enter the Lab
              </Link>
              <Link
                href="#aiml"
                className="text-base text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
              >
                See the 3D tools →
              </Link>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: "easeOut", delay: 0.1 }}
            className="relative"
          >
            <div
              role="link"
              tabIndex={0}
              aria-label="Open Linear Regression in the Lab"
              onClick={goToTool}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  goToTool();
                }
              }}
              onMouseEnter={() => setHover(true)}
              onMouseLeave={() => setHover(false)}
              className="cursor-pointer rounded-2xl border border-neutral-200 dark:border-neutral-800
                         bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md
                         p-3 shadow-sm hover:shadow-md transition-shadow relative max-w-lg ml-auto"
            >
              <ScatterRegressionDemo mode={show3D ? "3d" : "2d"} />

              {/* 3D toggle button */}
              <button
                onClick={(e) => { e.stopPropagation(); setShow3D(v => !v); }}
                onMouseEnter={() => setHover(false)}
                className="absolute top-3 left-4 text-xs font-medium text-neutral-700 dark:text-neutral-300
                           bg-white/90 dark:bg-neutral-900/90 backdrop-blur-sm rounded-full px-3 py-1
                           border border-neutral-200 dark:border-neutral-800
                           hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors z-10"
                aria-label={show3D ? "Switch to 2D view" : "Switch to 3D view"}
              >
                {show3D ? "2D" : "3D"}
              </button>

              {/* Open-in-lab badge */}
              <div
                className={`absolute top-3 right-4 text-xs font-medium text-neutral-700 dark:text-neutral-300
                            bg-white/85 dark:bg-neutral-900/85 backdrop-blur-sm rounded-full px-3 py-1
                            border border-neutral-200 dark:border-neutral-800 transition-opacity pointer-events-none ${
                  hover ? "opacity-100" : "opacity-0"
                }`}
              >
                Open in Lab →
              </div>
            </div>
            <p className="mt-3 text-center text-sm text-neutral-500 dark:text-neutral-400">
              {show3D ? (
                <>Z-axis = residual from the regression line</>
              ) : (
                <>Try dragging the orange dot{" "}<span className="text-orange-500">●</span></>
              )}
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
