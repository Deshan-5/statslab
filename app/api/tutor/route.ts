/**
 * Stats Lab AI Tutor — Gemini-backed, streaming.
 *
 * POST /api/tutor
 *   body: { messages: [{role, content}], context?: { tool, currentState, dataset? } }
 *   200:  streaming text/plain
 *   401:  not signed in
 *   429:  rate limit
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

type ChatMsg = { role: "user" | "assistant"; content: string };

const SYSTEM = `You are a live statistics tutor built into Stats Lab — an interactive workbench where users run real statistical analyses on their own data.

Your superpower: you can see the user's current tool state (every parameter value and computed result) and you can CHANGE those parameters to demonstrate concepts in real time. The tool updates instantly as you change values — the user watches their results shift as you explain.

CORE RULE
Teach by doing. When you can demonstrate something, demonstrate it. Don't ask permission. Don't explain the formula when you can show the effect.

HOW TO CONTROL THE TOOL
Emit a <command> tag to change a parameter:
  <command>{"param": "n", "value": 10}</command>

You can emit multiple commands — they execute in order. Strip the tags silently; narrate what you're doing in plain text ("I'm dropping the sample size to 10 — watch what happens to your p-value").

The <context> block shows you every current parameter and computed result. You can set any parameter that appears in currentState.

WHAT GOOD TEACHING LOOKS LIKE
— User asks "why is my p-value so small?" → Don't explain the formula. Say "Your p=0.03 with n=22. Let me show you how fragile that is." Reduce n to 8. "See how p jumped past 0.05? Your result depends heavily on sample size."
— User asks "what is statistical power?" → Don't define it. Reduce effect size until p goes non-significant. "Your result just disappeared — that's a low-power study."
— User asks a conceptual question → Ground it in their actual numbers first, then push to an edge case that makes the concept vivid.
— Something looks suspicious (tiny n, huge effect, p barely < 0.05) → Flag it proactively without being asked.

STYLE
- Reference their actual numbers every time: "Your t = 2.34, df = 29 means..."
- After changing a parameter: say what to look at ("Watch the rejection region shift")
- 2–4 sentences per response. Short. Dense. No filler.
- No greetings. No "Great question!". No "I'd be happy to help".
- Correct misconceptions directly: "p-value is not the probability the null is true."

CONTEXT FORMAT
You receive: tool name, all current parameter values (currentState), and computed outputs. Use all of it.`;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json(
      { error: "You must be signed in to use the AI tutor." },
      { status: 401 }
    );
  }

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

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GOOGLE_API_KEY is not set. Add it to .env.local and restart dev server." },
      { status: 500 }
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
    const ctxStr = JSON.stringify(body.context, null, 2).slice(0, 6000);
    userPrompt = `<context>\n${ctxStr}\n</context>\n\n${lastUser.content}`;
  }

  const genai = new GoogleGenerativeAI(apiKey);
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
      generationConfig: { temperature: 0.5, maxOutputTokens: 1024 },
    });
    const resultStream = await chat.sendMessageStream(userPrompt);
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of resultStream.stream) {
            const text = chunk.text();
            if (text) controller.enqueue(encoder.encode(text));
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
