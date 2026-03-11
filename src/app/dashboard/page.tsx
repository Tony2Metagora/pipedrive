"use client";

import { Suspense, useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Phone,
  Mail,
  MessageSquare,
  Calendar,
  CheckSquare,
  Check,
  ExternalLink,
  RefreshCw,
  Plus,
  Pencil,
  Save,
  Trophy,
  AlertTriangle,
  Clock,
  Archive,
  Trash2,
  Briefcase,
  ChevronDown,
  ChevronUp,
  Loader2,
  Search,
  Users,
  X,
  LayoutGrid,
  List,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate, isOverdue, isWithinDays, detectActivityType } from "@/lib/utils";
import { PIPELINES, getPipelineName, getStageName, getStagesForPipeline } from "@/lib/config";
import NewActivityModal from "@/components/NewActivityModal";
import ArchiveModal from "@/components/ArchiveModal";
import NewDealModal from "@/components/NewDealModal";
import DetailPanel from "@/components/DetailPanel";
import DealContextPanel from "@/components/DealContextPanel";

interface Activity {
  id: number;
  subject: string;
  type: string;
  due_date: string;
  due_time: string;
  done: boolean;
  deal_id: number | null;
  person_id: number | null;
  org_id: number | null;
  deal_title?: string;
  person_name?: string;
  org_name?: string;
}

interface Deal {
  id: number;
  title: string;
  person_id: number | null;
  org_id: number | null;
  pipeline_id: number;
  stage_id: number;
  value: number;
  currency: string;
  status: string;
  person_name?: string;
  org_name?: string;
  next_activity_date?: string;
  next_activity_subject?: string;
}

