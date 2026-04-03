"use client";

import { useCallback, useMemo, useState } from "react";
import type { RoadmapItemStatus, RoadmapSectionData } from "@/data/roadmap-initial";

export type RoadmapFilter = "all" | "todo" | "done";

function cloneSections(sections: RoadmapSectionData[]): RoadmapSectionData[] {
  return sections.map((s) => ({
    ...s,
    items: s.items.map((i) => ({ ...i })),
  }));
}

export function useRoadmapState(initialSections: RoadmapSectionData[]) {
  const [sections, setSections] = useState<RoadmapSectionData[]>(() => cloneSections(initialSections));
  const [filter, setFilter] = useState<RoadmapFilter>("all");
  const [expandedBySection, setExpandedBySection] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    initialSections.forEach((s) => {
      init[s.id] = true;
    });
    return init;
  });

  const toggleItem = useCallback((sectionId: string, itemId: string) => {
    setSections((prev) =>
      prev.map((section) => {
        if (section.id !== sectionId) return section;
        return {
          ...section,
          items: section.items.map((item) => {
            if (item.id !== itemId) return item;
            const next: RoadmapItemStatus = item.status === "done" ? "todo" : "done";
            return { ...item, status: next };
          }),
        };
      })
    );
  }, []);

  const toggleSection = useCallback((sectionId: string) => {
    setExpandedBySection((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }));
  }, []);

  const expandAll = useCallback(() => {
    setExpandedBySection((prev) => {
      const next = { ...prev };
      sections.forEach((s) => {
        next[s.id] = true;
      });
      return next;
    });
  }, [sections]);

  const collapseAll = useCallback(() => {
    setExpandedBySection((prev) => {
      const next = { ...prev };
      sections.forEach((s) => {
        next[s.id] = false;
      });
      return next;
    });
  }, [sections]);

  const filteredSections = useMemo(() => {
    if (filter === "all") return sections;
    return sections.map((section) => ({
      ...section,
      items: section.items.filter((item) => item.status === filter),
    }));
  }, [sections, filter]);

  const visibleSections = useMemo(
    () => filteredSections.filter((s) => s.items.length > 0),
    [filteredSections]
  );

  return {
    sections,
    filter,
    setFilter,
    expandedBySection,
    toggleItem,
    toggleSection,
    expandAll,
    collapseAll,
    visibleSections,
  };
}
