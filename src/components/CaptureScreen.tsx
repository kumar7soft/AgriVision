"use client";

import { useEffect, useRef, useState } from "react";
import type { HistoryEntry } from "@/lib/types";

const MAX_SECONDS = 30;

function relativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function healthColor(score: number): string {
  if (score >= 75) return "text-green-600";
  if (score >= 50) return "text-amber-600";
  return "text-red-600";
}

export default function CaptureScreen({
  onSubmit,
  errorMessage,
  history,
  onSelectHistory,
}: {
  onSubmit: (file: File, durationSeconds: number | null) => void;
  errorMessage: string | null;
  history: HistoryEntry[];
  onSelectHistory: (sessionId: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);

  const [isRecording, setIsRecording] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(MAX_SECONDS);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [canRecord, setCanRecord] = useState(true);

  useEffect(() => {
    setCanRecord(typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined");
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function stopRecording() {
    mediaRecorderRef.current?.stop();
  }

  async function startRecording() {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const candidates = ["video/webm;codecs=vp9", "video/webm", "video/mp4"];
      const mimeType = candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const usedType = mimeType || "video/webm";
        const blob = new Blob(chunksRef.current, { type: usedType });
        const duration = (Date.now() - startTimeRef.current) / 1000;
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) clearInterval(timerRef.current);
        setIsRecording(false);
        const ext = usedType.includes("mp4") ? "mp4" : "webm";
        const file = new File([blob], `farm-scan-${Date.now()}.${ext}`, { type: usedType });
        onSubmit(file, duration);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      startTimeRef.current = Date.now();
      setIsRecording(true);
      setSecondsLeft(MAX_SECONDS);

      timerRef.current = setInterval(() => {
        setSecondsLeft((s) => {
          if (s <= 1) {
            stopRecording();
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } catch {
      setCameraError("Couldn't access the camera. Try uploading a video instead.");
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (file.type.startsWith("video/")) {
      const url = URL.createObjectURL(file);
      const probe = document.createElement("video");
      probe.preload = "metadata";
      probe.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        onSubmit(file, Number.isFinite(probe.duration) ? probe.duration : null);
      };
      probe.src = url;
    } else {
      onSubmit(file, null);
    }
  }

  return (
    <div className="flex min-h-[85vh] flex-col items-center gap-6 px-5 pb-8 pt-10 text-center">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Scan My Farm</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Walk around your crop patch for 15–30 seconds with your rear camera, or upload a video/photo.
        </p>
      </div>

      <div className="relative flex h-64 w-full max-w-sm items-center justify-center overflow-hidden rounded-2xl bg-neutral-900">
        <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
        {isRecording && (
          <div className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            {secondsLeft}s
          </div>
        )}
        {!isRecording && !streamRef.current && (
          <span className="text-sm text-neutral-400">Camera preview will appear here</span>
        )}
      </div>

      {canRecord && (
        <button
          onClick={isRecording ? stopRecording : startRecording}
          className={`w-full max-w-sm rounded-full px-6 py-3 text-sm font-semibold text-white active:scale-[0.98] ${
            isRecording ? "bg-red-600" : "bg-green-600"
          }`}
        >
          {isRecording ? `Stop recording (${secondsLeft}s left)` : "Record my crop patch"}
        </button>
      )}

      {cameraError && <p className="text-xs text-red-600">{cameraError}</p>}

      <div className="flex w-full max-w-sm items-center gap-3 text-xs text-neutral-400">
        <div className="h-px flex-1 bg-neutral-200" />
        or
        <div className="h-px flex-1 bg-neutral-200" />
      </div>

      <label className="w-full max-w-sm cursor-pointer rounded-full border border-neutral-300 px-6 py-3 text-sm font-semibold text-neutral-700 active:bg-neutral-50">
        Upload video or photo
        <input
          type="file"
          accept="video/*,image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
        />
      </label>

      {errorMessage && <p className="text-xs text-red-600">{errorMessage}</p>}

      {history.length > 0 && (
        <div className="mt-2 flex w-full max-w-sm flex-col gap-2 text-left">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Recent scans</h2>
          {history.map((entry) => (
            <button
              key={entry.sessionId}
              onClick={() => onSelectHistory(entry.sessionId)}
              className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white px-4 py-3 text-left active:bg-neutral-50"
            >
              <div>
                <p className="text-sm font-medium text-neutral-800">{entry.cropType}</p>
                <p className="text-xs text-neutral-400">{relativeTime(entry.createdAt)}</p>
              </div>
              <span className={`text-sm font-bold ${healthColor(entry.healthScore)}`}>
                {Math.round(entry.healthScore)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
