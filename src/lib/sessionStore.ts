import { randomUUID } from "crypto";
import type { FarmSession } from "./types";

const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

// In-memory store. Fine for a hackathon prototype — a production build
// would swap this for Redis/Postgres so sessions survive a server restart
// and work across multiple instances.
const sessions = new Map<string, FarmSession>();

function isExpired(session: FarmSession): boolean {
  return Date.now() - session.lastAccessedAt > SESSION_TTL_MS;
}

export function createSession(): FarmSession {
  const session: FarmSession = {
    sessionId: randomUUID(),
    createdAt: Date.now(),
    lastAccessedAt: Date.now(),
    mediaFileUri: null,
    mediaMimeType: null,
    guardrailResult: null,
    analysis: null,
    messages: [],
  };
  sessions.set(session.sessionId, session);
  return session;
}

export function getSession(sessionId: string): FarmSession | null {
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (isExpired(session)) {
    sessions.delete(sessionId);
    return null;
  }
  session.lastAccessedAt = Date.now();
  return session;
}

export function deleteSession(sessionId: string): void {
  sessions.delete(sessionId);
}
