"use client";

import type { AnalysisIssue } from "@/lib/types";

const severityStyles: Record<AnalysisIssue["severity"], string> = {
  high: "bg-red-100 text-red-700 border-red-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

export default function IssueCard({ issue }: { issue: AnalysisIssue }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
          Grid {issue.grid_location}
        </span>
        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${severityStyles[issue.severity]}`}>
          {issue.severity} severity
        </span>
      </div>
      <p className="mt-2 text-sm font-medium text-neutral-800">{issue.problem}</p>
      <p className="mt-1 text-sm text-neutral-600">{issue.recommended_action}</p>
      <p className="mt-2 text-xs text-neutral-400">
        Act {issue.timeframe} · {issue.confidence} confidence
      </p>
    </div>
  );
}
