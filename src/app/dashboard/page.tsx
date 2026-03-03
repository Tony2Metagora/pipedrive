"use client";

import { useEffect, useState, useCallback } from "react";
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
  AlertTriangle,
  Clock,
  Archive,
  Briefcase,
  ChevronDown,
  ChevronUp,
  Loader2,
  Search,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate, isOverdue, isWithinDays, detectActivityType } from "@/lib/utils";
import { getPipelineName, getStageName } from "@/lib/config";
import NewActivityModal from "@/components/NewActivityModal";
import ArchiveModal from "@/components/ArchiveModal";
import DetailPanel from "@/components/DetailPanel";

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
  const [tab, setTab] = useState<"urgent" | "traiter">("urgent");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDeals, setLoadingDeals] = useState(true);
  const [archiveTarget, setArchiveTarget] = useState<{ activityId: number; dealId: number | null; contactName: string } | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [selectedDeals, setSelectedDeals] = useState<Set<number>>(new Set());
  const [batchEnriching, setBatchEnriching] = useState(false);
  const [batchResults, setBatchResults] = useState<{ personId: number; personName: string; status: string; enriched?: Record<string, string | undefined> }[] | null>(null);
  const [batchProgress, setBatchProgress] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const fetchActivities = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/activities");
      const json = await res.json();
      setActivities(json.data || []);
    } catch (err) {
      console.error("Erreur chargement activités:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDeals = useCallback(async () => {
    setLoadingDeals(true);
    try {
      const res = await fetch("/api/deals?status=open");
      const json = await res.json();
      setDeals(json.data || []);
    } catch (err) {
      console.error("Erreur chargement deals:", err);
    } finally {
      setLoadingDeals(false);
    }
  }, []);

  useEffect(() => {
    fetchActivities();
    fetchDeals();
  }, [fetchActivities, fetchDeals]);

  const markDone = async (id: number) => {
    try {
      await fetch(`/api/activities/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: 1 }),
      });
      fetchActivities();
      fetchDeals();
    } catch (err) {
      console.error("Erreur marquage done:", err);
    }
  };

  const openArchiveModal = (activityId: number, dealId: number | null, contactName: string) => {
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
  const matchDeal = (d: Deal) =>
    !q ||
    d.title?.toLowerCase().includes(q) ||
    d.person_name?.toLowerCase().includes(q) ||
    d.org_name?.toLowerCase().includes(q);

  // Activités classées par date (filtrées par recherche)
  const urgentActivities = activities.filter((a) => isOverdue(a.due_date) && matchActivity(a));
  const upcoming = activities.filter(
    (a) => !isOverdue(a.due_date) && isWithinDays(a.due_date, 7) && matchActivity(a)
  );
  const later = activities.filter(
    (a) => !isOverdue(a.due_date) && !isWithinDays(a.due_date, 7) && matchActivity(a)
  );

  // Deals classés : urgent = pas de prochaine activité OU activité en retard (filtrés par recherche)
  const urgentDeals = deals.filter(
    (d) => (!d.next_activity_date || isOverdue(d.next_activity_date)) && matchDeal(d)
  );
  const okDeals = deals.filter(
    (d) => d.next_activity_date && !isOverdue(d.next_activity_date) && matchDeal(d)
  );
  const totalUrgent = urgentActivities.length + urgentDeals.length;

  return (
    <div>
      {/* Header with tabs */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setTab("urgent")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer",
              tab === "urgent"
                ? "bg-white text-red-700 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            )}
          >
            <AlertTriangle className="w-4 h-4" />
            Urgent
            {totalUrgent > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold bg-red-100 text-red-700 rounded-full">
                {totalUrgent}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab("traiter")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer",
              tab === "traiter"
                ? "bg-white text-indigo-700 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            )}
          >
            <Briefcase className="w-4 h-4" />
            À traiter
            {okDeals.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold bg-indigo-100 text-indigo-700 rounded-full">
                {okDeals.length}
              </span>
            )}
          </button>
        </div>
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
          <button
            onClick={() => { fetchActivities(); fetchDeals(); }}
            disabled={loading || loadingDeals}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={cn("w-4 h-4", (loading || loadingDeals) && "animate-spin")} />
            Rafraîchir
          </button>
        </div>
      </div>

      {/* ─── TAB URGENT ─── */}
      {tab === "urgent" && (
        <>
          {(loading || loadingDeals) && activities.length === 0 && deals.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="space-y-8">
              {/* Deals urgents : pas de prochaine activité ou activité en retard */}
              {urgentDeals.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Briefcase className="w-5 h-5 text-red-500" />
                    <h2 className="text-lg font-semibold text-gray-900">Affaires en retard</h2>
                    <span className="text-sm text-gray-400 ml-1">({urgentDeals.length})</span>
                  </div>
                  <div className="space-y-2">
                    {urgentDeals.map((deal) => (
                      <DealRow
                        key={deal.id}
                        deal={deal}
                        onTaskCreated={() => { fetchActivities(); fetchDeals(); }}
                        onArchive={openArchiveModal}
                        selected={selectedDeals.has(deal.id)}
                        onToggleSelect={toggleDealSelection}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Activités en retard */}
              {urgentActivities.length > 0 && (
                <ActivitySection
                  title="Tâches en retard"
                  icon={<AlertTriangle className="w-5 h-5 text-red-500" />}
                  activities={urgentActivities}
                  onMarkDone={markDone}
                  onArchive={openArchiveModal}
                  onSelect={openDetail}
                  selectedId={selectedActivity?.id ?? null}
                  variant="urgent"
                />
              )}

              {upcoming.length > 0 && (
                <ActivitySection
                  title="7 prochains jours"
                  icon={<Clock className="w-5 h-5 text-amber-500" />}
                  activities={upcoming}
                  onMarkDone={markDone}
                  onArchive={openArchiveModal}
                  onSelect={openDetail}
                  selectedId={selectedActivity?.id ?? null}
                  variant="upcoming"
                />
              )}

              {later.length > 0 && (
                <ActivitySection
                  title="Plus tard"
                  icon={<Calendar className="w-5 h-5 text-gray-400" />}
                  activities={later}
                  onMarkDone={markDone}
                  onArchive={openArchiveModal}
                  onSelect={openDetail}
                  selectedId={selectedActivity?.id ?? null}
                  variant="later"
                />
              )}

              {totalUrgent === 0 && activities.length === 0 && !loading && !loadingDeals && (
                <div className="text-center py-20 text-gray-400">
                  <CheckSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">Aucune urgence</p>
                  <p className="text-sm mt-1">Toutes les affaires et tâches sont à jour !</p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ─── TAB À TRAITER ─── */}
      {tab === "traiter" && (
        <>
          {loadingDeals && deals.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : okDeals.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <Briefcase className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">Aucune affaire à suivre</p>
              <p className="text-sm mt-1">Toutes les affaires actives sont en retard ou urgentes</p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Toolbar : sélection + enrichissement batch */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => selectAllDeals(okDeals)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    <Users className="w-3.5 h-3.5" />
                    {selectedDeals.size === okDeals.filter((d) => d.person_id).length && selectedDeals.size > 0
                      ? "Tout désélectionner"
                      : "Tout sélectionner"}
                  </button>
                  <p className="text-sm text-gray-500">
                    {okDeals.length} affaire{okDeals.length !== 1 ? "s" : ""} à suivre
                    {selectedDeals.size > 0 && (
                      <span className="ml-2 font-medium text-indigo-600">
                        — {selectedDeals.size} sélectionnée{selectedDeals.size > 1 ? "s" : ""}
                      </span>
                    )}
                  </p>
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

              {okDeals.map((deal) => (
                <DealRow
                  key={deal.id}
                  deal={deal}
                  onTaskCreated={() => { fetchActivities(); fetchDeals(); }}
                  onArchive={openArchiveModal}
                  selected={selectedDeals.has(deal.id)}
                  onToggleSelect={toggleDealSelection}
                />
              ))}
            </div>
          )}
        </>
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
            fetchActivities();
            fetchDeals();
          }}
        />
      )}
    </div>
  );
}

function ActivitySection({
  title,
  icon,
  activities,
  onMarkDone,
  onArchive,
  onSelect,
  selectedId,
  variant,
}: {
  title: string;
  icon: React.ReactNode;
  activities: Activity[];
  onMarkDone: (id: number) => void;
  onArchive: (activityId: number, dealId: number | null, contactName: string) => void;
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
              onArchive={onArchive}
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
  onArchive,
  onSelect,
  isSelected,
  className,
}: {
  activity: Activity;
  onMarkDone: (id: number) => void;
  onArchive: (activityId: number, dealId: number | null, contactName: string) => void;
  onSelect: (activity: Activity) => void;
  isSelected: boolean;
  className?: string;
}) {
  const [markingDone, setMarkingDone] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const detectedType = detectActivityType(activity.subject);
  const IconComponent = TYPE_ICONS[detectedType] || CheckSquare;

  const handleDone = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMarkingDone(true);
    await onMarkDone(activity.id);
  };

  const handleArchive = (e: React.MouseEvent) => {
    e.stopPropagation();
    onArchive(activity.id, activity.deal_id, activity.person_name || activity.deal_title || activity.subject);
  };

  const handleClick = () => {
    if (activity.person_id) {
      onSelect(activity);
    }
  };

  const pipedriveLink = activity.deal_id
    ? `https://metagora.pipedrive.com/deal/${activity.deal_id}`
    : `https://metagora.pipedrive.com/activities`;

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
          disabled={markingDone || archiving}
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
          onClick={handleArchive}
          disabled={archiving || markingDone}
          title="Archiver – pas de potentiel (deal → perdu)"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-orange-200 text-orange-700 bg-orange-50 hover:bg-orange-100 hover:border-orange-300 transition-colors cursor-pointer disabled:opacity-50"
        >
          {archiving ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Archive className="w-3.5 h-3.5" />
          )}
          Archiver
        </button>
        {activity.deal_id && (
          <Link
            href={`/deal/${activity.deal_id}`}
            title="Ouvrir la fiche"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 hover:border-indigo-300 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Fiche
          </Link>
        )}
        <a
          href={pipedriveLink}
          target="_blank"
          rel="noopener noreferrer"
          title="Ouvrir dans Pipedrive"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 hover:border-gray-300 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Pipedrive
        </a>
      </div>
    </div>
  );
}

