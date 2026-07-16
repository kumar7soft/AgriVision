"use client";

import { useState } from "react";
import type { FarmAnalysis } from "@/lib/types";
import HealthRing from "./HealthRing";
import IssueCard from "./IssueCard";

const severityOrder = { high: 0, medium: 1, low: 2 } as const;

function CollapsibleSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-neutral-200 bg-white">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-neutral-800"
      >
        {title}
        <span className="text-neutral-400">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="border-t border-neutral-100 px-4 py-3 text-sm text-neutral-600">{children}</div>}
    </div>
  );
}

export default function Dashboard({ analysis }: { analysis: FarmAnalysis }) {
  const sortedIssues = [...analysis.issues].sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
  );

  return (
    <div className="flex flex-col gap-6 px-4 pb-6 pt-4">
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-6 text-center shadow-sm">
        <HealthRing score={analysis.overall_health_score} />
        <h2 className="text-lg font-semibold text-neutral-900">{analysis.crop_type}</h2>
        <p className="text-sm text-neutral-600">{analysis.summary}</p>
      </div>

      {sortedIssues.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Issues detected</h3>
          {sortedIssues.map((issue, i) => (
            <IssueCard key={i} issue={issue} />
          ))}
        </div>
      )}

      {analysis.positive_observations.length > 0 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <h3 className="text-sm font-semibold text-emerald-800">What&apos;s going well</h3>
          <ul className="mt-2 list-inside list-disc text-sm text-emerald-700">
            {analysis.positive_observations.map((obs, i) => (
              <li key={i}>{obs}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <CollapsibleSection title="Spacing">{analysis.spacing_assessment}</CollapsibleSection>
        <CollapsibleSection title="Soil condition">{analysis.soil_assessment}</CollapsibleSection>
        <CollapsibleSection title="Sunlight exposure">{analysis.sunlight_assessment}</CollapsibleSection>
      </div>
    </div>
  );
}
