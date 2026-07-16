import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/sessionStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession(params.id);
  if (!session) {
    return NextResponse.json({ error: "Session not found or expired." }, { status: 404 });
  }

  // messages[0] is the raw analysis JSON dump used to seed model context
  // (see Section 5 of the design) — the chat UI only wants turns after that.
  const chatMessages = session.analysis ? session.messages.slice(1) : session.messages;

  return NextResponse.json({
    sessionId: session.sessionId,
    guardrailResult: session.guardrailResult,
    analysis: session.analysis,
    messages: chatMessages,
  });
}
