"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function PartnershipBanner() {
  return (
    <div className="mx-auto max-w-7xl px-6 mt-8 flex justify-center">
      <div className="inline-flex items-center gap-3 rounded-full border border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm px-4 py-1.5 text-sm">
        <span className="text-neutral-700 dark:text-neutral-300">
          Made for students, researchers, and analysts
        </span>
        <span className="h-3 w-px bg-neutral-200 dark:bg-neutral-800" />
        <Link
          href="#gallery"
          className="inline-flex items-center gap-1 text-neutral-900 dark:text-neutral-100 font-medium hover:opacity-70 transition-opacity"
        >
          What&apos;s Possible
          <ArrowRight className="w-3.5 h-3.5" strokeWidth={2.25} />
        </Link>
      </div>
    </div>
  );
}
