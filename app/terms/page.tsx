import Link from "next/link";

export const metadata = { title: "Terms of Service — Stats Lab" };

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-white text-neutral-900">
      <div className="mx-auto max-w-2xl px-6 py-24 md:py-32">
        <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-900">← Back home</Link>
        <h1 className="mt-8 font-medium tracking-tight text-4xl md:text-5xl">Terms of Service</h1>
        <p className="text-sm text-neutral-500 mt-2">Last updated: April 2026</p>

        <p className="mt-6 text-neutral-700 leading-relaxed">
          Stats Lab is in beta. Use it for learning, research, or your own projects. Don&apos;t
          rely on it for clinical, financial, or other high-stakes decisions without an expert
          in the loop — even when the regression line looks beautiful.
        </p>

        <h2 className="mt-10 font-medium text-xl">Account</h2>
        <p className="mt-2 text-neutral-700">
          You&apos;re responsible for the activity in your account. We may revoke access for
          abuse, scraping, or anything that puts other users at risk.
        </p>

        <h2 className="mt-8 font-medium text-xl">Service availability</h2>
        <p className="mt-2 text-neutral-700">
          During the beta we may change features, take the service down for maintenance, or
          introduce paid plans. We&apos;ll give reasonable notice for any breaking changes.
        </p>

        <h2 className="mt-8 font-medium text-xl">Liability</h2>
        <p className="mt-2 text-neutral-700">
          The lab is provided &ldquo;as is&rdquo;. To the extent the law allows, we&apos;re not
          liable for losses arising from its use.
        </p>

        <p className="mt-10 text-sm text-neutral-500">
          A reviewed legal version will replace this before public launch.
        </p>
      </div>
    </main>
  );
}
