import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

const SYSTEM_INSTRUCTION = `You are the lead statistician writing the analysis a busy decision-maker will read in under three minutes. The dataset has ALREADY been analysed: the system computed exact descriptive statistics, ran the tests, applied Benjamini–Hochberg FDR correction (q-values), sized every effect, built confidence intervals, chose nonparametric tests where assumptions failed, scored data quality, and — when a target is given — ran a key-driver regression. It then RANKED what matters. Your job is interpretation and clear writing. You never calculate, never decide significance, never re-rank.

NON-NEGOTIABLE RULES
1. Never invent, re-round, or alter a number. Quote the provided means, SDs, r, R², effect sizes, confidence intervals, test statistics, p-values and q-values exactly as given.
2. The DETECTED SIGNALS list is the definitive, complete set of real effects — each already cleared FDR correction (its q-value, not raw p, beat alpha) AND an effect-size threshold. Build findings only from it. Never promote a pattern absent from the list into a finding, and never claim a tested-but-unlisted pair proves "no effect" — it showed "no detectable effect". When a signal reports a q-value, cite q, not just p, so the reader knows it survived multiple-comparison correction.
3. Write for signal, not length. No preamble, no "in conclusion", no restating the prompt, no filler transitions ("it is worth noting", "interestingly", "as we can see"), no emojis, no hedging chains. If a sentence carries no number and no decision, delete it.
4. Separate statistical from practical significance. A tiny p-value on a negligible effect size is not an important finding — say so plainly. Prefer the confidence interval over the bare p-value when stating a magnitude ("groups differ by 12–18 units"), and translate effect sizes into plain language.
5. Be honest about limits only where they actually bite: correlation is not causation; DRIVERS are predictive associations, never proven causes, and collinear predictors split credit; a nonparametric test was used when a variable was skewed — say so; small groups (n<30) reduce confidence.

STYLE
- Plain, exact, confident. Short declarative sentences. Concrete nouns over adjectives.
- Bold the single most decision-relevant number in a sentence with **markdown bold** so it can be scanned. At most one bolded figure per sentence.
- Translate magnitudes for a non-statistician: "a strong positive relationship (r=0.71 explains 50% of the variance)", "the groups differ by about a third of a standard deviation (a small effect)".
- Do not pad section counts. Fewer, denser sections beat many thin ones.

TONE
- "academic": precise, neutral, methods-aware; name the tests. No first person.
- "executive": lead with the decision and the number that drives it; business consequence before mechanism; skip method names unless they change the conclusion.
- "tutor": define each term the first time it matters, in one clause, in the reader's own data ("the p-value — the chance of seeing this pattern if there were truly no relationship").

FOCUS
- "general": brief tour of the strongest distributions, differences, and relationships — depth only where a finding earns it.
- "correlation": relationships between numeric variables; strength, direction, R², and what does NOT correlate.
- "difference": group differences; which groups differ, by how much (effect size), and which do not.
- "distribution": shape, skew, outliers, and normality of key variables, and what that implies for downstream tests.

TARGET MODE
- If a TARGET is given, the report's central question is "what drives <target>?". Lead the findings and one section with the key-driver signal: rank the drivers by standardized β, name the strongest, and state the joint model R² ("these drivers explain 47% of <target>"). Always frame drivers as predictive associations, never causes.

DATA OVERVIEW
- Write "dataOverview": one or two sentences on scale and trustworthiness from the QUALITY block — completeness, duplicate rows, constant/identifier columns. If quality is clean, say so in a single clause and move on. Do not pad.

CHARTS
Optionally embed one chart per section (max 3 total) by adding a "chart" object. Only embed a chart that a specific claim in that section refers to.
- "type": "scatter" (bivariate regression), "bar" (means by category), "box" (distribution by category), or "distribution" (histogram + fitted curve for one column).
- "xCol"/"yCol": must match dataset column names EXACTLY. For "distribution", omit yCol.

Output ONLY valid JSON matching this schema:
{
  "title": string,                         // specific to the data, not "Statistical Report"
  "executiveSummary": string,              // 2–4 sentences; the answer first, no windup
  "dataOverview": string,                  // 1–2 sentences on scale + quality (see DATA OVERVIEW)
  "keyFindings": Array<{
    "finding": string,                     // one scannable sentence, <= 22 words, states direction + magnitude
    "detail": string,                      // the supporting statistics only, <= 14 words (e.g. "r=0.71, p<0.001, n=240")
    "significance": "significant" | "not-significant" | "descriptive"
  }>,                                       // 3–5 items, ordered by importance
  "sections": Array<{
    "title": string,
    "paragraphs": string[],                // 1–2 paragraphs, each <= 70 words
    "chart"?: { "type": "scatter" | "bar" | "box" | "distribution", "xCol": string, "yCol": string }
  }>,                                       // 2–4 sections
  "recommendations": Array<string>,        // 2–4 concrete next actions, each tied to a finding above
  "limitations": Array<string>             // 1–3 honest caveats, each <= 22 words; return [] if none are real
}
`;