/* ─── Deal Row (onglet À traiter) ─── */

function DealRow({
  deal,
  onTaskCreated,
  onArchive,
  selected,
  onToggleSelect,
}: {
  deal: Deal;
  onTaskCreated: () => void;
  onArchive: (activityId: number, dealId: number | null, contactName: string) => void;
  selected: boolean;
  onToggleSelect: (dealId: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
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

  const pipedriveLink = `https://metagora.pipedrive.com/deal/${deal.id}`;

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
      await fetch("/api/activities", {
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
      setTaskSubject("");
      setShowAddTask(false);
      onTaskCreated();
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
          <p className="font-medium text-gray-900 truncate">{deal.title}</p>
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
            <span className="font-medium text-indigo-500">{getPipelineName(deal.pipeline_id)}</span>
            <span className="text-gray-300">→</span>
            <span className="font-medium">{getStageName(deal.stage_id)}</span>
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

        {/* Valeur */}
        {deal.value > 0 && (
          <div className="flex-shrink-0 text-sm font-semibold text-gray-700">
            {deal.value.toLocaleString("fr-FR")} {deal.currency}
          </div>
        )}

        {/* Prochaine activité */}
        <div className="flex-shrink-0 text-xs text-gray-400">
          {deal.next_activity_date ? (
            <span className={cn(
              isOverdue(deal.next_activity_date) && "text-red-500 font-medium"
            )}>
              {formatDate(deal.next_activity_date)}
            </span>
          ) : (
            <span className="text-amber-500 font-medium">Pas de tâche</span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => { setShowAddTask(!showAddTask); setExpanded(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-green-200 text-green-700 bg-green-50 hover:bg-green-100 hover:border-green-300 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Tâche
          </button>
          <Link
            href={`/deal/${deal.id}`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 hover:border-indigo-300 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Fiche
          </Link>
          <a
            href={pipedriveLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 hover:border-gray-300 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Pipedrive
          </a>
        </div>

        <div className="flex-shrink-0 text-gray-400">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </div>

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

          {/* Participants */}
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
                  <span
                    key={p.id}
                    className={cn(
                      "inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full border",
                      p.primary
                        ? "bg-indigo-100 border-indigo-300 text-indigo-800 font-semibold"
                        : "bg-white border-gray-200 text-gray-600"
                    )}
                  >
                    {p.primary && <span className="text-[8px]">★</span>}
                    {p.name}
                    {p.job_title && <span className="text-gray-400 font-normal">({p.job_title})</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Contact detail panel — show primary contact first, then others */}
          {participantsFetched && participants.length > 0 ? (
            <>
              {participants
                .sort((a, b) => (b.primary ? 1 : 0) - (a.primary ? 1 : 0))
                .map((p) => (
                  <div key={p.id}>
                    {participants.length > 1 && (
                      <div className="px-4 pt-2 pb-0">
                        <span className={cn(
                          "text-[10px] font-semibold uppercase tracking-wide",
                          p.primary ? "text-indigo-600" : "text-gray-400"
                        )}>
                          {p.primary ? "★ Contact principal" : "Autre contact"} — {p.name}
                        </span>
                      </div>
                    )}
                    <DetailPanel
                      personId={p.id}
                      allParticipants={participants.length > 1 ? participants : undefined}
                      dealId={deal.id}
                      orgId={deal.org_id}
                      onActivityCreated={onTaskCreated}
                    />
                  </div>
                ))}
            </>
          ) : participantsFetched && participants.length === 0 && deal.person_id ? (
            <DetailPanel personId={deal.person_id} dealId={deal.id} orgId={deal.org_id} onActivityCreated={onTaskCreated} />
          ) : !deal.person_id && participantsFetched ? (
            <div className="px-4 py-3 text-xs text-gray-400">
              Aucun contact associé à cette affaire
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
