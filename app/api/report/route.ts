import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

const SYSTEM_INSTRUCTION = `You are a Senior Research Statistician and Data Analyst.
Your task is to generate a comprehensive, publication-quality Statistical Narrative Report based on a structured summary of a dataset, including computed client-side statistical test results.

RULES:
- Do NOT make up, hallucinate, or change any of the mathematical/statistical values. Use the EXACT numbers, means, p-values, t-stats, and R-values provided in the prompt.
- The report must be highly professional, clinical, objective, and clear. Do not use AI-cliché greetings or emojis.
- Tone guidelines:
  * "academic": Use formal scientific writing style suitable for an academic journal, with detailed interpretations.
  * "executive": Focus heavily on business impact, placing the key takeaways and actionable executive summary at the absolute front.
  * "tutor": Use educational, step-by-step explanations, making sure to define terms like p-value, correlation, and ANOVA in the context of the user's data.
- Focus guidelines:
  * "general": Give a broad exploratory overview covering distributions, group comparisons, and correlations.
  * "correlation": Deep dive into relationships between numerical variables, discussing correlation strengths and linear regressions.
  * "difference": Deep dive into group differences (t-tests, ANOVA) and compare categorical groupings.
  * "distribution": Focus on variable shapes, skewness, outliers, normality, and fitting characteristics.

CHART EMBEDDING RULES:
You can choose to suggest inline charts to embed inside specific sections of the report. The frontend will render interactive SVG charts for you. To suggest a chart, include a 'chart' object inside the section with:
- 'type': Must be one of "scatter" (bivariate regression), "bar" (means by category), "box" (distribution by category), "distribution" (histogram/bell curve of a single column).
- 'xCol': The name of the column for the X-axis (must match one of the column names in the dataset exactly).
- 'yCol': The name of the column for the Y-axis (must match one of the column names in the dataset exactly, except for "distribution" type where yCol is not needed).
Only suggest charts that can be supported by the data columns listed in the prompt context.

Return ONLY a valid JSON object matching the following TypeScript schema:
{
  "title": string,
  "executiveSummary": string,
  "sections": Array<{
    "title": string,
    "paragraphs": string[],
    "chart"?: {
      "type": "scatter" | "bar" | "box" | "distribution",
      "xCol": string,
      "yCol": string
    }
  }>,
  "recommendations": string[]
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
    columns,
    categoricalColumns,
    correlations,
    groupComparisons,
    focus = "general",
    tone = "academic",
    alpha = 0.05,
  } = body;

  if (!columns || !Array.isArray(columns)) {
    return NextResponse.json({ error: "Missing or invalid 'columns' parameter" }, { status: 400 });
  }

  // Construct context prompt for Gemini
  const prompt = `Please write a Statistical Narrative Report for the dataset: "${datasetName || "Dataset"}".

DATASET METADATA:
- Total rows: ${rowCount}
- Total columns: ${colCount}
- Significance level (alpha): ${alpha}
- Report Focus: ${focus}
- Report Tone: ${tone}

NUMERICAL COLUMNS:
${columns.map((c: any) => `- "${c.name}": mean=${c.mean.toFixed(4)}, median=${c.median.toFixed(4)}, SD=${c.sd.toFixed(4)}, Skewness=${c.skewness.toFixed(4)}, Kurtosis=${c.kurtosis.toFixed(4)}, Outlier Count=${c.outlierCount}, Distribution=${c.distributionName || "unknown"}`).join("\n")}

CATEGORICAL COLUMNS:
${(categoricalColumns || []).map((c: any) => `- "${c.name}": Unique Categories=${c.cardinality}`).join("\n")}

${correlations && correlations.length > 0 ? `PRE-COMPUTED PEARSON CORRELATIONS:
${correlations.map((cr: any) => `- "${cr.col1}" vs "${cr.col2}": r=${cr.r.toFixed(4)}, p-value=${cr.pValue.toExponential(4)}`).join("\n")}` : ""}

${groupComparisons && groupComparisons.length > 0 ? `PRE-COMPUTED GROUP COMPARISON TESTS (ANOVA/t-tests):
${groupComparisons.map((gc: any) => `- Numeric "${gc.numericCol}" grouped by "${gc.categoricalCol}": Test=${gc.testName}, statistic=${gc.statistic.toFixed(4)}, p-value=${gc.pValue.toExponential(4)}, df=${JSON.stringify(gc.df)}`).join("\n")}` : ""}

INSTRUCTIONS:
1. Deliver a highly detailed statistical analysis formatted to the JSON schema.
2. Interleave relevant SVG chart suggestions (up to 3 total charts) using the chart objects in sections. Ensure the column names specified in charts match the names in NUMERICAL/CATEGORICAL COLUMNS exactly.
3. Keep the report informative, detailed, and directly tied to the facts. Cite the statistics (e.g. means, p-values, ANOVA stats) directly.`;

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
