"use client";

import { useState, useEffect } from "react";
import type { PermissionLevel, ViewKey } from "@/lib/permissions";

interface UserInfo {
  email: string;
  name: string;
  isAdmin: boolean;
  permissions: Record<ViewKey, PermissionLevel>;
  loading: boolean;
}

const cache: { data: UserInfo | null; ts: number } = { data: null, ts: 0 };
const CACHE_TTL = 60_000; // 1 min

export function usePermissions(): UserInfo {
  const [info, setInfo] = useState<UserInfo>({
    email: "",
    name: "",
    isAdmin: false,
    permissions: {
      dashboard: "none",
      prospects: "none",
      pipeline: "none",
      import: "none",
      scrapping: "none",
      landing: "none",
      deal: "none",
    },
    loading: true,
  });

  useEffect(() => {
    if (cache.data && Date.now() - cache.ts < CACHE_TTL) {
      setInfo({ ...cache.data, loading: false });
      return;
    }
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.email) {
          const result: UserInfo = {
            email: data.email,
            name: data.name,
            isAdmin: data.isAdmin,
            permissions: data.permissions,
            loading: false,
          };
          cache.data = result;
          cache.ts = Date.now();
          setInfo(result);
        } else {
          setInfo((prev) => ({ ...prev, loading: false }));
        }
      })
      .catch(() => setInfo((prev) => ({ ...prev, loading: false })));
  }, []);

  return info;
}

/** Check if user can write to a specific view */
export function canWrite(
  permissions: Record<ViewKey, PermissionLevel>,
  view: ViewKey
): boolean {
  return permissions[view] === "write";
}

/** Check if user can at least read a specific view */
export function canRead(
  permissions: Record<ViewKey, PermissionLevel>,
  view: ViewKey
): boolean {
  return permissions[view] === "read" || permissions[view] === "write";
}
