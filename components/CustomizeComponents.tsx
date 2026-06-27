"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  BarChart3, LineChart, ScatterChart, BoxSelect, Grid2x2, Activity,
  Brain, Repeat, Workflow, Clock, Network, TrendingDown, GitBranch,
  Layers, Cpu, ArrowRight,
} from "lucide-react";

const CHARTS = [
  { label: "Bar chart",    tool: "bar-chart",  Icon: BarChart3,    accent: "from-blue-500/20 to-indigo-500/20 dark:from-blue-500/10 dark:to-indigo-500/10",   iconColor: "text-blue-600 dark:text-blue-400" },
  { label: "Line chart",   tool: "line-chart", Icon: LineChart,    accent: "from-emerald-500/20 to-teal-500/20 dark:from-emerald-500/10 dark:to-teal-500/10",  iconColor: "text-emerald-600 dark:text-emerald-400" },
  { label: "Scatter",      tool: "scatter",    Icon: ScatterChart, accent: "from-orange-500/20 to-amber-500/20 dark:from-orange-500/10 dark:to-amber-500/10",  iconColor: "text-orange-600 dark:text-orange-400" },
  { label: "Box plot",     tool: "box-plot",   Icon: BoxSelect,    accent: "from-violet-500/20 to-purple-500/20 dark:from-violet-500/10 dark:to-purple-500/10", iconColor: "text-violet-600 dark:text-violet-400" },
  { label: "Heatmap",      tool: "heatmap",    Icon: Grid2x2,      accent: "from-rose-500/20 to-pink-500/20 dark:from-rose-500/10 dark:to-pink-500/10",        iconColor: "text-rose-600 dark:text-rose-400" },
  { label: "Violin",       tool: "violin",     Icon: Activity,     accent: "from-cyan-500/20 to-sky-500/20 dark:from-cyan-500/10 dark:to-sky-500/10",          iconColor: "text-cyan-600 dark:text-cyan-400" },
];

const STATS_TOOLS = [
  { label: "Bayesian inference",    tool: "bayesian",           Icon: Brain,        accent: "from-purple-500/15 to-fuchsia-500/15 dark:from-purple-500/10 dark:to-fuchsia-500/10", iconColor: "text-purple-600 dark:text-purple-400" },
  { label: "Bootstrap sampling",    tool: "bootstrap-sampling", Icon: Repeat,       accent: "from-orange-500/15 to-red-500/15 dark:from-orange-500/10 dark:to-red-500/10",         iconColor: "text-orange-600 dark:text-orange-400" },
  { label: "Causal inference",      tool: "causal",             Icon: Workflow,     accent: "from-teal-500/15 to-emerald-500/15 dark:from-teal-500/10 dark:to-emerald-500/10",     iconColor: "text-teal-600 dark:text-teal-400" },
  { label: "Time series",           tool: "time-series",        Icon: Clock,        accent: "from-blue-500/15 to-indigo-500/15 dark:from-blue-500/10 dark:to-indigo-500/10",       iconColor: "text-blue-600 dark:text-blue-400" },
  { label: "Logistic regression",   tool: "logistic-regression",Icon: GitBranch,    accent: "from-rose-500/15 to-pink-500/15 dark:from-rose-500/10 dark:to-pink-500/10",          iconColor: "text-rose-600 dark:text-rose-400" },
  { label: "Clustering",            tool: "clustering",         Icon: Layers,       accent: "from-amber-500/15 to-yellow-500/15 dark:from-amber-500/10 dark:to-yellow-500/10",    iconColor: "text-amber-600 dark:text-amber-400" },
  { label: "PCA / Biplot",          tool: "pca",                Icon: Network,      accent: "from-cyan-500/15 to-sky-500/15 dark:from-cyan-500/10 dark:to-sky-500/10",            iconColor: "text-cyan-600 dark:text-cyan-400" },
  { label: "Multiverse analysis",   tool: "multiverse-analysis",Icon: TrendingDown, accent: "from-indigo-500/15 to-violet-500/15 dark:from-indigo-500/10 dark:to-violet-500/10",  iconColor: "text-indigo-600 dark:text-indigo-400" },
];

export default function CustomizeComponents() {
  return (
    <section className="w-full px-6 md:px-12 py-16 md:py-20">
      {/* Charts scrollable row */}
      <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-neutral-500 dark:text-neutral-500 mb-2">Charts</p>
          <h2 className="font-medium tracking-tightest text-3xl md:text-4xl leading-tight text-neutral-900 dark:text-neutral-100">
            Publication-quality charts, <span className="sl-ai-gradient">interactive</span>.
          </h2>
        </div>
        <Link href="/app" className="inline-flex items-center gap-1 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors">
          All tools <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="-mx-6 px-6 overflow-x-auto">
        <div className="flex gap-4 pb-2 min-w-max">
          {CHARTS.map(({ label, tool, Icon, accent, iconColor }, i) => (
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
                aria-label={label}
                className="group block select-none rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 hover:shadow-lg hover:border-neutral-300 dark:hover:border-neutral-700 transition-all"
              >
                <div className={`flex items-center justify-center h-20 rounded-xl bg-gradient-to-br ${accent} border border-neutral-100/50 dark:border-neutral-800/50 transition-all group-hover:scale-[1.03]`}>
                  <Icon className={`w-9 h-9 ${iconColor} transition-transform group-hover:scale-110`} strokeWidth={1.5} />
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{label}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Statistical methods grid */}
      <div className="mt-14">
        <p className="text-xs font-mono uppercase tracking-widest text-neutral-500 dark:text-neutral-500 mb-2">Methods &amp; Models</p>
        <h3 className="font-medium tracking-tightest text-3xl md:text-4xl text-neutral-900 dark:text-neutral-100 mb-8">
          Built for rigorous analysis.
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {STATS_TOOLS.map(({ label, tool, Icon, accent, iconColor }) => (
            <Link
              key={label}
              href={`/app?tool=${tool}`}
              className="group flex items-center gap-3 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-3.5 hover:shadow-md hover:border-neutral-300 dark:hover:border-neutral-700 transition-all"
            >
              <div className={`flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br ${accent} shrink-0`}>
                <Icon className={`w-[18px] h-[18px] ${iconColor}`} strokeWidth={1.6} />
              </div>
              <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100 leading-snug">{label}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
