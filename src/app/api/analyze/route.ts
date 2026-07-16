import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/sessionStore";
import { runAnalysis } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { sessionId } = await req.json();
    if (typeof sessionId !== "string") {
      return NextResponse.json({ error: "Missing sessionId." }, { status: 400 });
    }

    const session = getSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: "Session not found or expired. Please record again." }, { status: 404 });
    }
    if (!session.mediaFileUri || !session.mediaMimeType) {
      return NextResponse.json({ error: "No media uploaded for this session." }, { status: 400 });
    }

    const analysis = await runAnalysis({ uri: session.mediaFileUri, mimeType: session.mediaMimeType });
    session.analysis = analysis;
    session.messages.push({ role: "model", content: JSON.stringify(analysis), timestamp: Date.now() });

    return NextResponse.json(analysis);
  } catch (err) {
    console.error("[api/analyze] error:", err);
    const message = err instanceof Error ? err.message : "Analysis failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
