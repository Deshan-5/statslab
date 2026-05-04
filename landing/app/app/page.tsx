"use client";

import { Suspense } from "react";
import AppClient from "./AppClient";

export default function AppPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <AppClient />
    </Suspense>
  );
}
