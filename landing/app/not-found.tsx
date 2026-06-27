import Link from "next/link";

export const metadata = {
  title: "404 - Page Not Found — Stats Lab",
};

export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 px-6 py-24 text-center">
      <div className="max-w-md w-full">
        {/* Large stylized 404 symbol */}
        <div className="inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 font-bold text-4xl mb-8 border border-indigo-100 dark:border-indigo-900/50">
          404
        </div>

        <h1 className="font-semibold tracking-tight text-3xl sm:text-4xl mb-4">
          Out of Distribution
        </h1>

        <p className="text-neutral-600 dark:text-neutral-400 mb-8 leading-relaxed">
          The page you are looking for lies outside our acceptable confidence intervals.
          It may have been moved, renamed, or never existed in this sample.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="rounded-full bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-6 py-3 text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors shadow-sm"
          >
            Back to Home
          </Link>
          <Link
            href="/signin?next=/app"
            className="rounded-full border border-neutral-200 dark:border-neutral-800 px-6 py-3 text-sm font-medium hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
          >
            Open the Lab
          </Link>
        </div>
      </div>
    </main>
  );
}
