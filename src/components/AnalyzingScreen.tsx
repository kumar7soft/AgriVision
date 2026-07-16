"use client";

const PHASES = ["Uploading video…", "Checking it's a farm 🌱…", "Building your farm's digital twin…"];

export default function AnalyzingScreen({ phase }: { phase: number }) {
  const label = PHASES[Math.min(phase, PHASES.length - 1)];
  return (
    <div className="flex min-h-[85vh] flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="h-16 w-16 animate-spin rounded-full border-4 border-green-200 border-t-green-600" />
      <p className="text-base font-medium text-neutral-700">{label}</p>
    </div>
  );
}
