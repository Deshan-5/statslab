/**
 * Data Analyzer — Gemini-backed dataset analysis endpoint.
 *
 * POST /api/analyze
 *   body: { stats: object, columns: string[], rowCount: number, sampleRows?: string[][] }
 *   200:  { summary: string, suggestions: {toolId: string, reason: string}[] }
 *   401:  not authenticated
 *   429:  rate limit exceeded
 *   500:  { error: string }
 *
 * Auth:  requires a valid NextAuth session.
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

const SYSTEM = `You are a concise data analyst assistant for Stats Lab, a statistics tool suite.
You receive a JSON summary of a user's dataset — column names, per-column descriptive stats
(mean, median, SD, min, max, skewness, kurtosis, detected distribution), row count, and a few
sample rows.

Your job:
1. Write a SHORT (3-5 sentence) natural-language summary of what this dataset looks like.
   Mention notable patterns: skewness, outlier-prone columns, correlations between columns
   (if correlation data is provided), and likely distributions.
2. Suggest 2-4 specific Stats Lab tools the user should try, chosen from this list:
   - linear-regression (X,Y pairs, trend fitting)
   - normal-distribution (single column, bell curve overlay)
   - central-limit-theorem (sampling behavior)
   - confidence-intervals (estimate population mean)
   - hypothesis-test (compare means, test claims)
   - bootstrap-sampling (resampling CI)
   - scatter (bivariate visualization)
   - bar-chart (group comparison with ANOVA)
   - box-plot (distribution shape, outliers)
   - violin (density shape comparison)
   - heatmap (correlation matrix)
   - time-series (temporal patterns, ACF)
   - bayesian (prior/posterior updating)
   - causal (confounder adjustment)

Return ONLY valid JSON (no markdown fences) in this exact shape:
{
  "summary": "...",
  "suggestions": [
    {"toolId": "...", "reason": "..."},
    ...
  ]
}`;

export async function POST(req: NextRequest) {
  /* ── 1. Auth check ───────────────────────────────────────────────────── */
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json(
      { error: "You must be signed in to use dataset analysis." },
      { status: 401 }
    );
  }

  /* ── 2. Rate limit (10 requests per minute per user) ─────────────────── */
  // Lower limit than /api/tutor since each call processes a full dataset summary.
  const rateLimitKey = `analyze:${session.user.email ?? "unknown"}`;
  const rl = await rateLimit(rateLimitKey, { limit: 10, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${rl.retryAfter}s.` },
      {
        status: 429,
        headers: {
          "Retry-After": String(rl.retryAfter),
          "X-RateLimit-Limit": "10",
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  /* ── 3. API key check ────────────────────────────────────────────────── */
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GOOGLE_API_KEY is not set." },
      { status: 500 },
    );
  }

  let body: { stats?: unknown; columns?: string[]; rowCount?: number; sampleRows?: string[][] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.stats) {
    return NextResponse.json({ error: "Missing stats field" }, { status: 400 });
  }

  const prompt = `Here is a summary of the user's dataset:\n\n${JSON.stringify(body, null, 2).slice(0, 6000)}`;

  const genai = new GoogleGenerativeAI(apiKey);
  const model = genai.getGenerativeModel({
    model: process.env.GEMINI_MODEL || "gemini-flash-latest",
    systemInstruction: SYSTEM,
  });

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
    });

    const text = result.response.text();

    // Try to parse as JSON; if Gemini wraps in markdown fences, strip them
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    try {
      const parsed = JSON.parse(cleaned);
      return NextResponse.json(parsed, {
        headers: { "X-RateLimit-Remaining": String(rl.remaining) },
      });
    } catch {
      // Fallback: return raw text as summary
      return NextResponse.json({
        summary: text,
        suggestions: [],
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: `Gemini call failed: ${msg}` }, { status: 500 });
  }
}
