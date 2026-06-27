import Link from "next/link";

export const metadata = { title: "Privacy Policy — Stats Lab" };

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-white text-neutral-900">
      <div className="mx-auto max-w-2xl px-6 py-24 md:py-32 prose prose-neutral">
        <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-900 no-underline">← Back home</Link>
        <h1 className="mt-8 font-medium tracking-tight text-4xl md:text-5xl">Privacy Policy</h1>
        <p className="text-sm text-neutral-500 mt-2">Last updated: April 2026</p>

        <p className="mt-6 text-neutral-700">
          This is a placeholder policy for the Stats Lab beta. A reviewed legal version will
          replace it before public launch.
        </p>

        <h2 className="mt-10 font-medium text-xl">What we collect</h2>
        <p className="mt-2 text-neutral-700">
          The minimum required to sign you in (email or OAuth identifier) and the work you save
          inside the lab. We don&apos;t buy data and we don&apos;t sell yours.
        </p>

        <h2 className="mt-8 font-medium text-xl">Cookies and storage</h2>
        <p className="mt-2 text-neutral-700">
          We use <code>localStorage</code> to keep you signed in across visits. No third-party
          tracking pixels.
        </p>

        <h2 className="mt-8 font-medium text-xl">Contact</h2>
        <p className="mt-2 text-neutral-700">
          Questions about your data? Email{" "}
          <a href="mailto:hello@statslab.io" className="underline underline-offset-4">
            hello@statslab.io
          </a>
          .
        </p>
      </div>
    </main>
  );
}
