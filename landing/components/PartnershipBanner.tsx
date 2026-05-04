"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function PartnershipBanner() {
  return (
    <div className="mx-auto max-w-7xl px-6 mt-8 flex justify-center">
      <div className="inline-flex items-center gap-3 rounded-full border border-neutral-200 bg-white/80 backdrop-blur-sm px-4 py-1.5 text-sm">
        <span className="text-neutral-700">
          Made for students, researchers &amp; data nerds
        </span>
        <span className="h-3 w-px bg-neutral-200" />
        <Link
          href="#gallery"
          className="inline-flex items-center gap-1 text-neutral-900 font-medium hover:opacity-70 transition-opacity"
        >
          What&apos;s Possible
          <ArrowRight className="w-3.5 h-3.5" strokeWidth={2.25} />
        </Link>
      </div>
    </div>
  );
}
