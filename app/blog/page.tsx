import Link from "next/link";

export const metadata = { title: "Blog — Stats Lab" };

export default function BlogPage() {
  return (
    <main className="min-h-screen bg-white text-neutral-900">
      <div className="mx-auto max-w-2xl px-6 py-24 md:py-32">
        <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-900">← Back home</Link>
        <h1 className="mt-8 font-medium tracking-tight text-4xl md:text-5xl">Blog</h1>
        <p className="mt-6 text-lg text-neutral-600 leading-relaxed">
          We&apos;re writing about how to teach inference without losing students at the word
          &ldquo;asymptotic&rdquo;. First posts up shortly. In the meantime, the lab itself is the
          best demo of what we believe in — small interactive tools that earn their explanations.
        </p>
        <Link
          href="/signin?next=/app"
          className="mt-10 inline-flex rounded-full bg-neutral-900 text-white px-6 py-2.5 text-sm font-medium hover:bg-neutral-800"
        >
          Open the lab
        </Link>
      </div>
    </main>
  );
}
