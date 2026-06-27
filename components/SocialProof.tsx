"use client";

import { motion } from "framer-motion";

const INSTITUTIONS = [
  { name: "Stanford University", short: "Stanford" },
  { name: "MIT", short: "MIT" },
  { name: "Harvard University", short: "Harvard" },
  { name: "UC Berkeley", short: "Berkeley" },
  { name: "University of Cambridge", short: "Cambridge" },
];

export default function SocialProof() {
  return (
    <section className="py-10 bg-neutral-50/50 dark:bg-neutral-900/10 border-y border-neutral-100 dark:border-neutral-900 transition-colors">
      <div className="mx-auto max-w-7xl px-6">
        <p className="text-center text-xs font-semibold tracking-wider text-neutral-400 dark:text-neutral-500 uppercase">
          Empowering learners and researchers at
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-12 gap-y-6 md:gap-x-16">
          {INSTITUTIONS.map((inst, i) => (
            <motion.div
              key={inst.name}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.05 }}
              className="flex items-center gap-2 text-neutral-400 dark:text-neutral-600 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors duration-200 cursor-default"
            >
              {/* Academic graduation cap SVG */}
              <svg className="w-5 h-5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M12 14l9-5-9-5-9 5 9 5z" />
                <path d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
              </svg>
              <span className="font-serif font-semibold text-lg tracking-tight">
                {inst.short}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
