import type { RoadmapItemData, RoadmapSectionData } from "@/data/roadmap-initial";

export interface ProgressCounts {
  done: number;
  total: number;
}

export function countItemsProgress(items: RoadmapItemData[]): ProgressCounts {
  const total = items.length;
  const done = items.filter((i) => i.status === "done").length;
  return { done, total };
}

export function countSectionProgress(section: RoadmapSectionData): ProgressCounts {
  return countItemsProgress(section.items);
}

export function countGlobalProgress(sections: RoadmapSectionData[]): ProgressCounts {
  return sections.reduce(
    (acc, s) => {
      const p = countSectionProgress(s);
      return { done: acc.done + p.done, total: acc.total + p.total };
    },
    { done: 0, total: 0 }
  );
}

export function progressPercent(done: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((done / total) * 100);
}
