"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  BarChart3, LineChart, ScatterChart, BoxSelect, Grid2x2, Activity,
  Brain, Repeat, Workflow, Clock,
} from "lucide-react";

const COMPONENTS = [
  { label: "Bar chart",    tool: "bar-chart",  Icon: BarChart3 },
  { label: "Line chart",   tool: "line-chart", Icon: LineChart },
  { label: "Scatter",      tool: "scatter",    Icon: ScatterChart },
  { label: "Box plot",     tool: "box-plot",   Icon: BoxSelect },
  { label: "Heatmap",      tool: "heatmap",    Icon: Grid2x2 },
  { label: "Violin",       tool: "violin",     Icon: Activity },
];

const TOOLS = [
  { label: "Bayesian inference", tool: "bayesian",           Icon: Brain },
  { label: "Bootstrap methods",  tool: "bootstrap-sampling", Icon: Repeat },
  { label: "Causal inference",   tool: "causal",             Icon: Workflow },
  { label: "Time series",        tool: "time-series",        Icon: Clock },
];

export default function CustomizeComponents() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-24 md:py-32">
      <h2 className="font-medium tracking-tightest text-4xl md:text-5xl leading-[1.1] text-neutral-900 max-w-3xl">
        Every stat concept, interactive.
      </h2>
      <p className="mt-4 text-lg text-neutral-600 max-w-2xl">
        Charts, models, inference — all in one place. Pick any and start exploring.
      </p>

      <div className="mt-10 -mx-6 px-6 overflow-x-auto">
        <div className="flex gap-4 pb-2 min-w-max">
          {COMPONENTS.map(({ label, tool, Icon }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: i * 0.05 }}
              whileHover={{ y: -4 }}
              className="w-44 shrink-0"
            >
              <Link
                href={`/app?tool=${tool}`}
                aria-label={`${label} component`}
                className="block cursor-grab select-none rounded-2xl border border-neutral-200 bg-white p-5 hover:shadow-md hover:border-neutral-300 transition-all"
              >
                <div className="flex items-center justify-center h-20 rounded-xl bg-neutral-50 border border-neutral-100">
                  <Icon className="w-9 h-9 text-neutral-700" strokeWidth={1.5} />
                </div>
                <div className="mt-3 text-sm font-medium text-neutral-900">{label}</div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="mt-24">
        <h3 className="font-medium tracking-tightest text-3xl md:text-4xl text-neutral-900">
          Built-in tools for accurate analysis.
        </h3>
        <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3">
          {TOOLS.map(({ label, tool, Icon }) => (
            <Link
              key={label}
              href={`/app?tool=${tool}`}
              className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-5 py-4 hover:shadow-sm hover:border-neutral-300 transition-all"
            >
              <Icon className="w-5 h-5 text-neutral-700 shrink-0" strokeWidth={1.6} />
              <span className="text-sm font-medium text-neutral-900">{label}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
