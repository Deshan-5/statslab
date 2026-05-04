"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { motion } from "framer-motion";

const TIERS = [
  {
    name: "Academics",
    price: "Free for a limited time",
    description: "Everything you need to study, model and visualize.",
    bullets: ["Unlimited access", "All core features", "Community support"],
    cta: { label: "Get started", href: "#try", filled: true },
  },
  {
    name: "Institutions",
    price: "Let's chat",
    description: "Pilots are free during our beta.",
    bullets: [
      "Everything in Academics",
      "API access",
      "Dedicated support",
      "Embed Stats Lab in your product",
    ],
    cta: { label: "Talk to us", href: "#contact", filled: false },
  },
];

export default function Pricing() {
  return (
    <section id="pricing" className="mx-auto max-w-7xl px-6 py-24 md:py-32">
      <div className="text-center max-w-2xl mx-auto">
        <h2 className="font-medium tracking-tightest text-4xl md:text-5xl leading-[1.1] text-neutral-900">
          Simple, Transparent Pricing.
        </h2>
        <p className="mt-4 text-lg text-neutral-600">
          Stats Lab is currently in beta and free for individuals. For institutions, we&apos;d love
          to run a pilot — free.
        </p>
      </div>

      <div className="mt-14 grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
        {TIERS.map((t, i) => (
          <motion.div
            key={t.name}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.4, delay: i * 0.1 }}
            className="rounded-3xl border border-neutral-200 bg-white p-10 hover:shadow-md transition-shadow"
          >
            <div className="text-xs uppercase tracking-wider text-neutral-500">{t.name}</div>
            <div className="mt-2 font-medium text-3xl tracking-tight text-neutral-900">
              {t.price}
            </div>
            <p className="mt-3 text-neutral-600">{t.description}</p>

            <ul className="mt-8 space-y-3" aria-label={`${t.name} features`}>
              {t.bullets.map((b) => (
                <li key={b} className="flex items-start gap-3 text-neutral-800">
                  <Check className="w-4 h-4 mt-0.5 shrink-0 text-neutral-900" strokeWidth={2.5} />
                  <span>{b}</span>
                </li>
              ))}
            </ul>

            <Link
              href={t.cta.href}
              className={`mt-10 inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-medium transition-colors w-full md:w-auto ${
                t.cta.filled
                  ? "bg-neutral-900 text-white hover:bg-neutral-800"
                  : "border border-neutral-300 text-neutral-900 hover:bg-neutral-50"
              }`}
            >
              {t.cta.label}
            </Link>
          </motion.div>
        ))}
      </div>

      <p className="mt-10 text-center text-sm text-neutral-500">
        Questions? Reach out at{" "}
        <a href="mailto:hello@statslab.io" className="underline underline-offset-4 hover:text-neutral-900">
          hello@statslab.io
        </a>
      </p>
    </section>
  );
}
