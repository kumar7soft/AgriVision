import { GoogleGenAI, Type, FileState, ApiError, MediaResolution, createUserContent, createPartFromUri, createPartFromText, type Schema, type Content } from "@google/genai";
import type { GuardrailResult, FarmAnalysis, SessionMessage } from "./types";

// Swap this if the model name ever errors out — check the current list at
// https://ai.google.dev/gemini-api/docs/models
export const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";

// Supports multiple free-tier API keys for resilience against per-key rate
// limits: set GEMINI_API_KEYS as a comma-separated list (falls back to the
// single GEMINI_API_KEY if that's all that's set).
const API_KEYS: string[] = (() => {
  const multi = process.env.GEMINI_API_KEYS;
  if (multi) return multi.split(",").map((k) => k.trim()).filter(Boolean);
  const single = process.env.GEMINI_API_KEY;
  return single ? [single] : [];
})();

// Cached per key, and the "last known good" key index — both stashed on
// globalThis for the same reason as sessionStore.ts: Next.js dev mode can
// give different API routes their own copy of a plain module-level variable.
declare global {
  // eslint-disable-next-line no-var
  var __agritwinClients: Map<string, GoogleGenAI> | undefined;
  // eslint-disable-next-line no-var
  var __agritwinKeyIndex: number | undefined;
}

function getClientForKey(apiKey: string): GoogleGenAI {
  const clients = globalThis.__agritwinClients ?? new Map<string, GoogleGenAI>();
  globalThis.__agritwinClients = clients;
  let client = clients.get(apiKey);
  if (!client) {
    client = new GoogleGenAI({ apiKey });
    clients.set(apiKey, client);
  }
  return client;
}

function requireKeys(): void {
  if (API_KEYS.length === 0) {
    throw new Error(
      "GEMINI_API_KEY is not set. Copy .env.example to .env.local and add a key from https://aistudio.google.com/apikey"
    );
  }
}

// 429 = rate limited, 503 = model overloaded — both are transient and worth
// falling back to another key (or retrying) for. Anything else surfaces as a
// friendly message instead of the raw Gemini error JSON.
const RETRYABLE_STATUSES = new Set([429, 503]);

function isRetryable(err: unknown): err is ApiError {
  return err instanceof ApiError && RETRYABLE_STATUSES.has(err.status);
}

function toFriendlyError(err: unknown): Error {
  // Log the raw error (with its real status code) here, before it's replaced
  // by a friendly message — otherwise the route handler's console.error only
  // ever sees the generic text and loses the actual cause.
  console.error("[gemini] request failed:", err);

  if (err instanceof ApiError) {
    if (RETRYABLE_STATUSES.has(err.status)) {
      return new Error("The AI is busy, try again in a moment.");
    }
    return new Error("Something went wrong talking to Gemini. Please try again.");
  }
  return err instanceof Error ? err : new Error("Something went wrong. Please try again.");
}

// Tries every configured key once (starting from the last known-good one),
// moving on immediately on a rate-limit/overload error. Used for calls that
// don't reference a previously uploaded file, so any key can serve them.
async function withKeyRotation<T>(fn: (ai: GoogleGenAI) => Promise<T>): Promise<T> {
  requireKeys();

  const attemptAllKeys = async (): Promise<T> => {
    const startIndex = globalThis.__agritwinKeyIndex ?? 0;
    let lastErr: unknown;
    for (let i = 0; i < API_KEYS.length; i++) {
      const index = (startIndex + i) % API_KEYS.length;
      try {
        const result = await fn(getClientForKey(API_KEYS[index]));
        globalThis.__agritwinKeyIndex = index;
        return result;
      } catch (err) {
        if (!isRetryable(err)) throw err;
        console.error(`[gemini] key #${index} hit ${err.status}, trying next key`);
        lastErr = err;
      }
    }
    throw lastErr;
  };

  try {
    return await attemptAllKeys();
  } catch (err) {
    if (isRetryable(err)) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      try {
        return await attemptAllKeys();
      } catch (retryErr) {
        throw toFriendlyError(retryErr);
      }
    }
    throw toFriendlyError(err);
  }
}

