import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/sessionStore";
import { runChat, summarizeIfNeeded } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { sessionId, question } = await req.json();
    if (typeof sessionId !== "string" || typeof question !== "string" || !question.trim()) {
      return NextResponse.json({ error: "Missing sessionId or question." }, { status: 400 });
    }

    const session = getSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: "Session not found or expired. Please record again." }, { status: 404 });
    }
    if (!session.mediaFileUri || !session.mediaMimeType || !session.analysis) {
      return NextResponse.json({ error: "This farm hasn't been analyzed yet." }, { status: 400 });
    }

    session.messages = await summarizeIfNeeded(session.messages);

    const media = { uri: session.mediaFileUri, mimeType: session.mediaMimeType };
    const answer = await runChat(media, session.analysis, session.messages, question);

    const now = Date.now();
    session.messages.push({ role: "user", content: question, timestamp: now });
    session.messages.push({ role: "model", content: answer, timestamp: now + 1 });

    return NextResponse.json({ answer });
  } catch (err) {
    console.error("[api/chat] error:", err);
    const message = err instanceof Error ? err.message : "The AI is busy, try again in a moment.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
