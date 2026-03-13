"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Settings, Loader2, Save, Shield, Eye, Pencil, Ban,
  Users, Check, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types (mirrored from lib/permissions) ───────────────

type PermissionLevel = "none" | "read" | "write";

interface UserPermissions {
  email: string;
  name?: string;
  permissions: Record<string, PermissionLevel>;
}

interface PermissionsConfig {
  users: UserPermissions[];
  updated_at: string;
}

const VIEW_LABELS: Record<string, string> = {
  dashboard: "Affaires",
  prospects: "Prospects",
  pipeline: "Pipeline",
  import: "Import",
  scrapping: "Scrapping",
  landing: "Landing Generator",
  deal: "Fiche affaire",
};

const VIEW_KEYS = Object.keys(VIEW_LABELS);

const LEVEL_CONFIG: Record<PermissionLevel, { label: string; icon: typeof Eye; color: string; bg: string }> = {
  none: { label: "Aucun", icon: Ban, color: "text-red-600", bg: "bg-red-50 border-red-200" },
  read: { label: "Lecture", icon: Eye, color: "text-amber-600", bg: "bg-amber-50 border-amber-200" },
  write: { label: "Lecture + Écriture", icon: Pencil, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" },
};

const LEVELS: PermissionLevel[] = ["none", "read", "write"];

export default function AdminPage() {
  const router = useRouter();
  const [config, setConfig] = useState<PermissionsConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const fetchConfig = useCallback(async () => {
    try {
      const meRes = await fetch("/api/auth/me");
      const me = await meRes.json();
      if (!me.isAdmin) {
        router.push("/dashboard");
        return;
      }
      setIsAdmin(true);

      const res = await fetch("/api/admin/permissions");
      const json = await res.json();
      if (json.data) setConfig(json.data);
      else setError(json.error || "Erreur chargement");
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleChange = (email: string, view: string, level: PermissionLevel) => {
    if (!config) return;
    setConfig((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        users: prev.users.map((u) =>
          u.email === email
            ? { ...u, permissions: { ...u.permissions, [view]: level } }
            : u
        ),
      };
    });
    setSuccess(false);
  };

  const handleSetAll = (email: string, level: PermissionLevel) => {
    if (!config) return;
    setConfig((prev) => {
      if (!prev) return prev;
      const perms: Record<string, PermissionLevel> = {};
      VIEW_KEYS.forEach((k) => { perms[k] = level; });
      return {
        ...prev,
        users: prev.users.map((u) =>
          u.email === email ? { ...u, permissions: perms } : u
        ),
      };
    });
    setSuccess(false);
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch("/api/admin/permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const json = await res.json();
      if (json.error) {
        setError(json.error);
      } else {
        setConfig(json.data);
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Settings className="w-5 h-5 text-indigo-600" />
            Administration — Gestion des accès
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Gérez les permissions de chaque membre de l&apos;équipe
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !config}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors cursor-pointer"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Sauvegarder
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}
      {success && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 flex items-center gap-2">
          <Check className="w-4 h-4 flex-shrink-0" />Permissions sauvegardées avec succès
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="font-medium">Niveaux :</span>
        {LEVELS.map((l) => {
          const cfg = LEVEL_CONFIG[l];
          return (
            <span key={l} className={cn("inline-flex items-center gap-1 px-2 py-1 rounded border", cfg.bg)}>
              <cfg.icon className={cn("w-3 h-3", cfg.color)} />
              <span className={cfg.color}>{cfg.label}</span>
            </span>
          );
        })}
      </div>

      {/* User cards */}
      {config?.users.map((user) => {
        const isAdminUser = user.email === "tony@metagora.tech";
        return (
          <div key={user.email} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className={cn("w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold",
                  isAdminUser ? "bg-indigo-600" : "bg-gray-500")}>
                  {(user.name || user.email[0]).charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-gray-900">
                      {user.name || user.email.split("@")[0]}
                    </span>
                    {isAdminUser && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-medium">
                        <Shield className="w-3 h-3" />Admin
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">{user.email}</span>
                </div>
              </div>
              {!isAdminUser && (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-400 mr-2">Tout mettre :</span>
                  {LEVELS.map((l) => {
                    const cfg = LEVEL_CONFIG[l];
                    return (
                      <button key={l} onClick={() => handleSetAll(user.email, l)}
                        className={cn("px-2 py-1 text-[10px] font-medium rounded border cursor-pointer transition-colors", cfg.bg, cfg.color, "hover:opacity-80")}>
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="grid grid-cols-7 gap-0">
              {VIEW_KEYS.map((view) => {
                const current = user.permissions[view] || "none";
                const cfg = LEVEL_CONFIG[current];
                return (
                  <div key={view} className="px-3 py-3 border-r border-b border-gray-100 last:border-r-0">
                    <div className="text-[10px] font-medium text-gray-500 mb-2 truncate">
                      {VIEW_LABELS[view]}
                    </div>
                    {isAdminUser ? (
                      <div className={cn("inline-flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-medium", LEVEL_CONFIG.write.bg, LEVEL_CONFIG.write.color)}>
                        <Pencil className="w-3 h-3" />Complet
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {LEVELS.map((l) => {
                          const lCfg = LEVEL_CONFIG[l];
                          const isActive = current === l;
                          return (
                            <button
                              key={l}
                              onClick={() => handleChange(user.email, view, l)}
                              className={cn(
                                "flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-medium cursor-pointer transition-all",
                                isActive ? cn(lCfg.bg, lCfg.color, "ring-1 ring-offset-1", l === "none" ? "ring-red-300" : l === "read" ? "ring-amber-300" : "ring-emerald-300") : "border-gray-100 text-gray-400 hover:border-gray-300"
                              )}
                            >
                              <lCfg.icon className="w-3 h-3" />
                              {lCfg.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Info */}
      <div className="text-xs text-gray-400 flex items-center gap-2">
        <Users className="w-3.5 h-3.5" />
        {config?.users.length} utilisateurs configurés
        {config?.updated_at && ` — dernière mise à jour : ${new Date(config.updated_at).toLocaleString("fr-FR")}`}
      </div>
    </div>
  );
}
