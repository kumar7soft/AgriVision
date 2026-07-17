"use client";

import { useEffect, useRef, useState } from "react";
import type { HistoryEntry } from "@/lib/types";
import AppHeader from "./AppHeader";
import { AlertIcon, CameraIcon, ChevronRightIcon, ClockIcon, LeafIcon, UploadIcon } from "./icons";

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

function healthBadge(score: number): string {
  if (score >= 75) return "bg-green-100 text-green-700";
  if (score >= 50) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
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
  const [hasStream, setHasStream] = useState(false);

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
      setHasStream(true);
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
        setHasStream(false);
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
    <div className="min-h-screen bg-gradient-to-b from-green-50 via-white to-white">
      <AppHeader />

      <div className="flex flex-col items-center gap-6 px-5 pb-10 pt-8 text-center">
        <div className="flex flex-col items-center gap-3">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-green-600 shadow-md shadow-green-600/20">
            <LeafIcon className="h-7 w-7 text-white" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Scan My Farm</h1>
            <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-neutral-600">
              Walk around your crop patch for 15–30 seconds with your rear camera, or upload a video/photo.
            </p>
          </div>
        </div>

        <div className="relative flex h-64 w-full max-w-sm items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-br from-neutral-900 to-neutral-800 shadow-lg">
          <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
          {isRecording && (
            <div className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
              {secondsLeft}s
            </div>
          )}
          {!hasStream && (
            <div className="flex flex-col items-center gap-2 text-neutral-400">
              <CameraIcon className="h-9 w-9" />
              <span className="text-sm">Camera preview will appear here</span>
            </div>
          )}
        </div>

        {canRecord && (
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={`flex w-full max-w-sm items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-semibold text-white shadow-md transition active:scale-[0.98] ${
              isRecording ? "bg-red-600 shadow-red-600/20" : "bg-green-600 shadow-green-600/20"
            }`}
          >
            <CameraIcon className="h-4 w-4" />
            {isRecording ? `Stop recording (${secondsLeft}s left)` : "Record my crop patch"}
          </button>
        )}

        {cameraError && (
          <div className="flex w-full max-w-sm items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-left">
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <p className="text-xs text-red-700">{cameraError}</p>
          </div>
        )}

        <div className="flex w-full max-w-sm items-center gap-3 text-xs font-medium tracking-wide text-neutral-400">
          <div className="h-px flex-1 bg-neutral-200" />
          OR
          <div className="h-px flex-1 bg-neutral-200" />
        </div>

        <label className="flex w-full max-w-sm cursor-pointer items-center justify-center gap-2 rounded-full border-2 border-green-600 px-6 py-3.5 text-sm font-semibold text-green-700 transition active:bg-green-50">
          <UploadIcon className="h-4 w-4" />
          Upload video or photo
          <input type="file" accept="video/*,image/*" capture="environment" onChange={handleFileChange} className="hidden" />
        </label>

        {errorMessage && (
          <div className="flex w-full max-w-sm items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-left">
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <p className="text-xs text-red-700">{errorMessage}</p>
          </div>
        )}

        {history.length > 0 && (
          <div className="mt-2 flex w-full max-w-sm flex-col gap-2 text-left">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              <ClockIcon className="h-3.5 w-3.5" />
              Recent scans
            </h2>
            {history.map((entry) => (
              <button
                key={entry.sessionId}
                onClick={() => onSelectHistory(entry.sessionId)}
                className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-left shadow-sm transition active:bg-neutral-50"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-50">
                    <LeafIcon className="h-4 w-4 text-green-600" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-neutral-800">{entry.cropType}</p>
                    <p className="text-xs text-neutral-400">{relativeTime(entry.createdAt)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${healthBadge(entry.healthScore)}`}>
                    {Math.round(entry.healthScore)}
                  </span>
                  <ChevronRightIcon className="h-4 w-4 text-neutral-300" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
