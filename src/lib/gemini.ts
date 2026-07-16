import { GoogleGenAI, Type, FileState, ApiError, PartMediaResolutionLevel, createUserContent, createPartFromUri, createPartFromText, type Schema, type Content } from "@google/genai";
import type { GuardrailResult, FarmAnalysis, SessionMessage } from "./types";

// Swap this if the model name ever errors out — check the current list at
// https://ai.google.dev/gemini-api/docs/models
export const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";

let client: GoogleGenAI | null = null;

export function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Copy .env.example to .env.local and add a key from https://aistudio.google.com/apikey"
    );
  }
  if (!client) {
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

async function withRetry429<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiError && err.status === 429) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return await fn();
    }
    throw err;
  }
}

export interface UploadedMedia {
  uri: string;
  mimeType: string;
}

// Uploads via the Files API and polls until the file is ACTIVE (usable in a
// generateContent call). Required before either the guardrail or the full
// analysis can reference the video.
export async function uploadMedia(file: File): Promise<UploadedMedia> {
  const ai = getClient();
  const mimeType = file.type || "application/octet-stream";

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

  return { uri: uploaded.uri, mimeType: uploaded.mimeType };
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

export async function runGuardrail(media: UploadedMedia): Promise<GuardrailResult> {
  const ai = getClient();
  const response = await withRetry429(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: createUserContent([
        createPartFromUri(media.uri, media.mimeType, PartMediaResolutionLevel.MEDIA_RESOLUTION_LOW),
        "Classify this media.",
      ]),
      config: {
        systemInstruction: GUARDRAIL_SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: guardrailSchema,
      },
    })
  );

  const text = response.text;
  if (!text) throw new Error("Guardrail classifier returned an empty response.");
  return JSON.parse(text) as GuardrailResult;
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
something from the video, say so - do not invent findings.`;

const analysisSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    crop_type: { type: Type.STRING },
    overall_health_score: { type: Type.NUMBER },
    summary: { type: Type.STRING, description: "2-3 sentences" },
    issues: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          grid_location: { type: Type.STRING, description: "e.g. 'A2'" },
          problem: { type: Type.STRING },
          severity: { type: Type.STRING, enum: ["low", "medium", "high"] },
          confidence: { type: Type.STRING, enum: ["low", "medium", "high"] },
          recommended_action: { type: Type.STRING },
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
    "issues",
    "spacing_assessment",
    "soil_assessment",
    "sunlight_assessment",
    "positive_observations",
  ],
};

export async function runAnalysis(media: UploadedMedia): Promise<FarmAnalysis> {
  const ai = getClient();
  const response = await withRetry429(() =>
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
  const ai = getClient();
  const response = await withRetry429(() =>
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
export async function summarizeIfNeeded(messages: SessionMessage[]): Promise<SessionMessage[]> {
  if (messages.length <= TOKEN_GUARD_TURN_LIMIT) return messages;

  const toSummarize = messages.slice(0, messages.length - TOKEN_GUARD_KEEP_VERBATIM);
  const toKeep = messages.slice(messages.length - TOKEN_GUARD_KEEP_VERBATIM);

  const ai = getClient();
  const transcript = toSummarize.map((m) => `${m.role}: ${m.content}`).join("\n");
  const response = await withRetry429(() =>
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
