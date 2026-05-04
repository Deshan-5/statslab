/**
 * Professor Probabilis — Gemini-backed tutor endpoint.
 *
 * POST /api/tutor
 *   body: { messages: [{role:"user"|"assistant", content:string}], context?: any }
 *   200:  { reply: string }
 *   500:  { error: string }
 *
 * Reads GOOGLE_API_KEY from env (landing/.env.local locally, platform secrets in prod).
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type ChatMsg = { role: "user" | "assistant"; content: string };

const SYSTEM = `You are Professor Probabilis, a friendly statistics teaching assistant for an
undergraduate probability and statistics course. You help students understand probability
distributions, hypothesis testing, confidence intervals, Bayesian inference, regression,
combinatorics, and the math behind them.

GUIDELINES
- Be warm, concise, and pedagogical. Prefer 4–8 sentences per answer unless asked to elaborate.
- Use plain text math; if a formula helps, write it inline like "z = (x̄ − μ₀) / (σ/√n)" and
  briefly name each symbol.
- When the student is on a page with computed results, ground your answer in their numbers.
- Recommend which test or distribution fits their data, then explain WHY in one paragraph.
- For homework-style problems: walk through the reasoning so the student learns; don't just
  give a final answer with no explanation.
- If a question is outside statistics/probability, politely redirect.
- Praise good intuition. Gently correct misconceptions
  (e.g. "p-value is NOT the probability the null is true").

CONTEXT
On each turn you may receive a JSON <context> block describing the user's current tool name,
group, blurb, and (when available) widget inputs and last computed result. Use it to anchor
your reply ("Your t-statistic is 2.34, df=29, so …").`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "GOOGLE_API_KEY is not set. Add it to landing/.env.local and restart `npm run dev`.",
      },
      { status: 500 },
    );
  }

  let body: { messages?: ChatMsg[]; context?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const lastUser = messages[messages.length - 1];
  if (!lastUser || lastUser.role !== "user" || !lastUser.content?.trim()) {
    return NextResponse.json({ error: "Last message must be a non-empty user turn" }, { status: 400 });
  }

  let userPrompt = lastUser.content;
  if (body.context) {
    const ctxStr = JSON.stringify(body.context).slice(0, 4000);
    userPrompt = `<context>\n${ctxStr}\n</context>\n\n${lastUser.content}`;
  }

  const genai = new GoogleGenerativeAI(apiKey);
  // `gemini-flash-latest` auto-tracks the current production flash model, so
  // we don't have to update this when Google retires older versions.
  // Override via GEMINI_MODEL env if you want to pin (e.g. "gemini-2.5-flash").
  const model = genai.getGenerativeModel({
    model: process.env.GEMINI_MODEL || "gemini-flash-latest",
    systemInstruction: SYSTEM,
  });

  const history = messages.slice(0, -1).map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.content }],
  }));

  try {
    const chat = model.startChat({
      history,
      generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
    });
    const result = await chat.sendMessage(userPrompt);
    const text = result.response.text();
    return NextResponse.json({ reply: text || "(no response)" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: `Gemini call failed: ${msg}` }, { status: 500 });
  }
}
