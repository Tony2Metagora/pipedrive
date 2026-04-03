"use client";

import type { RoadmapItemData } from "@/data/roadmap-initial";
import { cn } from "@/lib/utils";

interface RoadmapItemProps {
  item: RoadmapItemData;
  onToggle: () => void;
}

export default function RoadmapItem({ item, onToggle }: RoadmapItemProps) {
  const isDone = item.status === "done";

  return (
    <div
      className={cn(
        "flex gap-3 rounded-lg border p-3 sm:p-4 transition-colors",
        isDone ? "border-emerald-200 bg-emerald-50/40" : "border-gray-200 bg-white hover:border-gray-300"
      )}
    >
      <div className="pt-0.5 shrink-0">
        <input
          type="checkbox"
          checked={isDone}
          onChange={onToggle}
          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
          aria-label={isDone ? "Marquer comme à faire" : "Marquer comme fait"}
        />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("text-sm font-medium", isDone ? "text-gray-600 line-through" : "text-gray-900")}>
            {item.title}
          </span>
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              isDone ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
            )}
          >
            {isDone ? "Fait" : "À faire"}
          </span>
        </div>
        {item.note ? <p className="text-xs text-gray-500">{item.note}</p> : null}
      </div>
    </div>
  );
}
