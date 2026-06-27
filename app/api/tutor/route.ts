/**
 * Professor Probabilis — Gemini-backed tutor endpoint.
 *
 * POST /api/tutor
 *   body: { messages: [{role:"user"|"assistant", content:string}], context?: any }
 *   200:  streaming text/plain
 *   401:  not authenticated
 *   429:  rate limit exceeded
 *   500:  { error: string }
 *
 * Auth:  requires a valid NextAuth session.
 * Reads GOOGLE_API_KEY from env (landing/.env.local locally, platform secrets in prod).
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

type ChatMsg = { role: "user" | "assistant"; content: string };

const SYSTEM = `You are a statistics teaching assistant embedded in an interactive statistics workbench called Stats Lab.

RULES
- Keep answers to 2–3 sentences unless the user asks to elaborate.
- Use plain-text math inline: "z = (x̄ − μ₀) / (σ/√n)".
- Be direct. No filler. No greetings. No "Great question!".
- When context is provided, reference the user's actual numbers.
- Recommend the right test and state WHY in one line.
- For homework problems: show reasoning, not just the answer.
- Stay on topic (statistics/probability). Redirect politely if off-topic.
- Correct misconceptions directly: "p-value is not the probability the null is true."
- INTERACTIVE CONTROLS: If the user asks you to set, change, reset, draw, or update a value or simulation parameter, append a command inside a <command> tag at the very end of your response:
  - Formatted as: <command>{"param": "name", "value": val}</command>
  - Available parameters to set:
    - "n" (sample size: number)
    - "mu0" (null mean: number)
    - "xbar" (sample mean: number)
    - "sigma" (std dev: number)
    - "alpha" (significance: number)
    - "tail" (tail alternative alternative: "two" | "left" | "right")
    - "conf" (confidence level or confounder strength: number)
    - "eff" (true effect: number)
    - "speed" (simulation speed: "slow" | "medium" | "fast" | "manual")
    - "src" (source distribution name: "Normal" | "Uniform" | "Exponential" | "Bimodal" | "Custom")
  - Available trigger parameters:
    - "reset" (resets/clears simulation: true)
    - "draw" (draws one sample: true)
  - You can output multiple <command> tags if multiple changes are requested. Do not explain the tag to the user; just append it quietly.

CONTEXT
You may receive a JSON <context> block with the user's current tool, inputs, and results.
Reference it directly ("Your t = 2.34, df = 29, so …").`;

export async function POST(req: NextRequest) {
  /* ── 1. Auth check ───────────────────────────────────────────────────── */
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json(
      { error: "You must be signed in to use the AI tutor." },
      { status: 401 }
    );
  }

  /* ── 2. Rate limit (20 requests per minute per user) ─────────────────── */
  const rateLimitKey = `tutor:${session.user.email ?? "unknown"}`;
  const rl = await rateLimit(rateLimitKey, { limit: 20, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${rl.retryAfter}s.` },
      {
        status: 429,
        headers: {
          "Retry-After": String(rl.retryAfter),
          "X-RateLimit-Limit": "20",
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  /* ── 3. API key check ────────────────────────────────────────────────── */
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
    const resultStream = await chat.sendMessageStream(userPrompt);
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of resultStream.stream) {
            const text = chunk.text();
            if (text) {
              controller.enqueue(encoder.encode(text));
            }
          }
          controller.close();
        } catch (e) {
          controller.error(e);
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "X-RateLimit-Remaining": String(rl.remaining),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: `Gemini call failed: ${msg}` }, { status: 500 });
  }
}