// Uses one SPECIFIC key (with a single sleep-and-retry on failure, no
// fallback to other keys). Required for any call that references an
// already-uploaded file: Gemini's Files API ties an uploaded file to the
// project/key that uploaded it, so switching keys mid-session would make the
// file inaccessible ("not found") to the new key.
async function withFixedKeyRetry<T>(apiKeyIndex: number, fn: (ai: GoogleGenAI) => Promise<T>): Promise<T> {
  requireKeys();
  const ai = getClientForKey(API_KEYS[apiKeyIndex % API_KEYS.length]);
  try {
    return await fn(ai);
  } catch (err) {
    if (isRetryable(err)) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      try {
        return await fn(ai);
      } catch (retryErr) {
        throw toFriendlyError(retryErr);
      }
    }
    throw toFriendlyError(err);
  }
}

export interface UploadedMedia {
  uri: string;
  mimeType: string;
  apiKeyIndex: number;
}

// Uploads the raw file to the Files API under one specific key and polls
// until it's ACTIVE (usable in a generateContent call).
async function uploadWithKey(file: File, apiKeyIndex: number): Promise<UploadedMedia> {
  const mimeType = file.type || "application/octet-stream";
  const ai = getClientForKey(API_KEYS[apiKeyIndex % API_KEYS.length]);

  let uploaded = await ai.files.upload({ file, config: { mimeType } });

  const start = Date.now();
  while (uploaded.state === FileState.PROCESSING) {
    if (Date.now() - start > 60_000) {
      throw new Error("Timed out waiting for the uploaded media to finish processing.");
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
    if (!uploaded.name) throw new Error("Upload did not return a file name.");
    uploaded = await ai.files.get({ name: uploaded.name });
  }

  if (uploaded.state === FileState.FAILED) {
    throw new Error("Gemini failed to process the uploaded media.");
  }
  if (!uploaded.uri || !uploaded.mimeType) {
    throw new Error("Uploaded media is missing a URI or MIME type.");
  }

  return { uri: uploaded.uri, mimeType: uploaded.mimeType, apiKeyIndex };
}

const GUARDRAIL_SYSTEM_PROMPT = `You are a strict content gatekeeper for an agricultural analysis app.
Look at the provided video/image and classify what it primarily shows.
You must respond ONLY with JSON matching the schema.
Rules:
- is_agricultural = true ONLY if the primary subject is living plants,
  crops, gardens, farmland, soil beds, orchards, greenhouses, or fields.
- Houseplants and home gardens count as agricultural.
- Pictures OF pictures/screens showing plants: set confidence <= 0.5.
- People, animals, vehicles, rooms, food dishes, products, documents,
  or anything else as the primary subject => is_agricultural = false.
- If the media is too dark, blurry, or short to judge => is_agricultural
  = false and reason = "unclear_media".`;

const guardrailSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    is_agricultural: { type: Type.BOOLEAN },
    confidence: { type: Type.NUMBER },
    detected_subject: { type: Type.STRING, description: "2-5 words, e.g. 'tomato plants', 'person indoors'" },
    reason: { type: Type.STRING, description: "one sentence" },
  },
  required: ["is_agricultural", "confidence", "detected_subject", "reason"],
};

async function runGuardrailRaw(ai: GoogleGenAI, media: UploadedMedia): Promise<GuardrailResult> {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: createUserContent([createPartFromUri(media.uri, media.mimeType), "Classify this media."]),
    config: {
      systemInstruction: GUARDRAIL_SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseSchema: guardrailSchema,
      mediaResolution: MediaResolution.MEDIA_RESOLUTION_LOW,
    },
  });

  const text = response.text;
  if (!text) throw new Error("Guardrail classifier returned an empty response.");
  return JSON.parse(text) as GuardrailResult;
}

