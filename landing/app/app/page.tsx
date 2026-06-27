import { Metadata } from "next";
import { Suspense } from "react";
import AppClient from "./AppClient";

export const metadata: Metadata = {
  title: "Lab Workspace — Stats Lab",
  description: "Your interactive statistics workspace. Run regression, hypothesis tests, simulations, and more.",
};

export default function AppPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white dark:bg-neutral-950" />}>
      <AppClient />
    </Suspense>
  );
}
