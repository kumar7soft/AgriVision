"use client";

export default function HealthRing({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const color = clamped >= 75 ? "#16a34a" : clamped >= 50 ? "#d97706" : "#dc2626";
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);

  return (
    <div className="relative h-36 w-36">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={radius} stroke="#e5e7eb" strokeWidth="10" fill="none" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          stroke={color}
          strokeWidth="10"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold" style={{ color }}>
          {Math.round(clamped)}
        </span>
        <span className="text-xs text-neutral-500">Health Score</span>
      </div>
    </div>
  );
}
