"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ListTodo } from "lucide-react";
import RoadmapSection from "@/components/roadmap/RoadmapSection";
import { ROADMAP_INITIAL_SECTIONS } from "@/data/roadmap-initial";
import { usePermissions } from "@/hooks/usePermissions";
import { useRoadmapState, type RoadmapFilter } from "@/hooks/useRoadmapState";
import { countGlobalProgress, countSectionProgress, progressPercent } from "@/lib/roadmap-progress";
import { cn } from "@/lib/utils";

const FILTER_OPTIONS: { value: RoadmapFilter; label: string }[] = [
  { value: "all", label: "Tous" },
  { value: "todo", label: "À faire" },
  { value: "done", label: "Fait" },
];

export default function RoadmapPage() {
  const router = useRouter();
  const { isAdmin, loading: permLoading } = usePermissions();
  const {
    sections,
    filter,
    setFilter,
    expandedBySection,
    toggleItem,
    toggleSection,
    expandAll,
    collapseAll,
    visibleSections,
  } = useRoadmapState(ROADMAP_INITIAL_SECTIONS);

  useEffect(() => {
    if (!permLoading && !isAdmin) router.replace("/dashboard");
  }, [permLoading, isAdmin, router]);

  if (permLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (!isAdmin) return null;

  const global = countGlobalProgress(sections);
  const globalPct = progressPercent(global.done, global.total);
  const filterEmpty = global.total > 0 && visibleSections.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <ListTodo className="w-5 h-5 text-indigo-600 shrink-0" />
          Roadmap production
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Suivi personnel des chantiers — état en mémoire pour cette session uniquement.
        </p>
      </div>

      {global.total === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/80 px-6 py-12 text-center">
          <p className="text-sm text-gray-600">Aucune tâche dans la roadmap pour le moment.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2 min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-700">
                {global.done}/{global.total} terminés
              </p>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden max-w-md">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                  style={{ width: `${globalPct}%` }}
                />
              </div>
              <p className="text-xs text-gray-500">{globalPct}% de progression globale</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {FILTER_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFilter(opt.value)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                    filter === opt.value
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  )}
                >
                  {opt.label}
                </button>
              ))}
              <span className="hidden sm:inline w-px h-5 bg-gray-200 mx-1" aria-hidden />
              <button
                type="button"
                onClick={expandAll}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
              >
                Tout déplier
              </button>
              <button
                type="button"
                onClick={collapseAll}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
              >
                Tout replier
              </button>
            </div>
          </div>

          {filterEmpty ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-amber-50/50 px-6 py-10 text-center">
              <p className="text-sm text-gray-700">Aucune tâche ne correspond à ce filtre.</p>
              <button
                type="button"
                onClick={() => setFilter("all")}
                className="mt-3 text-xs font-medium text-indigo-600 hover:text-indigo-800 cursor-pointer"
              >
                Afficher tout
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleSections.map((vs) => {
                const full = sections.find((s) => s.id === vs.id);
                const sectionCounts = full ? countSectionProgress(full) : { done: 0, total: 0 };
                return (
                  <RoadmapSection
                    key={vs.id}
                    title={vs.title}
                    displayItems={vs.items}
                    sectionProgressDone={sectionCounts.done}
                    sectionProgressTotal={sectionCounts.total}
                    expanded={expandedBySection[vs.id] ?? true}
                    onToggleExpand={() => toggleSection(vs.id)}
                    onToggleItem={(itemId) => toggleItem(vs.id, itemId)}
                  />
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
