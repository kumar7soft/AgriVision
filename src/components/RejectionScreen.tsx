"use client";

export default function RejectionScreen({
  detectedSubject,
  reason,
  onRetry,
}: {
  detectedSubject: string;
  reason: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex min-h-[85vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="text-5xl">🌾</div>
      <h2 className="text-lg font-semibold text-neutral-900">That doesn&apos;t look like a farm</h2>
      <p className="text-sm text-neutral-600">
        We detected: <span className="font-medium text-neutral-800">{detectedSubject}</span>
      </p>
      <p className="max-w-xs text-sm text-neutral-500">
        AgriTwin only analyzes plants, crops, and farmland. Please record plants, crops, or farmland and try again.
      </p>
      {reason && <p className="max-w-xs text-xs text-neutral-400">{reason}</p>}
      <button
        onClick={onRetry}
        className="mt-2 rounded-full bg-green-600 px-6 py-2.5 text-sm font-medium text-white active:bg-green-700"
      >
        Try Again
      </button>
    </div>
  );
}
