"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

import NormalDistDemo from "./demos/NormalDistDemo";
import LinearRegressionDemo from "./demos/LinearRegressionDemo";
import CLTDemo from "./demos/CLTDemo";
import ConfidenceIntervalDemo from "./demos/ConfidenceIntervalDemo";
import MonteCarloDemo from "./demos/MonteCarloDemo";
import MarkovChainDemo from "./demos/MarkovChainDemo";
import BootstrapDemo from "./demos/BootstrapDemo";
import HypothesisTestDemo from "./demos/HypothesisTestDemo";
import RandomWalkDemo from "./demos/RandomWalkDemo";

const CARDS = [
  { title: "Normal Distribution",   tool: "normal-distribution",   Demo: NormalDistDemo },
  { title: "Linear Regression",     tool: "linear-regression",     Demo: LinearRegressionDemo },
  { title: "Central Limit Theorem", tool: "central-limit-theorem", Demo: CLTDemo },
  { title: "Confidence Intervals",  tool: "confidence-intervals",  Demo: ConfidenceIntervalDemo },
  { title: "Monte Carlo π",         tool: "monte-carlo-pi",        Demo: MonteCarloDemo },
  { title: "Markov Chain",          tool: "markov-chain",          Demo: MarkovChainDemo },
  { title: "Bootstrap Sampling",    tool: "bootstrap-sampling",    Demo: BootstrapDemo },
  { title: "Hypothesis Testing",    tool: "hypothesis-test",       Demo: HypothesisTestDemo },
  { title: "Random Walk",           tool: "random-walk",           Demo: RandomWalkDemo },
];

export default function WhatsPossibleGallery() {
  return (
    <section id="gallery" className="mx-auto max-w-7xl px-6 py-24 md:py-32 scroll-mt-20">
      <div className="flex items-end justify-between flex-wrap gap-6 mb-12">
        <div className="max-w-2xl">
          <h2 className="font-medium tracking-tightest text-4xl md:text-5xl leading-tight text-neutral-900">
            What&apos;s Possible
          </h2>
          <p className="mt-4 text-lg text-neutral-600">
            Interactive visualizations built with Stats Lab.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {CARDS.map(({ title, tool, Demo }, i) => (
          <motion.div
            key={title}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.45, ease: "easeOut", delay: (i % 3) * 0.05 }}
          >
            <Link
              href={`/app?tool=${tool}`}
              className="group relative block rounded-2xl border border-neutral-200 bg-white p-6 hover:shadow-md hover:border-neutral-300 hover:-translate-y-0.5 transition-all cursor-pointer"
              aria-label={`Open ${title} in Stats Lab`}
            >
              <div className="rounded-xl bg-neutral-50/60 border border-neutral-100 overflow-hidden pointer-events-none">
                <Demo />
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="font-medium text-neutral-900">{title}</span>
                <span className="inline-flex items-center gap-1 text-xs text-neutral-500 opacity-0 group-hover:opacity-100 transition-opacity">
                  Open
                  <ArrowRight className="w-3 h-3" />
                </span>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>

      <div className="mt-8 flex justify-end">
        <Link
          href="/app"
          className="inline-flex items-center gap-1 text-sm text-neutral-700 hover:text-neutral-900 transition-colors"
        >
          View more
          <ArrowRight className="w-3.5 h-3.5" strokeWidth={2.25} />
        </Link>
      </div>
    </section>
  );
}
