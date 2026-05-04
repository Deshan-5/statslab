"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import ScatterRegressionDemo from "./demos/ScatterRegressionDemo";
import HeroBackground from "./HeroBackground";

export default function Hero() {
  const [hover, setHover] = useState(false);
  const router = useRouter();
  const goToTool = () => router.push("/app?tool=linear-regression");

  return (
    <section
      id="hero"
      className="relative overflow-hidden"
    >
      {/* Reactive scatter + grid + regression line behind everything */}
      <HeroBackground />

      {/* Soft fade so the headline reads cleanly even over busy regions */}
      <div
        className="absolute inset-0 z-[1] pointer-events-none
                   bg-gradient-to-b from-white/40 via-white/0 to-white"
        aria-hidden
      />

      <div className="relative z-10 mx-auto max-w-7xl px-6 pt-12 md:pt-20 pb-24 md:pb-32">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <h1 className="font-medium tracking-tightest text-5xl md:text-7xl leading-[1.02] text-neutral-900">
              Drop data.{" "}
              <span className="sl-ai-gradient font-semibold">
                Get statistical insights.
              </span>{" "}
              No install.
            </h1>
            <p className="mt-6 text-xl text-neutral-600 max-w-lg leading-relaxed">
              CSV in, analysis out. Runs entirely in the browser.
            </p>
            <div className="mt-10 flex items-center gap-4 flex-wrap">
              <Link
                href="/app"
                prefetch
                className="inline-flex items-center rounded-full bg-neutral-900 text-white px-8 py-3 text-base font-medium hover:opacity-90 transition-opacity"
              >
                Open Lab
              </Link>
              <Link
                href="#gallery"
                className="text-base text-neutral-600 hover:text-neutral-900 transition-colors"
              >
                See what&apos;s possible →
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
              className="cursor-pointer rounded-3xl border border-neutral-200
                         bg-white/80 backdrop-blur-md
                         p-4 shadow-sm hover:shadow-md transition-shadow relative"
            >
              <ScatterRegressionDemo />
              <div
                className={`absolute top-3 right-4 text-xs font-medium text-neutral-700
                            bg-white/85 backdrop-blur-sm rounded-full px-3 py-1
                            border border-neutral-200 transition-opacity ${
                  hover ? "opacity-100" : "opacity-0"
                }`}
              >
                Open in Lab →
              </div>
            </div>
            <p className="mt-3 text-center text-sm text-neutral-500">
              Try dragging the orange dot{" "}
              <span className="text-orange-500">●</span>
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
