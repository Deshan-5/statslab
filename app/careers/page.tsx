import Link from "next/link";

export const metadata = { title: "Careers — Stats Lab" };

export default function CareersPage() {
  return (
    <main className="min-h-screen bg-white text-neutral-900">
      <div className="mx-auto max-w-2xl px-6 py-24 md:py-32">
        <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-900">← Back home</Link>
        <h1 className="mt-8 font-medium tracking-tight text-4xl md:text-5xl">Careers</h1>
        <p className="mt-6 text-lg text-neutral-600 leading-relaxed">
          We&apos;re a small team and not actively hiring yet. If you care about teaching
          statistics well — and you build delightful interactive interfaces for people who&apos;d
          rather not read another textbook — we&apos;d love to hear from you anyway.
        </p>
        <p className="mt-4 text-lg text-neutral-600 leading-relaxed">
          Send a short note about what you&apos;ve made to{" "}
          <a href="mailto:hello@statslab.io" className="underline underline-offset-4 hover:text-neutral-900">
            hello@statslab.io
          </a>
          . No résumé needed.
        </p>
        <p className="mt-12 text-sm text-neutral-500">— The Stats Lab team</p>
      </div>
    </main>
  );
}
