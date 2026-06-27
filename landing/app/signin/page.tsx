import { Metadata } from "next";
import { Suspense } from "react";
import SignInClient from "./SignInClient";

export const metadata: Metadata = {
  title: "Sign In — Stats Lab",
  description: "Sign in to Stats Lab to access your statistics workspace and tools.",
};

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white dark:bg-neutral-950" />}>
      <SignInClient />
    </Suspense>
  );
}