// Uploads the file and classifies it in one combined step, trying each
// configured key in turn (re-uploading fresh under each) if the previous
// key's quota is already exhausted. This is the only point where switching
// keys is possible: analysis and chat calls later reuse the file URI
// produced here, which only the key that uploaded it can access.
export async function uploadAndClassify(file: File): Promise<{ media: UploadedMedia; guardrail: GuardrailResult }> {
  requireKeys();
  const startIndex = globalThis.__agritwinKeyIndex ?? 0;

  const tryAllKeysOnce = async () => {
    let lastErr: unknown;
    for (let i = 0; i < API_KEYS.length; i++) {
      const index = (startIndex + i) % API_KEYS.length;
      try {
        const media = await uploadWithKey(file, index);
        const ai = getClientForKey(API_KEYS[index]);
        const guardrail = await runGuardrailRaw(ai, media);
        return { media, guardrail, index };
      } catch (err) {
        if (!isRetryable(err)) throw err;
        console.error(`[gemini] key #${index} failed for guardrail, trying next key`);
        lastErr = err;
      }
    }
    throw lastErr;
  };

  try {
    const { media, guardrail, index } = await tryAllKeysOnce();
    globalThis.__agritwinKeyIndex = index;
    return { media, guardrail };
  } catch (err) {
    if (!isRetryable(err)) throw toFriendlyError(err);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    try {
      const { media, guardrail, index } = await tryAllKeysOnce();
      globalThis.__agritwinKeyIndex = index;
      return { media, guardrail };
    } catch (retryErr) {
      throw toFriendlyError(retryErr);
    }
  }
}

const ANALYSIS_SYSTEM_PROMPT = `You are AgriTwin, an expert agronomist AI creating a "micro digital twin"
of a smallholder farm from smartphone video. Mentally divide the visible
crop area into a grid (rows A,B,C... x columns 1,2,3...) based on the
camera path, and reference locations using that grid.

Analyze:
1. Crop identification (species if identifiable)
2. Plant health: leaf discoloration, wilting, pest damage, disease signs
3. Crop spacing efficiency
4. Soil condition: visible dryness, cracking, waterlogging
5. Shading and sunlight exposure

Be specific and actionable. Prefer "Leaves in grid A2 show yellowing
consistent with early nitrogen deficiency - apply a nitrogen-rich
fertilizer within 5 days" over generic advice. If you cannot verify
something from the video, say so - do not invent findings.

For every issue's recommended_action, name the specific remedy - the
exact nutrient or fertilizer type (e.g. nitrogen-rich, phosphorus,
potassium, micronutrient mix), the specific pesticide/fungicide category
(e.g. neem oil for aphids, copper-based fungicide for fungal leaf spot),
or a concrete cultural practice (e.g. reduce watering frequency, widen
spacing to 30cm) - never a vague instruction like "apply treatment" or
"consult an expert".

Also fill care_recommendation as a single overall verdict: if the crop
looks healthy with no significant issues, explicitly say no special
treatment is needed right now. Otherwise, summarize the single most
important fertilizer/pesticide/fungicide or practice to apply first.`;

const analysisSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    crop_type: { type: Type.STRING },
    overall_health_score: { type: Type.NUMBER },
    summary: { type: Type.STRING, description: "2-3 sentences" },
    care_recommendation: {
      type: Type.STRING,
      description:
        "Overall verdict: 'no special treatment needed' if healthy, otherwise the single most important fertilizer/pesticide/fungicide or practice to apply first",
    },
    issues: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          grid_location: { type: Type.STRING, description: "e.g. 'A2'" },
          problem: { type: Type.STRING },
          severity: { type: Type.STRING, enum: ["low", "medium", "high"] },
          confidence: { type: Type.STRING, enum: ["low", "medium", "high"] },
          recommended_action: {
            type: Type.STRING,
            description: "Name the specific fertilizer/pesticide/fungicide type or cultural practice, not a vague instruction",
          },
          timeframe: { type: Type.STRING, description: "e.g. 'within 3 days'" },
        },
        required: ["grid_location", "problem", "severity", "confidence", "recommended_action", "timeframe"],
      },
    },
    spacing_assessment: { type: Type.STRING },
    soil_assessment: { type: Type.STRING },
    sunlight_assessment: { type: Type.STRING },
    positive_observations: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: [
    "crop_type",
    "overall_health_score",
    "summary",
    "care_recommendation",
    "issues",
    "spacing_assessment",
    "soil_assessment",
    "sunlight_assessment",
    "positive_observations",
  ],
};

