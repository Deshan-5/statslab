"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

type Bubble = { from: "user" | "bot"; text: string };

const CONVO: Bubble[] = [
  { from: "user", text: "I ran a t-test on my exam scores and got p = 0.061. Should I reject H₀?" },
  { from: "bot",  text: "Close call — your α is 0.05, so technically you don't reject. But before you decide, what's the effect size? A small p doesn't tell you whether the difference matters in practice." },
  { from: "user", text: "Cohen's d came out to 0.42." },
];

export default function LearnSection() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-24 md:py-32">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
        <div>
          <h2 className="font-medium tracking-tightest text-4xl md:text-5xl leading-[1.1] text-neutral-900">
            A new way to learn statistics.
          </h2>
          <p className="mt-6 text-lg text-neutral-600 max-w-xl leading-relaxed">
            Stats Lab watches you work through problems and asks the right questions to deepen your
            understanding — not just give you answers.
          </p>
          <Link
            href="/app?tab=tutor"
            className="mt-8 inline-flex items-center gap-1 text-base text-neutral-900 font-medium hover:opacity-70 transition-opacity"
          >
            Open Tutor
            <ArrowRight className="w-4 h-4" strokeWidth={2.25} />
          </Link>
        </div>

        <Link
          href="/app?tab=tutor"
          className="group relative block rounded-3xl border border-neutral-200 bg-white p-6 md:p-8 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
          aria-label="Open the Tutor in Stats Lab"
        >
          <div className="absolute top-4 right-4 text-xs font-medium text-neutral-700 bg-white/80 backdrop-blur-sm rounded-full px-3 py-1 border border-neutral-200 opacity-0 group-hover:opacity-100 transition-opacity">
            Open Tutor →
          </div>

          <div className="flex items-center gap-2 pb-4 border-b border-neutral-100">
            <span className="text-xs uppercase tracking-wider text-neutral-500">
              Example conversation
            </span>
          </div>

          <div className="mt-5 space-y-3" aria-label="Tutor conversation">
            {CONVO.map((b, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.35, delay: 0.1 + i * 0.12 }}
                className={`flex ${b.from === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    b.from === "user"
                      ? "bg-neutral-900 text-white rounded-br-sm"
                      : "bg-neutral-100 text-neutral-900 rounded-bl-sm"
                  }`}
                >
                  {b.text}
                </div>
              </motion.div>
            ))}

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: 0.6 }}
              className="flex justify-start"
            >
              <div className="bg-neutral-100 rounded-2xl rounded-bl-sm px-4 py-3 inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-neutral-400 animate-bounce [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-neutral-400 animate-bounce [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-neutral-400 animate-bounce" />
              </div>
            </motion.div>
          </div>
        </Link>
      </div>
    </section>
  );
}
