"use client";

import { useState, useCallback, useRef } from "react";

export interface ColumnDef {
  key: string;
  minWidth: number;
  defaultWidth: number;
}

export function useResizableColumns(columns: ColumnDef[]) {
  const columnsRef = useRef(columns);
  columnsRef.current = columns;

  const [widths, setWidths] = useState<Record<string, number>>(() => {
    const w: Record<string, number> = {};
    for (const col of columns) w[col.key] = col.defaultWidth;
    return w;
  });

  const widthsRef = useRef(widths);
  widthsRef.current = widths;

  const onMouseDown = useCallback((key: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startW = widthsRef.current[key] ?? 80;
    const col = columnsRef.current.find((c) => c.key === key);
    const minW = col?.minWidth ?? 30;

    const onMouseMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      const newW = Math.max(minW, startW + delta);
      setWidths((prev) => ({ ...prev, [key]: newW }));
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, []);

  return { widths, onMouseDown };
}
