"use client";

import { useEffect, useState } from "react";
import type { FarmAnalysis, SessionMessage } from "@/lib/types";
import CaptureScreen from "@/components/CaptureScreen";
import AnalyzingScreen from "@/components/AnalyzingScreen";
import RejectionScreen from "@/components/RejectionScreen";
import Dashboard from "@/components/Dashboard";
import Chat from "@/components/Chat";
import SetupErrorScreen from "@/components/SetupErrorScreen";

type Screen = "loading" | "setup-error" | "capture" | "analyzing" | "rejected" | "dashboard";

const SESSION_STORAGE_KEY = "agritwin_session_id";

export default function Home() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [analyzingPhase, setAnalyzingPhase] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rejection, setRejection] = useState<{ detected_subject: string; reason: string } | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<FarmAnalysis | null>(null);
  const [initialMessages, setInitialMessages] = useState<SessionMessage[]>([]);

  // Restore a prior session on refresh, if one is still valid.
  useEffect(() => {
    fetch("/api/config")
      .then((res) => res.json())
      .then((data) => {
        if (!data.configured) {
          setScreen("setup-error");
          return;
        }

        const stored = typeof window !== "undefined" ? localStorage.getItem(SESSION_STORAGE_KEY) : null;
        if (!stored) {
          setScreen("capture");
          return;
        }
        fetch(`/api/session/${stored}`)
          .then(async (res) => {
            if (!res.ok) throw new Error("expired");
            const sessionData = await res.json();
            if (!sessionData.analysis) throw new Error("no analysis");
            setSessionId(stored);
            setAnalysis(sessionData.analysis);
            setInitialMessages(sessionData.messages || []);
            setScreen("dashboard");
          })
          .catch(() => {
            localStorage.removeItem(SESSION_STORAGE_KEY);
            setScreen("capture");
          });
      })
      .catch(() => setScreen("capture"));
  }, []);

  async function handleCapture(file: File, durationSeconds: number | null) {
    setErrorMessage(null);
    setScreen("analyzing");
    setAnalyzingPhase(0);

    const cosmeticPhaseTimer = setTimeout(() => setAnalyzingPhase(1), 2500);

    try {
      const form = new FormData();
      form.append("file", file);
      if (durationSeconds != null) form.append("durationSeconds", String(durationSeconds));

      const uploadRes = await fetch("/api/upload", { method: "POST", body: form });
      const uploadData = await uploadRes.json();
      clearTimeout(cosmeticPhaseTimer);

      if (uploadRes.status === 422) {
        setRejection({ detected_subject: uploadData.detected_subject, reason: uploadData.reason });
        setScreen("rejected");
        return;
      }
      if (!uploadRes.ok) {
        throw new Error(uploadData.error || "Upload failed.");
      }

      setAnalyzingPhase(2);
      const analyzeRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: uploadData.sessionId }),
      });
      const analyzeData = await analyzeRes.json();
      if (!analyzeRes.ok) {
        throw new Error(analyzeData.error || "Analysis failed.");
      }

      localStorage.setItem(SESSION_STORAGE_KEY, uploadData.sessionId);
      setSessionId(uploadData.sessionId);
      setAnalysis(analyzeData);
      setInitialMessages([]);
      setScreen("dashboard");
    } catch (err) {
      clearTimeout(cosmeticPhaseTimer);
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setScreen("capture");
    }
  }

  function handleRetry() {
    setRejection(null);
    setErrorMessage(null);
    setScreen("capture");
  }

  if (screen === "loading") {
    return <div className="min-h-screen" />;
  }

  if (screen === "setup-error") {
    return <SetupErrorScreen />;
  }

  if (screen === "capture") {
    return <CaptureScreen onSubmit={handleCapture} errorMessage={errorMessage} />;
  }

  if (screen === "analyzing") {
    return <AnalyzingScreen phase={analyzingPhase} />;
  }

  if (screen === "rejected" && rejection) {
    return (
      <RejectionScreen
        detectedSubject={rejection.detected_subject}
        reason={rejection.reason}
        onRetry={handleRetry}
      />
    );
  }

  if (screen === "dashboard" && analysis && sessionId) {
    return (
      <div className="min-h-screen bg-neutral-50 pb-4">
        <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/90 px-4 py-3 backdrop-blur">
          <h1 className="text-base font-bold text-green-700">AgriTwin</h1>
        </header>
        <Dashboard analysis={analysis} />
        <Chat sessionId={sessionId} initialMessages={initialMessages} />
      </div>
    );
  }

  return null;
}
