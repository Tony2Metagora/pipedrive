"use client";

import { useState, useCallback, useRef } from "react";

export interface ColumnDef {
  key: string;
  minWidth: number;
  defaultWidth: number;
}

export function useResizableColumns(columns: ColumnDef[]) {
  const [widths, setWidths] = useState<Record<string, number>>(() => {
    const w: Record<string, number> = {};
    for (const col of columns) w[col.key] = col.defaultWidth;
    return w;
  });

  const dragging = useRef<{ key: string; startX: number; startW: number } | null>(null);

  const onMouseDown = useCallback(
    (key: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startW = widths[key] ?? 80;
      dragging.current = { key, startX, startW };

      const col = columns.find((c) => c.key === key);
      const minW = col?.minWidth ?? 30;

      const onMouseMove = (ev: MouseEvent) => {
        if (!dragging.current) return;
        const delta = ev.clientX - dragging.current.startX;
        const newW = Math.max(minW, dragging.current.startW + delta);
        setWidths((prev) => ({ ...prev, [dragging.current!.key]: newW }));
      };

      const onMouseUp = () => {
        dragging.current = null;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [widths, columns]
  );

  return { widths, onMouseDown };
}
