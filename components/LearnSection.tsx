"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, FileText, BarChart3, Brain } from "lucide-react";

// Simulated narrative report cards the AI tutor generates on a dataset
const INSIGHTS = [
  {
    icon: BarChart3,
    label: "Distribution detected",
    text: "Salary is right-skewed (skewness = 1.82). Consider a log-transform before running regression.",
    color: "text-indigo-600 dark:text-indigo-400",
    bg: "bg-indigo-500/8 border-indigo-500/20",
    delay: 0.1,
  },
  {
    icon: Brain,
    label: "Correlation found",
    text: "YearsExperience and Salary share Pearson r = 0.86 (p < 0.001). This is your strongest predictor.",
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/8 border-emerald-500/20",
    delay: 0.22,
  },
  {
    icon: FileText,
    label: "Suggested test",
    text: "3 departments with n > 30 each. Run one-way ANOVA to test whether mean salary differs by department.",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/8 border-amber-500/20",
    delay: 0.34,
  },
];

export default function LearnSection() {
  return (
    <section id="data" className="w-full px-6 md:px-12 py-16 md:py-24 scroll-mt-20">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
        {/* Left: copy */}
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-neutral-500 dark:text-neutral-500 mb-3">
            Bring Your Own Data
          </p>
          <h2 className="font-medium tracking-tightest text-4xl md:text-5xl leading-[1.1] text-neutral-900 dark:text-neutral-100">
            Drop a CSV.{" "}
            <span className="sl-ai-gradient">Get instant analysis.</span>
          </h2>
          <p className="mt-6 text-lg text-neutral-600 dark:text-neutral-400 max-w-xl leading-relaxed">
            The moment your dataset lands, Stats Lab auto-detects column types, flags distribution issues,
            surfaces correlations, and recommends the right statistical tests — with an AI tutor ready to explain every finding.
          </p>
          <ul className="mt-6 space-y-2.5">
            {[
              "CSV / TSV drop zone with instant parsing",
              "Auto-detected column types and quality flags",
              "Smart test suggestions based on your data shape",
              "AI Tutor generates a narrative report on demand",
              "Dataset persists across all 33 tools in the lab",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-neutral-700 dark:text-neutral-300">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-neutral-400 dark:bg-neutral-600 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
          <Link
            href="/app"
            className="mt-8 inline-flex items-center gap-1.5 text-base text-neutral-900 dark:text-neutral-100 font-medium hover:opacity-70 transition-opacity"
          >
            Open the Lab
            <ArrowRight className="w-4 h-4" strokeWidth={2.25} />
          </Link>
        </div>

        {/* Right: simulated AI narrative report */}
        <Link
          href="/app"
          className="group relative block rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 md:p-8 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
          aria-label="Open Stats Lab to analyze your data"
        >
          <div className="absolute top-4 right-4 text-xs font-medium text-neutral-700 dark:text-neutral-300 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-full px-3 py-1 border border-neutral-200 dark:border-neutral-800 opacity-0 group-hover:opacity-100 transition-opacity">
            Open Lab →
          </div>

          {/* Dataset header */}
          <div className="flex items-center gap-3 pb-4 border-b border-neutral-100 dark:border-neutral-800">
            <div className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded font-mono text-[11px] text-neutral-600 dark:text-neutral-400">
              employees.csv
            </div>
            <span className="text-xs text-neutral-500 dark:text-neutral-500">500 rows · 8 columns</span>
            <span className="ml-auto text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              Analyzed
            </span>
          </div>

          {/* Column chips */}
          <div className="mt-4 flex flex-wrap gap-1.5">
            {[
              { name: "Age", type: "numeric" },
              { name: "Salary", type: "numeric" },
              { name: "Department", type: "categorical" },
              { name: "YearsExp", type: "numeric" },
              { name: "Gender", type: "categorical" },
            ].map(({ name, type }) => (
              <span
                key={name}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium border ${
                  type === "numeric"
                    ? "bg-blue-500/8 text-blue-600 dark:text-blue-400 border-blue-500/20"
                    : "bg-violet-500/8 text-violet-600 dark:text-violet-400 border-violet-500/20"
                }`}
              >
                {name}
              </span>
            ))}
          </div>

          {/* Insight cards generated by AI tutor */}
          <div className="mt-5 space-y-3">
            {INSIGHTS.map(({ icon: Icon, label, text, color, bg, delay }) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.35, delay }}
                className={`flex items-start gap-3 rounded-xl border p-3 ${bg}`}
              >
                <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${color}`} />
                <div>
                  <p className={`text-[10px] font-bold uppercase tracking-wide mb-0.5 ${color}`}>{label}</p>
                  <p className="text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed">{text}</p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Typing indicator */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.35, delay: 0.5 }}
            className="mt-3 flex items-center gap-2 text-[11px] text-neutral-500 dark:text-neutral-500"
          >
            <div className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-neutral-400 dark:bg-neutral-500 animate-bounce [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 rounded-full bg-neutral-400 dark:bg-neutral-500 animate-bounce [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 rounded-full bg-neutral-400 dark:bg-neutral-500 animate-bounce" />
            </div>
            AI Tutor generating narrative report...
          </motion.div>
        </Link>
      </div>
    </section>
  );
}
