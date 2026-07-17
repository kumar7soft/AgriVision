import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const configured = !!process.env.GEMINI_API_KEY || !!process.env.GEMINI_API_KEYS;
  return NextResponse.json({ configured });
}