const TYPE_ICONS: Record<string, typeof Phone> = {
  call: Phone,
  email: Mail,
  sms: MessageSquare,
  meeting: Calendar,
  task: CheckSquare,
};

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>}>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const highlightDealId = searchParams.get("deal") ? Number(searchParams.get("deal")) : null;
  const [statusFilter, setStatusFilter] = useState<"all" | "urgent" | "sans_info">("all");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDeals, setLoadingDeals] = useState(true);
  const [archiveTarget, setArchiveTarget] = useState<{ activityId?: number | null; dealId: number | null; contactName: string } | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [selectedDeals, setSelectedDeals] = useState<Set<number>>(new Set());
  const [batchEnriching, setBatchEnriching] = useState(false);
  const [batchResults, setBatchResults] = useState<{ personId: number; personName: string; status: string; enriched?: Record<string, string | undefined> }[] | null>(null);
  const [batchProgress, setBatchProgress] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [pipelineFilter, setPipelineFilter] = useState<number | "all">("all");
  const [stageFilter, setStageFilter] = useState<number | "all">("all");
  const [viewMode, setViewMode] = useState<"list" | "kanban">("list");
  const [showNewDeal, setShowNewDeal] = useState(false);

  // Track IDs removed optimistically so background sync never brings them back
  const hiddenDealIds = useRef(new Set<number>());
  const hiddenActivityIds = useRef(new Set<number>());

  const fetchActivities = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/activities");
      const json = await res.json();
      const data: Activity[] = json.data || [];
      setActivities(data.filter((a) => !hiddenActivityIds.current.has(a.id)));
    } catch (err) {
      console.error("Erreur chargement activités:", err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const fetchDeals = useCallback(async (silent = false) => {
    if (!silent) setLoadingDeals(true);
    try {
      const res = await fetch("/api/deals?status=open");
      const json = await res.json();
      const data: Deal[] = json.data || [];
      // If a hidden deal no longer appears in API results, it was persisted — clear it
      for (const id of hiddenDealIds.current) {
        if (!data.some((d) => d.id === id)) hiddenDealIds.current.delete(id);
      }
      setDeals(data.filter((d) => !hiddenDealIds.current.has(d.id)));
    } catch (err) {
      console.error("Erreur chargement deals:", err);
    } finally {
      if (!silent) setLoadingDeals(false);
    }
  }, []);

  // Background sync: refresh data silently
  const syncBackground = useCallback(() => {
    fetchActivities(true);
    fetchDeals(true);
  }, [fetchActivities, fetchDeals]);

  useEffect(() => {
    fetchActivities();
    fetchDeals();
  }, [fetchActivities, fetchDeals]);

  // Optimistic markDone: remove activity from list immediately, delayed sync
  const markDone = async (id: number) => {
    hiddenActivityIds.current.add(id);
    setActivities((prev) => prev.filter((a) => a.id !== id));
    try {
      const res = await fetch(`/api/activities/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: 1 }),
      });
      if (!res.ok) console.error("markDone failed:", res.status, await res.text());
    } catch (err) {
      console.error("Erreur marquage done:", err);
    }
    // Safety-net sync — UI is already updated optimistically
    setTimeout(syncBackground, 5000);
  };

  // Callback for task creation: add new activity to local state optimistically
  const handleTaskCreated = useCallback((newActivity?: Activity) => {
    if (newActivity) {
      setActivities((prev) => [...prev, newActivity]);
    }
    // Safety-net sync — UI is already updated optimistically
    setTimeout(syncBackground, 5000);
  }, [syncBackground]);

  // Callback for inline activity edit: update local state optimistically
  const handleActivityUpdated = useCallback((id: number, data: Partial<Activity>) => {
    setActivities((prev) => prev.map((a) => a.id === id ? { ...a, ...data } : a));
  }, []);

  // Marquer une affaire comme gagnée
  const markWon = useCallback(async (dealId: number) => {
    hiddenDealIds.current.add(dealId);
    setDeals((prev) => prev.filter((d) => d.id !== dealId));
    try {
      await fetch(`/api/deals/${dealId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "won" }),
      });
    } catch (err) {
      console.error("Erreur marquage gagné:", err);
    }
    setTimeout(syncBackground, 5000);
  }, [syncBackground]);

  // Optimistic deal field update: update deals state directly
  const handleDealFieldUpdated = useCallback((dealId: number, fields: Partial<Deal>) => {
    setDeals((prev) => prev.map((d) => d.id === dealId ? { ...d, ...fields } : d));
  }, []);

  // Supprimer une activité
  const deleteActivityById = async (id: number) => {
    hiddenActivityIds.current.add(id);
    setActivities((prev) => prev.filter((a) => a.id !== id));
    try {
      await fetch(`/api/activities/${id}`, { method: "DELETE" });
    } catch (err) {
      console.error("Erreur suppression activité:", err);
    }
    setTimeout(syncBackground, 5000);
  };

  const openArchiveModal = (activityId: number | null, dealId: number | null, contactName: string) => {
    setArchiveTarget({ activityId, dealId, contactName });
  };

  const toggleDealSelection = (dealId: number) => {
    setSelectedDeals((prev) => {
      const next = new Set(prev);
      if (next.has(dealId)) next.delete(dealId);
      else next.add(dealId);
      return next;
    });
  };

  const selectAllDeals = (dealsList: Deal[]) => {
    const withPerson = dealsList.filter((d) => d.person_id);
    if (selectedDeals.size === withPerson.length && selectedDeals.size > 0) {
      setSelectedDeals(new Set());
    } else {
      setSelectedDeals(new Set(withPerson.map((d) => d.id)));
    }
  };

  const batchEnrich = async () => {
    const personIds = deals
      .filter((d) => selectedDeals.has(d.id) && d.person_id)
      .map((d) => d.person_id as number);
    const uniqueIds = [...new Set(personIds)];
    if (uniqueIds.length === 0) return;

    setBatchEnriching(true);
    setBatchResults(null);
    setBatchProgress(`Enrichissement de ${uniqueIds.length} contact${uniqueIds.length > 1 ? "s" : ""}...`);
    try {
      const res = await fetch("/api/enrich-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personIds: uniqueIds }),
      });
      const json = await res.json();
      if (json.data) {
        setBatchResults(json.data);
      } else {
        setBatchResults([]);
      }
      setSelectedDeals(new Set());
    } catch (err) {
      console.error("Erreur enrichissement batch:", err);
      setBatchProgress("Erreur lors de l'enrichissement");
    } finally {
      setBatchEnriching(false);
      setBatchProgress("");
    }
  };

  const openDetail = (activity: Activity) => {
    setSelectedActivity((prev) => prev?.id === activity.id ? null : activity);
  };

  // Search filter helper
  const q = searchQuery.toLowerCase().trim();
  const matchActivity = (a: Activity) =>
    !q ||
    a.subject?.toLowerCase().includes(q) ||
    a.person_name?.toLowerCase().includes(q) ||
    a.org_name?.toLowerCase().includes(q) ||
    a.deal_title?.toLowerCase().includes(q);
  const matchDeal = (d: Deal) => {
    if (q && !(
      d.title?.toLowerCase().includes(q) ||
      d.person_name?.toLowerCase().includes(q) ||
      d.org_name?.toLowerCase().includes(q)
    )) return false;
    if (pipelineFilter !== "all" && d.pipeline_id !== pipelineFilter) return false;
    if (stageFilter !== "all" && d.stage_id !== stageFilter) return false;
    return true;
  };

  // Available stages based on selected pipeline filter
  const availableStages = useMemo(() => {
    if (pipelineFilter === "all") return [];
    return getStagesForPipeline(pipelineFilter);
  }, [pipelineFilter]);

  // Deal counts per pipeline (for filter labels)
  const dealCountByPipeline = useMemo(() => {
    const counts = new Map<number, number>();
    for (const d of deals) {
      if (d.pipeline_id) counts.set(d.pipeline_id, (counts.get(d.pipeline_id) || 0) + 1);
    }
    return counts;
  }, [deals]);

  // Group pending activities by deal_id
  const activitiesByDeal = new Map<number, Activity[]>();
  for (const a of activities) {
    if (!matchActivity(a)) continue;
    if (a.deal_id) {
      const list = activitiesByDeal.get(a.deal_id) || [];
      list.push(a);
      activitiesByDeal.set(a.deal_id, list);
    }
  }

  // Compute earliest pending activity date per deal from ACTUAL activities
  const earliestActivityByDeal = (dealId: number): string | null => {
    const acts = activitiesByDeal.get(dealId);
    if (!acts || acts.length === 0) return null;
    return acts.reduce((earliest, a) =>
      !earliest || a.due_date < earliest ? a.due_date : earliest
    , "" as string) || null;
  };

  // Classify deals by urgency
  const allFilteredDeals = deals.filter(matchDeal);

  const isUrgentDeal = (d: Deal) => {
    const earliest = earliestActivityByDeal(d.id);
    return earliest !== null && isOverdue(earliest);
  };
  const isSansInfoDeal = (d: Deal) => {
    const earliest = earliestActivityByDeal(d.id);
    return earliest === null;
  };

  const urgentCount = allFilteredDeals.filter(isUrgentDeal).length;
  const sansInfoCount = allFilteredDeals.filter(isSansInfoDeal).length;

  // Apply status filter
  const filteredDeals = allFilteredDeals.filter((d) => {
    if (statusFilter === "urgent") return isUrgentDeal(d);
    if (statusFilter === "sans_info") return isSansInfoDeal(d);
    return true;
  });

  // Sort: urgent first (overdue), then sans info, then à jour
  const sortedDeals = [...filteredDeals].sort((a, b) => {
    const aUrgent = isUrgentDeal(a) ? 0 : isSansInfoDeal(a) ? 1 : 2;
    const bUrgent = isUrgentDeal(b) ? 0 : isSansInfoDeal(b) ? 1 : 2;
    return aUrgent - bUrgent;
  });

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher un nom, entreprise, deal..."
              className="pl-9 pr-8 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none w-72 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNewDeal(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Nouvelle affaire
          </button>
          <button
            onClick={syncBackground}
            disabled={loading || loadingDeals}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={cn("w-4 h-4", (loading || loadingDeals) && "animate-spin")} />
            Rafraîchir
          </button>
        </div>
      </div>

      {/* Barre de filtres unifiée */}
      <div className="flex items-center justify-between mb-4 bg-white rounded-lg border border-gray-200 p-2.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Filter className="w-4 h-4 text-gray-400 flex-shrink-0" />
          {/* Status filters */}
          <button
            onClick={() => setStatusFilter("all")}
            className={cn(
              "px-2.5 py-1 text-xs font-medium rounded-full border transition-colors cursor-pointer",
              statusFilter === "all"
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
            )}
          >
            Tous ({allFilteredDeals.length})
          </button>
          <button
            onClick={() => setStatusFilter(statusFilter === "urgent" ? "all" : "urgent")}
            className={cn(
              "px-2.5 py-1 text-xs font-medium rounded-full border transition-colors cursor-pointer",
              statusFilter === "urgent"
                ? "bg-red-600 text-white border-red-600"
                : "bg-white text-red-600 border-red-200 hover:bg-red-50"
            )}
          >
            <span className="inline-flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Urgent ({urgentCount})
            </span>
          </button>
          <button
            onClick={() => setStatusFilter(statusFilter === "sans_info" ? "all" : "sans_info")}
            className={cn(
              "px-2.5 py-1 text-xs font-medium rounded-full border transition-colors cursor-pointer",
              statusFilter === "sans_info"
                ? "bg-amber-600 text-white border-amber-600"
                : "bg-white text-amber-600 border-amber-200 hover:bg-amber-50"
            )}
          >
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Sans tâche ({sansInfoCount})
            </span>
          </button>
          {/* Pipeline filters */}
          <span className="text-gray-300 mx-0.5">|</span>
          {PIPELINES.map((p) => {
            const cnt = dealCountByPipeline.get(p.id) || 0;
            return (
              <button
                key={p.id}
                onClick={() => { setPipelineFilter(pipelineFilter === p.id ? "all" : p.id); setStageFilter("all"); }}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium rounded-full border transition-colors cursor-pointer",
                  pipelineFilter === p.id
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                )}
              >
                {p.name} ({cnt})
              </button>
            );
          })}
          {pipelineFilter !== "all" && availableStages.length > 0 && (
            <>
              <span className="text-gray-300 mx-0.5">|</span>
              {availableStages.map((s) => {
                const cnt = deals.filter((d) => d.stage_id === s.id).length;
                return (
                  <button
                    key={s.id}
                    onClick={() => setStageFilter(stageFilter === s.id ? "all" : s.id)}
                    className={cn(
                      "px-2 py-0.5 text-[11px] font-medium rounded-full border transition-colors cursor-pointer",
                      stageFilter === s.id
                        ? "bg-violet-600 text-white border-violet-600"
                        : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                    )}
                  >
                    {s.name} ({cnt})
                  </button>
                );
              })}
            </>
          )}
          <span className="text-xs text-gray-400 ml-1">
            {sortedDeals.length} affaire{sortedDeals.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-md p-0.5">
          <button
            onClick={() => setViewMode("list")}
            className={cn(
              "p-1.5 rounded transition-colors cursor-pointer",
              viewMode === "list" ? "bg-white shadow-sm text-indigo-700" : "text-gray-400 hover:text-gray-600"
            )}
            title="Vue liste"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode("kanban")}
            className={cn(
              "p-1.5 rounded transition-colors cursor-pointer",
              viewMode === "kanban" ? "bg-white shadow-sm text-indigo-700" : "text-gray-400 hover:text-gray-600"
            )}
            title="Vue kanban"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Contenu principal */}
      {(loading || loadingDeals) && activities.length === 0 && deals.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : sortedDeals.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <CheckSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">Aucune affaire</p>
          <p className="text-sm mt-1">Aucune affaire ne correspond aux filtres sélectionnés.</p>
        </div>
      ) : viewMode === "list" ? (
        <div className="space-y-2">
          {/* Toolbar : sélection + enrichissement batch */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => selectAllDeals(sortedDeals)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <Users className="w-3.5 h-3.5" />
                {selectedDeals.size === sortedDeals.filter((d: Deal) => d.person_id).length && selectedDeals.size > 0
                  ? "Tout désélectionner"
                  : "Tout sélectionner"}
              </button>
              {selectedDeals.size > 0 && (
                <span className="text-xs font-medium text-indigo-600">
                  {selectedDeals.size} sélectionnée{selectedDeals.size > 1 ? "s" : ""}
                </span>
              )}
            </div>
            {selectedDeals.size > 0 && (
              <button
                onClick={batchEnrich}
                disabled={batchEnriching}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer shadow-sm"
              >
                {batchEnriching ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                {batchEnriching ? batchProgress : `Enrichir ${selectedDeals.size} contact${selectedDeals.size > 1 ? "s" : ""} (Dropcontact)`}
              </button>
            )}
          </div>

          {/* Bannière résultats batch */}
          {batchResults && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-blue-800 flex items-center gap-2">
                  <Search className="w-4 h-4" />
                  Résultats enrichissement ({batchResults.length} contact{batchResults.length > 1 ? "s" : ""})
                </h3>
                <button
                  onClick={() => setBatchResults(null)}
                  className="text-blue-400 hover:text-blue-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-1">
                {batchResults.map((r) => (
                  <div key={r.personId} className="flex items-center gap-2 text-xs">
                    <span className={cn(
                      "w-2 h-2 rounded-full flex-shrink-0",
                      r.status === "enriched" ? "bg-green-500" : r.status === "error" ? "bg-red-500" : "bg-gray-400"
                    )} />
                    <span className="font-medium text-gray-800">{r.personName}</span>
                    {r.status === "enriched" && r.enriched && (
                      <span className="text-green-700">
                        — {[r.enriched.email && "email", r.enriched.phone && "tél", r.enriched.job_title && "poste", r.enriched.linkedin && "LinkedIn"].filter(Boolean).join(", ")}
                      </span>
                    )}
                    {r.status === "no_result" && <span className="text-gray-500">— aucun résultat</span>}
                    {r.status === "no_person" && <span className="text-gray-500">— contact introuvable</span>}
                    {r.status === "error" && <span className="text-red-600">— erreur</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bannière loading batch */}
          {batchEnriching && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 mb-4 flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
              <p className="text-sm font-medium text-blue-800">{batchProgress}</p>
              <p className="text-xs text-blue-500">Cela peut prendre quelques minutes...</p>
            </div>
          )}

          {sortedDeals.map((deal: Deal) => (
            <DealRow
              key={deal.id}
              deal={deal}
              dealActivities={activitiesByDeal.get(deal.id) || []}
              onTaskCreated={handleTaskCreated}
              onMarkDone={markDone}
              onArchive={openArchiveModal}
              onWon={markWon}
              onActivityUpdated={handleActivityUpdated}
              onDeleteActivity={deleteActivityById}
              selected={selectedDeals.has(deal.id)}
              onToggleSelect={toggleDealSelection}
              onDealUpdated={handleDealFieldUpdated}
              initialExpanded={highlightDealId === deal.id}
            />
          ))}
        </div>
      ) : (
        <KanbanView
          deals={sortedDeals}
          activitiesByDeal={activitiesByDeal}
          pipelineFilter={pipelineFilter}
          onDealMoved={syncBackground}
        />
      )}

      {/* Modal nouvelle affaire */}
      {showNewDeal && (
        <NewDealModal
          onClose={() => setShowNewDeal(false)}
          onCreated={(deal) => {
            setDeals((prev) => [...prev, deal]);
            setTimeout(syncBackground, 5000);
          }}
        />
      )}

      {/* Modal archivage */}
      {archiveTarget && (
        <ArchiveModal
          activityId={archiveTarget.activityId}
          dealId={archiveTarget.dealId}
          contactName={archiveTarget.contactName}
          onClose={() => setArchiveTarget(null)}
          onArchived={() => {
            setArchiveTarget(null);
            // Optimistic: remove the deal and its activities from local state
            if (archiveTarget.dealId) {
              hiddenDealIds.current.add(archiveTarget.dealId);
              setDeals((prev) => prev.filter((d) => d.id !== archiveTarget.dealId));
              setActivities((prev) => prev.filter((a) => a.deal_id !== archiveTarget.dealId));
            }
            if (archiveTarget.activityId) {
              setActivities((prev) => prev.filter((a) => a.id !== archiveTarget.activityId));
            }
            setTimeout(syncBackground, 5000);
          }}
        />
      )}
    </div>
  );
}

/* ─── Vue Kanban ─── */

function KanbanView({
  deals,
  activitiesByDeal,
  pipelineFilter,
  onDealMoved,
}: {
  deals: Deal[];
  activitiesByDeal: Map<number, Activity[]>;
  pipelineFilter: number | "all";
  onDealMoved: () => void;
}) {
  const [dragDealId, setDragDealId] = useState<number | null>(null);
  const [dropStageId, setDropStageId] = useState<number | null>(null);
  const [moving, setMoving] = useState(false);

  const handleDragStart = (e: React.DragEvent, dealId: number) => {
    setDragDealId(dealId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(dealId));
  };

  const handleDragOver = (e: React.DragEvent, stageId: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropStageId(stageId);
  };

  const handleDragLeave = () => {
    setDropStageId(null);
  };

  const handleDrop = async (e: React.DragEvent, stageId: number) => {
    e.preventDefault();
    setDropStageId(null);
    const dealId = Number(e.dataTransfer.getData("text/plain"));
    if (!dealId || isNaN(dealId)) return;
    const deal = deals.find((d) => d.id === dealId);
    if (!deal || deal.stage_id === stageId) { setDragDealId(null); return; }
    setMoving(true);
    try {
      await fetch(`/api/deals/${dealId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage_id: stageId }),
      });
      deal.stage_id = stageId;
      onDealMoved();
    } catch (err) {
      console.error("Erreur déplacement affaire:", err);
    } finally {
      setMoving(false);
      setDragDealId(null);
    }
  };

  // Group deals by pipeline, then by stage
  const pipelines = pipelineFilter !== "all"
    ? PIPELINES.filter((p) => p.id === pipelineFilter)
    : (() => {
        const pipeIds = new Set(deals.map((d) => d.pipeline_id));
        return PIPELINES.filter((p) => pipeIds.has(p.id));
      })();

  if (pipelines.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <Briefcase className="w-10 h-10 mx-auto mb-3 opacity-50" />
        <p className="text-sm">Aucune affaire à afficher en kanban</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {moving && (
        <div className="fixed top-4 right-4 z-50 bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium shadow-lg flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Déplacement...
        </div>
      )}
      {pipelines.map((pipeline) => {
        const pipeDeals = deals.filter((d) => d.pipeline_id === pipeline.id);
        if (pipeDeals.length === 0 && pipelineFilter === "all") return null;
        return (
          <div key={pipeline.id}>
            {pipelines.length > 1 && (
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-indigo-500" />
                {pipeline.name}
                <span className="text-xs text-gray-400 font-normal">({pipeDeals.length} affaire{pipeDeals.length !== 1 ? "s" : ""})</span>
              </h3>
            )}
            <div className="flex gap-3 overflow-x-auto pb-2">
              {pipeline.stages.map((stage) => {
                const stageDeals = pipeDeals.filter((d) => d.stage_id === stage.id);
                const totalValue = stageDeals.reduce((sum, d) => sum + (d.value || 0), 0);
                const isDropTarget = dropStageId === stage.id && dragDealId !== null;
                return (
                  <div
                    key={stage.id}
                    className={cn(
                      "flex-shrink-0 w-56 rounded-lg border transition-colors",
                      isDropTarget
                        ? "bg-indigo-50 border-indigo-300 ring-2 ring-indigo-200"
                        : "bg-gray-50 border-gray-200"
                    )}
                    onDragOver={(e) => handleDragOver(e, stage.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, stage.id)}
                  >
                    {/* Column header */}
                    <div className="px-3 py-2 border-b border-gray-200 bg-white rounded-t-lg">
                      <p className="text-xs font-semibold text-gray-700 capitalize">{stage.name}</p>
                      <p className="text-[10px] text-gray-400">
                        {totalValue > 0 ? `${totalValue.toLocaleString("fr-FR")} €` : "0 €"} · {stageDeals.length} affaire{stageDeals.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                    {/* Cards */}
                    <div className="p-2 space-y-2 max-h-[60vh] overflow-y-auto min-h-[60px]">
                      {stageDeals.length === 0 ? (
                        <p className="text-[9px] text-gray-300 text-center py-4">
                          {isDropTarget ? "Déposer ici" : "Aucune affaire"}
                        </p>
                      ) : (
                        stageDeals.map((deal) => {
                          const acts = activitiesByDeal.get(deal.id) || [];
                          const nextAct = acts.length > 0
                            ? acts.reduce((a, b) => (a.due_date < b.due_date ? a : b))
                            : null;
                          const isLate = nextAct ? isOverdue(nextAct.due_date) : false;
                          const isDragging = dragDealId === deal.id;
                          return (
                            <div
                              key={deal.id}
                              draggable
                              onDragStart={(e) => handleDragStart(e, deal.id)}
                              onDragEnd={() => { setDragDealId(null); setDropStageId(null); }}
                              className={cn(
                                "bg-white rounded-md border border-gray-200 p-2.5 hover:shadow-md transition-all cursor-grab active:cursor-grabbing group",
                                isDragging && "opacity-40 scale-95"
                              )}
                            >
                              <Link href={`/deal/${deal.id}`} className="block">
                                <p className="text-xs font-semibold text-gray-900 truncate group-hover:text-indigo-700">{deal.title}</p>
                                {(deal.org_name || deal.person_name) && (
                                  <p className="text-[10px] text-gray-500 truncate mt-0.5">
                                    {[deal.org_name, deal.person_name].filter(Boolean).join(", ")}
                                  </p>
                                )}
                                {deal.value > 0 && (
                                  <p className="text-[10px] font-medium text-gray-600 mt-1">
                                    {deal.value.toLocaleString("fr-FR")} {deal.currency}
                                  </p>
                                )}
                                {nextAct && (
                                  <div className={cn(
                                    "flex items-center gap-1 mt-1.5 text-[9px] rounded px-1.5 py-0.5 w-fit",
                                    isLate ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-500"
                                  )}>
                                    {isLate ? (
                                      <AlertTriangle className="w-2.5 h-2.5" />
                                    ) : (
                                      <Clock className="w-2.5 h-2.5" />
                                    )}
                                    {formatDate(nextAct.due_date)}
                                  </div>
                                )}
                                {!nextAct && (
                                  <div className="flex items-center gap-1 mt-1.5 text-[9px] rounded px-1.5 py-0.5 w-fit bg-red-50 text-red-500">
                                    <AlertTriangle className="w-2.5 h-2.5" />
                                    Aucune tâche
                                  </div>
                                )}
                              </Link>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ActivitySection({
  title,
  icon,
  activities,
  onMarkDone,
  onDelete,
  onSelect,
  selectedId,
  variant,
}: {
  title: string;
  icon: React.ReactNode;
  activities: Activity[];
  onMarkDone: (id: number) => void;
  onDelete: (id: number) => void;
  onSelect: (activity: Activity) => void;
  selectedId: number | null;
  variant: "urgent" | "upcoming" | "later";
}) {
  const borderColor = {
    urgent: "border-red-200 bg-red-50/50",
    upcoming: "border-amber-200 bg-amber-50/50",
    later: "border-gray-200 bg-white",
  }[variant];

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <span className="text-sm text-gray-400 ml-1">({activities.length})</span>
      </div>
      <div className="space-y-2">
        {activities.map((activity) => (
          <div key={activity.id}>
            <ActivityRow
              activity={activity}
              onMarkDone={onMarkDone}
              onDelete={onDelete}
              onSelect={onSelect}
              isSelected={selectedId === activity.id}
              className={borderColor}
            />
            {selectedId === activity.id && activity.person_id && (
              <DetailPanel personId={activity.person_id} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivityRow({
  activity,
  onMarkDone,
  onDelete,
  onSelect,
  isSelected,
  className,
}: {
  activity: Activity;
  onMarkDone: (id: number) => void;
  onDelete: (id: number) => void;
  onSelect: (activity: Activity) => void;
  isSelected: boolean;
  className?: string;
}) {
  const [markingDone, setMarkingDone] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const detectedType = detectActivityType(activity.subject);
  const IconComponent = TYPE_ICONS[detectedType] || CheckSquare;

  const handleDone = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMarkingDone(true);
    await onMarkDone(activity.id);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleting(true);
    onDelete(activity.id);
  };

  const handleClick = () => {
    if (activity.person_id) {
      onSelect(activity);
    }
  };

  return (
    <div
      className={cn(
        "flex items-center gap-4 p-4 rounded-xl border transition-all hover:shadow-md group",
        activity.person_id && "cursor-pointer",
        className
      )}
    >
      {/* Icône type */}
      <div className="flex-shrink-0">
        <div className="w-9 h-9 rounded-lg bg-white border border-gray-200 flex items-center justify-center">
          <IconComponent className="w-4 h-4 text-gray-600" />
        </div>
      </div>

      {/* Contenu — cliquable pour ouvrir le panneau de détail */}
      <div className="flex-1 min-w-0" onClick={handleClick}>
        <p className="font-medium text-gray-900 truncate group-hover:text-indigo-600 transition-colors">
          {activity.subject}
        </p>
        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
          {activity.deal_title && (
            <span className="font-medium text-indigo-500">{activity.deal_title}</span>
          )}
          {activity.person_name && (
            <>
              {activity.deal_title && <span className="text-gray-300">•</span>}
              <span>{activity.person_name}</span>
            </>
          )}
          {activity.org_name && (
            <>
              <span className="text-gray-300">•</span>
              <span>{activity.org_name}</span>
            </>
          )}
          {activity.person_id && (
            <span className={cn(
              "text-[10px] font-medium",
              isSelected ? "text-indigo-600" : "text-indigo-400"
            )}>
              {isSelected ? "▲ Masquer" : "▼ Détails"}
            </span>
          )}
        </div>
      </div>

      {/* Date */}
      <div className="flex-shrink-0 text-sm text-gray-500">
        {formatDate(activity.due_date)}
      </div>

      {/* Actions — boutons bien visibles */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={handleDone}
          disabled={markingDone || deleting}
          title="Marquer comme fait"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-green-200 text-green-700 bg-green-50 hover:bg-green-100 hover:border-green-300 transition-colors cursor-pointer disabled:opacity-50"
        >
          {markingDone ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Check className="w-3.5 h-3.5" />
          )}
          Done
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting || markingDone}
          title="Supprimer cette tâche"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 hover:border-red-300 transition-colors cursor-pointer disabled:opacity-50"
        >
          {deleting ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Trash2 className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}

/* ─── Deal Row (onglet À traiter) ─── */

function DealRow({
  deal,
  dealActivities,
  onTaskCreated,
  onMarkDone,
  onArchive,
  onWon,
  onActivityUpdated,
  onDeleteActivity,
  selected,
  onToggleSelect,
  onDealUpdated,
  initialExpanded,
}: {
  deal: Deal;
  dealActivities?: Activity[];
  onTaskCreated: (newActivity?: Activity) => void;
  onMarkDone?: (id: number) => void;
  onArchive: (activityId: number | null, dealId: number | null, contactName: string) => void;
  onWon: (dealId: number) => void;
  onActivityUpdated: (id: number, data: Partial<Activity>) => void;
  onDeleteActivity?: (id: number) => void;
  selected: boolean;
  onToggleSelect: (dealId: number) => void;
  onDealUpdated?: (dealId: number, fields: Partial<Deal>) => void;
  initialExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(initialExpanded || false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [editingValue, setEditingValue] = useState(false);
  const [valueInput, setValueInput] = useState(String(deal.value || 0));
  const [savingValue, setSavingValue] = useState(false);
  const [editingPipeline, setEditingPipeline] = useState(false);
  const [selectedPipelineId, setSelectedPipelineId] = useState(deal.pipeline_id);
  const [selectedStageId, setSelectedStageId] = useState(deal.stage_id);
  const [savingPipeline, setSavingPipeline] = useState(false);
  const [taskSubject, setTaskSubject] = useState("");
  const [taskType, setTaskType] = useState("call");
  const [taskDate, setTaskDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  });
  const [creatingTask, setCreatingTask] = useState(false);
  const [participants, setParticipants] = useState<{ id: number; name: string; email: { value: string; primary: boolean }[]; phone: { value: string; primary: boolean }[]; job_title?: string; primary: boolean }[]>([]);
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [participantsFetched, setParticipantsFetched] = useState(false);
  const [editingActivityId, setEditingActivityId] = useState<number | null>(null);
  const [editActivitySubject, setEditActivitySubject] = useState("");
  const [editActivityDate, setEditActivityDate] = useState("");
  const [savingActivity, setSavingActivity] = useState(false);
  const [contextRefreshKey, setContextRefreshKey] = useState(0);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(deal.title);
  const [savingTitle, setSavingTitle] = useState(false);

  // Sync local state when parent deal prop changes (e.g. after background sync or optimistic update)
  useEffect(() => {
    if (!editingPipeline) {
      setSelectedPipelineId(deal.pipeline_id);
      setSelectedStageId(deal.stage_id);
    }
  }, [deal.pipeline_id, deal.stage_id, editingPipeline]);

  useEffect(() => {
    if (!editingTitle) setTitleInput(deal.title);
  }, [deal.title, editingTitle]);

  useEffect(() => {
    if (!editingValue) setValueInput(String(deal.value || 0));
  }, [deal.value, editingValue]);

  const saveTitle = async () => {
    const trimmed = titleInput.trim();
    if (!trimmed || trimmed === deal.title) { setEditingTitle(false); setTitleInput(deal.title); return; }
    setSavingTitle(true);
    // Optimistic: update deal title in parent state
    onDealUpdated?.(deal.id, { title: trimmed });
    try {
      await fetch(`/api/deals/${deal.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
    } catch (err) {
      console.error("Erreur modification titre:", err);
    } finally {
      setSavingTitle(false);
      setEditingTitle(false);
    }
  };

  const startEditActivity = (a: Activity) => {
    setEditingActivityId(a.id);
    setEditActivitySubject(a.subject);
    setEditActivityDate(a.due_date);
  };

  const saveActivity = async () => {
    if (!editingActivityId || !editActivitySubject.trim()) return;
    setSavingActivity(true);
    const updatedData = { subject: editActivitySubject.trim(), due_date: editActivityDate };
    // Optimistic: update local state immediately
    onActivityUpdated(editingActivityId, updatedData);
    try {
      const res = await fetch(`/api/activities/${editingActivityId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedData),
      });
      if (!res.ok) console.error("saveActivity failed:", res.status, await res.text());
    } catch (err) {
      console.error("Erreur modification activité:", err);
    } finally {
      setSavingActivity(false);
      setEditingActivityId(null);
      setContextRefreshKey((k) => k + 1);
      setTimeout(() => onTaskCreated(), 5000);
    }
  };

  const savePipelineStage = async () => {
    setSavingPipeline(true);
    try {
      const payload: Record<string, unknown> = {};
      if (selectedPipelineId !== deal.pipeline_id) payload.pipeline_id = selectedPipelineId;
      if (selectedStageId !== deal.stage_id) payload.stage_id = selectedStageId;
      if (Object.keys(payload).length === 0) { setEditingPipeline(false); setSavingPipeline(false); return; }
      const res = await fetch(`/api/deals/${deal.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        onDealUpdated?.(deal.id, { pipeline_id: selectedPipelineId, stage_id: selectedStageId });
        setEditingPipeline(false);
      } else {
        console.error("savePipelineStage failed:", res.status, await res.text().catch(() => ""));
        alert("Erreur lors de la mise à jour du pipeline. Réessayez.");
      }
    } catch (err) {
      console.error("Erreur mise à jour pipeline/stage:", err);
      alert("Erreur réseau lors de la mise à jour du pipeline.");
    } finally {
      setSavingPipeline(false);
    }
  };

  const saveValue = async () => {
    const newValue = Number(valueInput) || 0;
    setSavingValue(true);
    try {
      const res = await fetch(`/api/deals/${deal.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: newValue }),
      });
      const json = await res.json();
      if (!res.ok) {
        console.error("Erreur API mise à jour valeur:", json);
      } else {
        onDealUpdated?.(deal.id, { value: newValue, currency: deal.currency || "EUR" });
        setEditingValue(false);
      }
    } catch (err) {
      console.error("Erreur mise à jour valeur:", err);
    } finally {
      setSavingValue(false);
    }
  };

  // Fetch participants when expanded for the first time
  useEffect(() => {
    if (expanded && !participantsFetched) {
      setLoadingParticipants(true);
      fetch(`/api/deals/${deal.id}/participants`)
        .then((res) => res.json())
        .then((json) => {
          if (json.data) {
            // Mark the main person_id as primary if no primary_flag from API
            const parts = json.data.map((p: { id: number; name: string; email: { value: string; primary: boolean }[]; phone: { value: string; primary: boolean }[]; job_title?: string; primary: boolean }) => ({
              ...p,
              primary: p.primary || p.id === deal.person_id,
            }));
            setParticipants(parts);
          }
        })
        .catch((err) => console.error("Erreur chargement participants:", err))
        .finally(() => {
          setLoadingParticipants(false);
          setParticipantsFetched(true);
        });
    }
  }, [expanded, participantsFetched, deal.id, deal.person_id]);

  const createTask = async () => {
    if (!taskSubject.trim()) return;
    setCreatingTask(true);
    try {
      const res = await fetch("/api/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: taskSubject.trim(),
          type: taskType,
          due_date: taskDate,
          deal_id: deal.id,
          person_id: deal.person_id,
          org_id: deal.org_id,
        }),
      });
      if (!res.ok) {
        console.error("createTask failed:", res.status, await res.text());
        return;
      }
      const json = await res.json();
      setTaskSubject("");
      setShowAddTask(false);
      // Optimistic: add the new activity to local state immediately
      if (json.data) {
        const enriched = {
          ...json.data,
          deal_id: deal.id,
          deal_title: deal.title,
          person_name: deal.person_name,
          org_name: deal.org_name,
          person_id: deal.person_id,
          org_id: deal.org_id,
        };
        onTaskCreated(enriched);
        // Update DealContextPanel immediately
        setContextRefreshKey((k) => k + 1);
      }
    } catch (err) {
      console.error("Erreur création tâche:", err);
    } finally {
      setCreatingTask(false);
    }
  };

  return (
    <div className={cn(
      "rounded-xl border bg-white overflow-hidden transition-colors",
      selected ? "border-blue-400 bg-blue-50/30" : "border-gray-200"
    )}>
      {/* Deal header */}
      <div
        className="flex items-center gap-4 p-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Checkbox */}
        {deal.person_id && (
          <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(deal.id)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
          </div>
        )}
        <div className="flex-shrink-0">
          <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center">
            <Briefcase className="w-4 h-4 text-indigo-600" />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          {editingTitle ? (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                className="flex-1 px-2 py-0.5 text-sm font-medium border border-indigo-300 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 outline-none"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveTitle();
                  if (e.key === "Escape") { setEditingTitle(false); setTitleInput(deal.title); }
                }}
              />
              <button onClick={saveTitle} disabled={savingTitle} className="p-0.5 text-green-600 hover:text-green-700 disabled:opacity-40 cursor-pointer">
                {savingTitle ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              </button>
              <button onClick={() => { setEditingTitle(false); setTitleInput(deal.title); }} className="p-0.5 text-gray-400 hover:text-gray-600 cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <p
              className="font-medium text-gray-900 truncate cursor-pointer hover:text-indigo-700"
              onClick={(e) => { e.stopPropagation(); setEditingTitle(true); setTitleInput(deal.title); }}
              title="Cliquer pour modifier le titre"
            >
              {deal.title}
            </p>
          )}
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500" onClick={(e) => e.stopPropagation()}>
            {editingPipeline ? (
              <div className="flex items-center gap-1.5">
                <select
                  value={selectedPipelineId}
                  onChange={(e) => {
                    const pid = Number(e.target.value);
                    setSelectedPipelineId(pid);
                    const stages = getStagesForPipeline(pid);
                    if (stages.length > 0) setSelectedStageId(stages[0]!.id);
                  }}
                  className="px-1.5 py-0.5 text-xs border border-indigo-300 rounded bg-white focus:ring-1 focus:ring-indigo-400 outline-none"
                >
                  {PIPELINES.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <span className="text-gray-300">→</span>
                <select
                  value={selectedStageId}
                  onChange={(e) => setSelectedStageId(Number(e.target.value))}
                  className="px-1.5 py-0.5 text-xs border border-indigo-300 rounded bg-white focus:ring-1 focus:ring-indigo-400 outline-none"
                >
                  {getStagesForPipeline(selectedPipelineId).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <button
                  onClick={savePipelineStage}
                  disabled={savingPipeline}
                  className="p-0.5 text-green-600 hover:text-green-700 disabled:opacity-40 cursor-pointer"
                >
                  {savingPipeline ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                </button>
                <button onClick={() => { setEditingPipeline(false); setSelectedPipelineId(deal.pipeline_id); setSelectedStageId(deal.stage_id); }} className="p-0.5 text-gray-400 hover:text-gray-600 cursor-pointer">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setEditingPipeline(true)}
                className="flex items-center gap-1.5 hover:underline cursor-pointer"
                title="Modifier pipeline / étape"
              >
                <span className="font-medium text-indigo-500">{getPipelineName(deal.pipeline_id)}</span>
                <span className="text-gray-300">→</span>
                <span className="font-medium">{getStageName(deal.stage_id)}</span>
              </button>
            )}
            {deal.person_name && (
              <>
                <span className="text-gray-300">•</span>
                <span>{deal.person_name}</span>
              </>
            )}
            {deal.org_name && (
              <>
                <span className="text-gray-300">•</span>
                <span>{deal.org_name}</span>
              </>
            )}
          </div>
        </div>

        {/* Valeur – éditable */}
        <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          {editingValue ? (
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                step={100}
                value={valueInput}
                onChange={(e) => setValueInput(e.target.value)}
                className="w-24 px-2 py-1 text-sm border border-indigo-300 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 outline-none"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveValue();
                  if (e.key === "Escape") { setEditingValue(false); setValueInput(String(deal.value || 0)); }
                }}
              />
              <span className="text-xs text-gray-400">€</span>
              <button
                onClick={saveValue}
                disabled={savingValue}
                className="p-1 text-green-600 hover:text-green-700 disabled:opacity-40 cursor-pointer"
              >
                {savingValue ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              </button>
              <button onClick={() => { setEditingValue(false); setValueInput(String(deal.value || 0)); }} className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setEditingValue(true); setValueInput(String(deal.value || 0)); }}
              className="text-sm font-semibold text-emerald-600 hover:text-emerald-800 cursor-pointer hover:underline"
              title="Modifier la valeur"
            >
              {deal.value > 0 ? `${deal.value.toLocaleString("fr-FR")} €` : "+ Valeur"}
            </button>
          )}
        </div>

        {/* Prochaine activité — computed from actual dealActivities */}
        {(() => {
          const nextDate = dealActivities && dealActivities.length > 0
            ? dealActivities.reduce((earliest, a) => (!earliest || a.due_date < earliest ? a.due_date : earliest), "" as string)
            : null;
          return (
            <div className="flex-shrink-0 text-xs text-gray-400">
              {nextDate ? (
                <span className={cn(
                  isOverdue(nextDate) && "text-red-500 font-medium"
                )}>
                  {formatDate(nextDate)}
                </span>
              ) : (
                <span className="text-amber-500 font-medium">Pas de tâche</span>
              )}
            </div>
          );
        })()}

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => { setShowAddTask(!showAddTask); setExpanded(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-green-200 text-green-700 bg-green-50 hover:bg-green-100 hover:border-green-300 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Tâche
          </button>
          <button
            onClick={() => onWon(deal.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-yellow-300 text-yellow-700 bg-yellow-50 hover:bg-yellow-100 hover:border-yellow-400 transition-colors cursor-pointer"
          >
            <Trophy className="w-3.5 h-3.5" />
            Gagné
          </button>
          <button
            onClick={() => onArchive(null, deal.id, deal.title)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-orange-200 text-orange-700 bg-orange-50 hover:bg-orange-100 hover:border-orange-300 transition-colors cursor-pointer"
          >
            <Archive className="w-3.5 h-3.5" />
            Archiver
          </button>
        </div>

        <div className="flex-shrink-0 text-gray-400">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </div>

      {/* Inline activities for this deal */}
      {dealActivities && dealActivities.length === 0 && (
        <div className="border-t border-gray-100 bg-red-50/60 px-4 py-2.5 flex items-center gap-2 text-xs text-red-500 font-medium">
          <AlertTriangle className="w-3.5 h-3.5" />
          Aucune tâche à faire
        </div>
      )}
      {dealActivities && dealActivities.length > 0 && (
        <div className="border-t border-gray-100 bg-amber-50/40 px-4 py-2 space-y-1">
          {dealActivities
            .sort((a, b) => new Date(b.due_date).getTime() - new Date(a.due_date).getTime())
            .map((a) => {
              const detectedType = detectActivityType(a.subject);
              const IconComp = TYPE_ICONS[detectedType] || CheckSquare;
              const overdue = isOverdue(a.due_date);
              const isEditingThis = editingActivityId === a.id;
              return (
                <div key={a.id} className={cn(
                  "flex items-center gap-2 py-1.5 px-2 rounded-lg text-xs",
                  overdue ? "bg-red-50 border border-red-100" : "bg-white border border-gray-100"
                )}>
                  <IconComp className={cn("w-3.5 h-3.5 flex-shrink-0", overdue ? "text-red-500" : "text-amber-500")} />
                  {isEditingThis ? (
                    <>
                      <input
                        type="text"
                        value={editActivitySubject}
                        onChange={(e) => setEditActivitySubject(e.target.value)}
                        className="flex-1 px-1.5 py-0.5 text-[11px] border border-gray-300 rounded focus:ring-1 focus:ring-indigo-400 outline-none"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => { if (e.key === "Enter") saveActivity(); if (e.key === "Escape") setEditingActivityId(null); }}
                      />
                      <input
                        type="date"
                        value={editActivityDate}
                        onChange={(e) => setEditActivityDate(e.target.value)}
                        className="w-28 px-1.5 py-0.5 text-[11px] border border-gray-300 rounded focus:ring-1 focus:ring-indigo-400 outline-none"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <button
                        onClick={(e) => { e.stopPropagation(); saveActivity(); }}
                        disabled={savingActivity}
                        className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 cursor-pointer disabled:opacity-50"
                      >
                        {savingActivity ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingActivityId(null); }}
                        className="flex items-center px-1.5 py-0.5 text-[10px] rounded border border-gray-200 text-gray-500 hover:bg-gray-100 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 truncate font-medium text-gray-700">{a.subject}</span>
                      {a.person_name && <span className="text-gray-400 text-[10px]">{a.person_name}</span>}
                      <span className={cn("text-[10px] flex-shrink-0", overdue ? "text-red-500 font-semibold" : "text-gray-400")}>
                        {formatDate(a.due_date)}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); startEditActivity(a); }}
                        className="flex items-center px-1.5 py-0.5 text-[10px] rounded border border-gray-200 text-gray-500 hover:bg-gray-100 cursor-pointer"
                        title="Modifier"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      {onMarkDone && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onMarkDone(a.id); setContextRefreshKey((k) => k + 1); }}
                          className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded border border-green-200 text-green-700 bg-green-50 hover:bg-green-100 cursor-pointer"
                        >
                          <Check className="w-3 h-3" />
                          Done
                        </button>
                      )}
                      {onDeleteActivity && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onDeleteActivity(a.id); setContextRefreshKey((k) => k + 1); }}
                          title="Supprimer cette tâche"
                          className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              );
            })}
        </div>
      )}

      {/* Expanded: add task form + contact detail */}
      {expanded && (
        <div className="border-t border-gray-100">
          {/* Add task form */}
          {showAddTask && (
            <div className="bg-green-50 border-b border-green-100 px-4 py-3">
              <div className="flex items-center gap-2">
                <select
                  value={taskType}
                  onChange={(e) => setTaskType(e.target.value)}
                  className="px-2 py-1.5 text-xs border border-gray-300 rounded-lg bg-white focus:ring-1 focus:ring-indigo-400 outline-none"
                >
                  <option value="call">Appel</option>
                  <option value="email">Email</option>
                  <option value="meeting">RDV</option>
                  <option value="task">Tâche</option>
                  <option value="sms">SMS</option>
                </select>
                <input
                  type="text"
                  value={taskSubject}
                  onChange={(e) => setTaskSubject(e.target.value)}
                  placeholder="Sujet de la tâche..."
                  className="flex-1 px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 outline-none"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") createTask(); if (e.key === "Escape") setShowAddTask(false); }}
                />
                <input
                  type="date"
                  value={taskDate}
                  onChange={(e) => setTaskDate(e.target.value)}
                  className="px-2 py-1.5 text-xs border border-gray-300 rounded-lg bg-white focus:ring-1 focus:ring-indigo-400 outline-none"
                />
                <button
                  onClick={createTask}
                  disabled={creatingTask || !taskSubject.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 cursor-pointer"
                >
                  {creatingTask ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  Créer
                </button>
              </div>
            </div>
          )}

          {/* Contacts */}
          {loadingParticipants && (
            <div className="px-4 py-3 flex items-center gap-2 text-xs text-gray-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Chargement des contacts...
            </div>
          )}

          {participantsFetched && participants.length > 1 && (
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                {participants.length} contacts liés à cette affaire
              </p>
              <div className="flex flex-wrap gap-1.5">
                {participants.map((p) => (
                  <button
                    key={p.id}
                    onClick={async () => {
                      if (p.primary) return;
                      try {
                        await fetch(`/api/deals/${deal.id}`, {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ person_id: p.id }),
                        });
                        setParticipants((prev) =>
                          prev.map((pp) => ({ ...pp, primary: pp.id === p.id }))
                        );
                        onDealUpdated?.(deal.id, { person_id: p.id, person_name: p.name });
                      } catch (err) {
                        console.error("Erreur changement contact principal:", err);
                      }
                    }}
                    className={cn(
                      "inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full border cursor-pointer transition-colors",
                      p.primary
                        ? "bg-indigo-100 border-indigo-300 text-indigo-800 font-semibold"
                        : "bg-white border-gray-200 text-gray-600 hover:bg-indigo-50 hover:border-indigo-200"
                    )}
                    title={p.primary ? "Contact principal" : "Cliquer pour définir comme contact principal"}
                  >
                    {p.primary ? <span className="text-[8px]">★</span> : <span className="text-[8px]">☆</span>}
                    {p.name}
                    {p.job_title && <span className="text-gray-400 font-normal">({p.job_title})</span>}
                    <span className={cn("text-[8px] ml-0.5", p.primary ? "text-indigo-500" : "text-gray-400")}>
                      {p.primary ? "principal" : "secondaire"}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Contact detail panels — side by side when multiple */}
          {participantsFetched && participants.length > 0 ? (
            <div className={cn(
              participants.length > 1 ? "grid grid-cols-2 gap-2 px-2" : ""
            )}>
              {participants
                .sort((a, b) => (b.primary ? 1 : 0) - (a.primary ? 1 : 0))
                .map((p) => (
                  <div key={p.id} className={cn(
                    participants.length > 1 && "border border-gray-200 rounded-lg overflow-hidden"
                  )}>
                    {participants.length > 1 && (
                      <div className={cn(
                        "px-3 py-1.5 flex items-center justify-between",
                        p.primary ? "bg-indigo-50 border-b border-indigo-100" : "bg-gray-50 border-b border-gray-100"
                      )}>
                        <span className={cn(
                          "text-[10px] font-semibold uppercase tracking-wide",
                          p.primary ? "text-indigo-600" : "text-gray-400"
                        )}>
                          {p.primary ? "★ Principal" : "Secondaire"} — {p.name}
                        </span>
                        {!p.primary && (
                          <button
                            onClick={async () => {
                              try {
                                await fetch(`/api/deals/${deal.id}`, {
                                  method: "PUT",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ person_id: p.id }),
                                });
                                setParticipants((prev) =>
                                  prev.map((pp) => ({ ...pp, primary: pp.id === p.id }))
                                );
                                onDealUpdated?.(deal.id, { person_id: p.id, person_name: p.name });
                              } catch (err) {
                                console.error("Erreur changement contact principal:", err);
                              }
                            }}
                            className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-600 hover:bg-indigo-200 font-medium cursor-pointer transition-colors"
                            title="Définir comme contact principal"
                          >
                            ★ Principal
                          </button>
                        )}
                      </div>
                    )}
                    <DetailPanel
                      personId={p.id}
                      allParticipants={participants.length > 1 ? participants : undefined}
                      dealId={deal.id}
                      orgId={deal.org_id}
                      onActivityCreated={onTaskCreated}
                      compact={participants.length > 1}
                    />
                  </div>
                ))}
            </div>
          ) : participantsFetched && participants.length === 0 && deal.person_id ? (
            <DetailPanel personId={deal.person_id} dealId={deal.id} orgId={deal.org_id} onActivityCreated={onTaskCreated} />
          ) : !deal.person_id && participantsFetched ? (
            <div className="px-4 py-3 text-xs text-gray-400">
              Aucun contact associé à cette affaire
            </div>
          ) : null}

          {/* Notes / Tâches / Historique — au niveau de l'affaire */}
          <DealContextPanel
            dealId={deal.id}
            personId={deal.person_id ?? undefined}
            orgId={deal.org_id}
            personName={deal.person_name}
            orgName={deal.org_name}
            onActivityChanged={onTaskCreated}
            onMarkDone={onMarkDone}
            refreshKey={contextRefreshKey}
            parentPendingIds={dealActivities?.map((a) => a.id)}
          />
        </div>
      )}
    </div>
  );
}
