"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import type { RoadmapItemData } from "@/data/roadmap-initial";
import { progressPercent } from "@/lib/roadmap-progress";
import { cn } from "@/lib/utils";
import RoadmapItem from "./RoadmapItem";

interface RoadmapSectionProps {
  title: string;
  /** Items affichés (déjà filtrés par le parent) */
  displayItems: RoadmapItemData[];
  /** Progression de la section sur tous les items (hors filtre d’affichage) */
  sectionProgressDone: number;
  sectionProgressTotal: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleItem: (itemId: string) => void;
}

export default function RoadmapSection({
  title,
  displayItems,
  sectionProgressDone,
  sectionProgressTotal,
  expanded,
  onToggleExpand,
  onToggleItem,
}: RoadmapSectionProps) {
  const pct = progressPercent(sectionProgressDone, sectionProgressTotal);

  return (
    <section className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={onToggleExpand}
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-gray-50 transition-colors cursor-pointer"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-gray-500" />
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {sectionProgressDone}/{sectionProgressTotal} terminés · {pct}%
          </p>
        </div>
        <div className="hidden sm:block w-24 shrink-0">
          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3 space-y-2 bg-gray-50/50">
          {displayItems.length === 0 ? (
            <p className="text-xs text-gray-400 italic py-2">Aucun élément dans cette section pour le filtre actuel.</p>
          ) : (
            displayItems.map((item) => (
              <RoadmapItem key={item.id} item={item} onToggle={() => onToggleItem(item.id)} />
            ))
          )}
        </div>
      )}
    </section>
  );
}
