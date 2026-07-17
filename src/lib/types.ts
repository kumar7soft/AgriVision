export interface GuardrailResult {
  is_agricultural: boolean;
  confidence: number;
  detected_subject: string;
  reason: string;
}

export interface AnalysisIssue {
  grid_location: string;
  problem: string;
  severity: "low" | "medium" | "high";
  confidence: "low" | "medium" | "high";
  recommended_action: string;
  timeframe: string;
}

export interface FarmAnalysis {
  crop_type: string;
  overall_health_score: number;
  summary: string;
  care_recommendation: string;
  issues: AnalysisIssue[];
  spacing_assessment: string;
  soil_assessment: string;
  sunlight_assessment: string;
  positive_observations: string[];
}

export interface HistoryEntry {
  sessionId: string;
  cropType: string;
  healthScore: number;
  createdAt: number;
}

export interface SessionMessage {
  role: "user" | "model";
  content: string;
  timestamp: number;
}

export interface FarmSession {
  sessionId: string;
  createdAt: number;
  lastAccessedAt: number;
  mediaFileUri: string | null;
  mediaMimeType: string | null;
  mediaApiKeyIndex: number | null;
  guardrailResult: GuardrailResult | null;
  analysis: FarmAnalysis | null;
  messages: SessionMessage[];
}