export async function runAnalysis(media: UploadedMedia): Promise<FarmAnalysis> {
  const response = await withFixedKeyRetry(media.apiKeyIndex, (ai) =>
    ai.models.generateContent({
      model: MODEL,
      contents: createUserContent([
        createPartFromUri(media.uri, media.mimeType),
        "Analyze this farm video and produce the digital twin report.",
      ]),
      config: {
        systemInstruction: ANALYSIS_SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: analysisSchema,
      },
    })
  );

  const text = response.text;
  if (!text) throw new Error("Analysis call returned an empty response.");
  return JSON.parse(text) as FarmAnalysis;
}

const CHAT_SYSTEM_PROMPT = `You are AgriTwin, the user's farm advisor. Always ground answers in the
analyzed video and the conversation so far. Reference grid locations when
relevant. If the user asks about something not visible in the video, say so
and suggest what to record next. Keep answers under 120 words, practical,
and farmer-friendly.`;

const SUMMARY_SYSTEM_PROMPT = `Summarize the following farm-advisor conversation turns into a single
short paragraph that preserves every concrete fact, number, and grid
location mentioned, so the conversation can continue with full context.`;

// Builds the multi-turn contents array per the session-memory design: the
// video is attached only once (turn 1), followed by the prior analysis as
// context, then the full stored message log, then the new question.
function buildChatContents(media: UploadedMedia, analysis: FarmAnalysis, messages: SessionMessage[], question: string): Content[] {
  const contents: Content[] = [
    createUserContent([
      createPartFromUri(media.uri, media.mimeType),
      createPartFromText(
        `This is my farm video. Here is your prior analysis of it: ${JSON.stringify(analysis)}. Answer my questions about this specific farm.`
      ),
    ]),
  ];

  for (const msg of messages) {
    contents.push({ role: msg.role, parts: [{ text: msg.content }] });
  }

  contents.push({ role: "user", parts: [{ text: question }] });
  return contents;
}

export async function runChat(media: UploadedMedia, analysis: FarmAnalysis, messages: SessionMessage[], question: string): Promise<string> {
  const response = await withFixedKeyRetry(media.apiKeyIndex, (ai) =>
    ai.models.generateContent({
      model: MODEL,
      contents: buildChatContents(media, analysis, messages, question),
      config: {
        systemInstruction: CHAT_SYSTEM_PROMPT,
      },
    })
  );

  const text = response.text;
  if (!text) throw new Error("Chat call returned an empty response.");
  return text;
}

const TOKEN_GUARD_TURN_LIMIT = 20;
const TOKEN_GUARD_KEEP_VERBATIM = 10;

// If the message log gets long, collapse the oldest turns into one summary
// note so future calls stay small while keeping the gist of what was said.
// Doesn't reference the uploaded file, so it's free to rotate across keys.
export async function summarizeIfNeeded(messages: SessionMessage[]): Promise<SessionMessage[]> {
  if (messages.length <= TOKEN_GUARD_TURN_LIMIT) return messages;

  const toSummarize = messages.slice(0, messages.length - TOKEN_GUARD_KEEP_VERBATIM);
  const toKeep = messages.slice(messages.length - TOKEN_GUARD_KEEP_VERBATIM);

  const transcript = toSummarize.map((m) => `${m.role}: ${m.content}`).join("\n");
  const response = await withKeyRotation((ai) =>
    ai.models.generateContent({
      model: MODEL,
      contents: `Conversation so far:\n${transcript}`,
      config: { systemInstruction: SUMMARY_SYSTEM_PROMPT },
    })
  );

  const summary = response.text || "Earlier conversation covered follow-up questions about this farm.";
  return [
    { role: "model" as const, content: `[Summary of earlier conversation] ${summary}`, timestamp: Date.now() },
    ...toKeep,
  ];
}
