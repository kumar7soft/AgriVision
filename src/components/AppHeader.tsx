"use client";

import { LeafIcon } from "./icons";

export default function AppHeader({ rightSlot }: { rightSlot?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-200 bg-white/90 px-4 py-3 backdrop-blur">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-green-600 text-white">
          <LeafIcon className="h-4 w-4" />
        </span>
        <span className="text-base font-bold tracking-tight text-neutral-900">AgriTwin</span>
      </div>
      {rightSlot}
    </header>
  );
}