export async function POST(req: NextRequest) {
  /* ── 1. Auth check ───────────────────────────────────────────────────── */
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json(
      { error: "You must be signed in to generate a narrative report." },
      { status: 401 }
    );
  }

  /* ── 2. Rate limit (10 requests per minute per user) ─────────────────── */
  const rateLimitKey = `report:${session.user.email ?? "unknown"}`;
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
      { status: 500 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    datasetName,
    rowCount,
    colCount,
    numericColumns,
    categoricalColumns,
    signals,
    coverage,
    quality,
    target,
    focus = "general",
    tone = "academic",
    alpha = 0.05,
  } = body;

  if (!Array.isArray(signals) || !Array.isArray(numericColumns)) {
    return NextResponse.json(
      { error: "Missing or invalid analysis payload ('signals' / 'numericColumns')." },
      { status: 400 }
    );
  }

  // Helper for compact numeric formatting in the roster.
  const fmt = (n: number) => (Number.isFinite(n) ? Number(n.toPrecision(4)).toString() : "n/a");
  const cov = coverage || {};

  // The system has already computed, verified, and RANKED everything. The prompt
  // hands the model a distilled ledger of notable patterns — not raw matrices —
  // so its only job is interpretation and clear writing.
  const signalBlock = signals.length
    ? signals
        .map((s: any, i: number) =>
          `${i + 1}. [${s.kind}] ${s.cols.join(" ~ ")} — ${s.note}. (${s.detail})`
        )
        .join("\n")
    : "NONE — no relationship, difference, or shape pattern cleared the significance and effect-size thresholds.";

  const q = quality || {};
  const qualityBits: string[] = [`completeness ${q.completeness ?? "?"}%`];
  if (q.duplicateRows) qualityBits.push(`${q.duplicateRows} duplicate rows`);
  if (Array.isArray(q.worstMissing) && q.worstMissing.length) qualityBits.push(`most-missing: ${q.worstMissing.map((m: any) => `${m.name} ${m.pct}%`).join(", ")}`);
  if (Array.isArray(q.constantCols) && q.constantCols.length) qualityBits.push(`constant columns: ${q.constantCols.join(", ")}`);
  if (Array.isArray(q.idLikeCols) && q.idLikeCols.length) qualityBits.push(`identifier-like: ${q.idLikeCols.join(", ")}`);

  const prompt = `Write the statistical analysis for the dataset "${datasetName || "Dataset"}".
Report focus: ${focus}. Tone: ${tone}. Significance threshold alpha = ${alpha}.${target ? `\nTARGET: "${target}" — the report's central question is what drives ${target}.` : ""}
Shape: ${rowCount} rows x ${colCount} columns (${numericColumns.length} numeric, ${(categoricalColumns || []).length} categorical).

The system has already run every test, FDR-corrected the p-values (q-values), sized every effect, built confidence intervals, chose nonparametric tests where needed, and RANKED what matters. Interpret the DETECTED SIGNALS below — do not recompute, re-rank, or invent anything beyond them.

QUALITY: ${qualityBits.join("; ")}.

NUMERIC COLUMNS (context and valid chart targets):
${numericColumns.map((c: any) => `- "${c.name}": mean=${fmt(c.mean)}, SD=${fmt(c.sd)}, ${c.shape}`).join("\n")}

CATEGORICAL COLUMNS:
${(categoricalColumns || []).length ? categoricalColumns.map((c: any) => `- "${c.name}": ${c.cardinality} categories`).join("\n") : "- none"}

DETECTED SIGNALS (ranked by importance; each already survived FDR correction and an effect-size threshold; numbers are exact):
${signalBlock}

COVERAGE: ${cov.correlationsTested ?? 0} correlations and ${cov.groupTestsTested ?? 0} group comparisons were tested; after Benjamini–Hochberg correction only the signals above cleared the bar. Everything else showed no detectable effect — you may report that absence as a legitimate negative finding.

TASK: Produce the JSON report.
- Write "dataOverview" from the QUALITY line (scale + trustworthiness), then build every keyFinding and section from the signals above, quoting their exact numbers (cite q-values and confidence intervals, not just p).
${target ? `- Lead with the key-driver signal: rank drivers by standardized β, name the strongest, state the model R², and frame them as predictive associations, not causes.\n` : ""}- If there are no signals, that IS the headline: say plainly that no strong relationships or group differences emerged, and describe the data as stable / weakly structured — do not manufacture findings.
- Distinguish statistical from practical significance using the effect sizes given.
- Only embed a chart where a specific claim points to it (xCol/yCol must match the numeric/categorical column names above exactly).`;

  const genai = new GoogleGenerativeAI(apiKey);
  const model = genai.getGenerativeModel({
    model: process.env.GEMINI_MODEL || "gemini-flash-latest",
    systemInstruction: SYSTEM_INSTRUCTION,
  });

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
      },
    });

    const text = result.response.text();
    // Parse to ensure it's valid JSON
    const parsed = JSON.parse(text);

    return NextResponse.json(parsed, {
      headers: { "X-RateLimit-Remaining": String(rl.remaining) },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: `Gemini report generation failed: ${msg}` }, { status: 500 });
  }
}
