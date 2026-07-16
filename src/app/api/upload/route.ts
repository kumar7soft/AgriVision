import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@/lib/sessionStore";
import { uploadMedia, runGuardrail } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 100 * 1024 * 1024; // 100 MB
const MIN_VIDEO_SECONDS = 3;
const GUARDRAIL_CONFIDENCE_THRESHOLD = 0.7;
const SESSION_COOKIE = "agritwin_session";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const durationField = formData.get("durationSeconds");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No media file was provided." }, { status: 400 });
    }
    if (!file.type.startsWith("video/") && !file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Please record or upload a video or photo of your farm." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "That file is too large (max 100 MB)." }, { status: 400 });
    }
    if (file.type.startsWith("video/") && durationField) {
      const duration = Number(durationField);
      if (Number.isFinite(duration) && duration < MIN_VIDEO_SECONDS) {
        return NextResponse.json(
          { error: "That video is too short — please record at least 3 seconds." },
          { status: 400 }
        );
      }
    }

    const session = createSession();

    const media = await uploadMedia(file);
    session.mediaFileUri = media.uri;
    session.mediaMimeType = media.mimeType;

    const guardrailResult = await runGuardrail(media);
    session.guardrailResult = guardrailResult;

    const accepted = guardrailResult.is_agricultural && guardrailResult.confidence >= GUARDRAIL_CONFIDENCE_THRESHOLD;

    if (!accepted) {
      console.log("[guardrail] rejected upload:", guardrailResult);
      const res = NextResponse.json(
        {
          rejected: true,
          detected_subject: guardrailResult.detected_subject,
          reason: guardrailResult.reason,
        },
        { status: 422 }
      );
      res.cookies.set(SESSION_COOKIE, session.sessionId, { httpOnly: true, sameSite: "lax", path: "/" });
      return res;
    }

    const res = NextResponse.json({ sessionId: session.sessionId, accepted: true });
    res.cookies.set(SESSION_COOKIE, session.sessionId, { httpOnly: true, sameSite: "lax", path: "/" });
    return res;
  } catch (err) {
    console.error("[api/upload] error:", err);
    const message = err instanceof Error ? err.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
