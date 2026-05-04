"use client";

import { motion } from "framer-motion";

export default function TaglineStrip() {
  return (
    <section className="border-y border-neutral-200 bg-neutral-50/60">
      <div className="mx-auto max-w-5xl px-6 py-24 md:py-32 text-center">
        <motion.h2
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="font-medium tracking-tightest text-4xl md:text-5xl leading-[1.1] text-neutral-900"
        >
          Bring any dataset or hypothesis to{" "}
          <span className="font-serif italic font-semibold text-neutral-900">
            life
          </span>
          .
        </motion.h2>
      </div>
    </section>
  );
}
