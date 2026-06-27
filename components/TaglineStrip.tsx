"use client";

import { motion } from "framer-motion";

export default function TaglineStrip() {
  return (
    <section className="bg-gradient-to-b from-white via-neutral-50/60 to-white dark:from-neutral-950 dark:via-neutral-900/40 dark:to-neutral-950">
      <div className="w-full px-6 md:px-12 py-14 md:py-20 text-center">
        <motion.h2
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="font-medium tracking-tightest text-4xl md:text-5xl leading-[1.1] text-neutral-900 dark:text-neutral-100 mx-auto max-w-4xl"
        >
          Where classical statistics meets modern AI —{" "}
          <span className="font-serif italic font-semibold sl-ai-gradient">
            and your data bridges both.
          </span>
        </motion.h2>
      </div>
    </section>
  );
}
