# AgriTwin

A mobile-first PWA that lets a farmer record a short video of their crop patch, analyzes it with the Gemini API, and provides a chat interface with session memory for follow-up questions.

## Requirements

- **Node.js 20 or later.** The `@google/genai` SDK requires Node ≥20. If `node -v` shows 18.x, install a newer Node before running this (e.g. from [nodejs.org](https://nodejs.org) or via `nvm-windows`/`nvm`). `npm install` will still work on Node 18 with warnings, but `npm run dev` may fail or behave unpredictably.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Get a free Gemini API key at [aistudio.google.com](https://aistudio.google.com/apikey).
3. Copy the env file and add your key:
   ```bash
   cp .env.example .env.local
   ```
   Then edit `.env.local`:
   ```
   GEMINI_API_KEY=your-key-here
   ```
4. Run the dev server:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000).

If `GEMINI_API_KEY` is missing, the app shows a clear setup screen instead of crashing.

## Demo on a phone

Camera capture requires HTTPS or `localhost`. To test on an actual phone:

- **Easiest:** deploy to [Vercel](https://vercel.com/new) and open the deployed URL on your phone.
- **Local tunnel:** run `npx ngrok http 3000` and open the `https://...ngrok...` URL on your phone.

## How it works

- **Capture:** `MediaRecorder` records up to 30 seconds from the rear camera (`facingMode: "environment"`), with a `<input type="file" capture="environment">` fallback for browsers where `MediaRecorder` is flaky (iOS Safari).
- **Guardrail:** every upload is classified by a cheap Gemini call before the expensive full analysis runs. Non-agricultural media (people, rooms, pets, etc.) is rejected with a friendly message — see `runGuardrail` in `src/lib/gemini.ts`.
- **Full analysis:** a single Gemini call with structured JSON output (`src/lib/gemini.ts` → `runAnalysis`) returns a health score, a grid-referenced list of issues, and spacing/soil/sunlight assessments.
- **Session memory:** an in-memory `Map` (`src/lib/sessionStore.ts`) stores the uploaded video's Gemini Files API URI, the analysis JSON, and the full chat history per session. Every follow-up chat call replays the video reference + analysis + full message log so answers stay grounded in *this* farm's video (`runChat` in `src/lib/gemini.ts`). Sessions expire after 2 hours; long conversations (20+ turns) get their oldest turns auto-summarized to keep requests small.
- **Storage:** sessions live in server memory only — restarting the dev server clears them. A production build would use Redis or Postgres instead.

## Model name

The model is set via `GEMINI_MODEL` in `.env.example` (default `gemini-flash-latest`, Google's self-updating alias for the current recommended flash-tier model — this avoids hard-coding a version number that later gets deprecated for new accounts). If you see repeated 503 "high demand" errors, it's Google's shared infrastructure being overloaded, not a bug; if you see 404 "no longer available to new users" for a specific model name, that account's been moved to a newer model generation. Check the current list at [ai.google.dev/gemini-api/docs/models](https://ai.google.dev/gemini-api/docs/models) and set `GEMINI_MODEL` in `.env.local` accordingly — no code changes needed.

### Multiple API keys for resilience

Free-tier Gemini API keys have tight daily/per-minute quotas (as low as ~20 requests/day per model on some accounts). Set `GEMINI_API_KEYS` in `.env.local` to a comma-separated list of keys (e.g. from a few teammates' Google accounts) and the app will automatically fall back to the next key when one is rate-limited or out of quota — this happens at upload time, since Gemini's Files API ties an uploaded video to whichever key uploaded it, so all later calls for that session (guardrail, analysis, chat) stay pinned to that same key.

## Manual test checklist

- [ ] A plant/crop video passes the guardrail and produces a dashboard.
- [ ] A non-plant video (e.g. a selfie or a room) is rejected with the detected-subject message.
- [ ] A second chat question correctly references information from the first answer (e.g. ask "What's wrong in grid A2?" then "What will fixing *that* cost?").

## Project structure

```
src/
  app/
    page.tsx               orchestrates capture -> analyzing -> dashboard/chat/rejected
    api/upload/route.ts     upload + guardrail
    api/analyze/route.ts    full analysis
    api/chat/route.ts       chat with session memory
    api/session/[id]/route.ts  restore a session on refresh
    api/config/route.ts     reports whether GEMINI_API_KEY is set
  components/               UI screens (Capture, Analyzing, Dashboard, Chat, Rejection, SetupError)
  lib/
    gemini.ts               Gemini client, prompts, schemas, chat context assembly
    sessionStore.ts         in-memory session Map
    types.ts                shared types
```
