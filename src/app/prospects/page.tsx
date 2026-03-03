"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  Search,
  Users,
  Download,
  Loader2,
  Pencil,
  Check,
  X,
  Filter,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Prospect {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  poste: string;
  entreprise: string;
  statut: string;
  pipelines: string;
  notes: string;
}

export default function ProspectsPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "en cours" | "perdu">("all");
  const [pipelineFilter, setPipelineFilter] = useState<string>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Prospect>>({});
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchProspects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/prospects");
      const json = await res.json();
      if (json.data) setProspects(json.data);
    } catch (err) {
      console.error("Erreur chargement prospects:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProspects();
  }, [fetchProspects]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/prospects/upload", { method: "POST", body: formData });
      const json = await res.json();
      if (json.data) {
        setProspects(json.data);
      } else {
        alert("Erreur lors de l'import : " + (json.error || "inconnue"));
      }
    } catch (err) {
      console.error("Erreur upload:", err);
      alert("Erreur lors de l'import du fichier");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const startEdit = (p: Prospect) => {
    setEditingId(p.id);
    setEditData({
      nom: p.nom,
      prenom: p.prenom,
      email: p.email,
      telephone: p.telephone,
      poste: p.poste,
      entreprise: p.entreprise,
      statut: p.statut,
      notes: p.notes,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData({});
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/prospects", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, ...editData }),
      });
      const json = await res.json();
      if (json.data) {
        setProspects((prev) =>
          prev.map((p) => (p.id === editingId ? { ...p, ...json.data } : p))
        );
      }
      setEditingId(null);
      setEditData({});
    } catch (err) {
      console.error("Erreur sauvegarde:", err);
    } finally {
      setSaving(false);
    }
  };

  const downloadCsv = () => {
    window.open("/api/prospects/download", "_blank");
  };

  // Get unique pipelines for filter
  const pipelineOptions = useMemo(() => {
    const all = new Set<string>();
    for (const p of prospects) {
      if (p.pipelines) {
        p.pipelines.split(", ").forEach((pl) => all.add(pl));
      }
    }
    return Array.from(all).sort();
  }, [prospects]);

  // Filtered and searched prospects
  const filtered = useMemo(() => {
    return prospects.filter((p) => {
      if (statusFilter !== "all" && p.statut !== statusFilter) return false;
      if (pipelineFilter !== "all" && !p.pipelines.includes(pipelineFilter)) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          p.nom.toLowerCase().includes(q) ||
          p.prenom.toLowerCase().includes(q) ||
          p.email.toLowerCase().includes(q) ||
          p.entreprise.toLowerCase().includes(q) ||
          p.poste.toLowerCase().includes(q) ||
          p.telephone.includes(q)
        );
      }
      return true;
    });
  }, [prospects, search, statusFilter, pipelineFilter]);

  const enCoursCount = prospects.filter((p) => p.statut === "en cours").length;
  const perduCount = prospects.filter((p) => p.statut === "perdu").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <Users className="w-7 h-7 text-indigo-600" />
            Prospects
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {prospects.length} contacts — {enCoursCount} en cours, {perduCount} perdus
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={downloadCsv}
            disabled={prospects.length === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Télécharger CSV
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 cursor-pointer shadow-sm"
          >
            {uploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            {uploading ? "Import en cours..." : "Importer un CSV"}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 bg-white rounded-lg border border-gray-200 p-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom, email, entreprise..."
            className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 outline-none"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | "en cours" | "perdu")}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-400 outline-none"
          >
            <option value="all">Tous les statuts</option>
            <option value="en cours">En cours ({enCoursCount})</option>
            <option value="perdu">Perdu ({perduCount})</option>
          </select>
          <select
            value={pipelineFilter}
            onChange={(e) => setPipelineFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-400 outline-none"
          >
            <option value="all">Tous les pipelines</option>
            {pipelineOptions.map((pl) => (
              <option key={pl} value={pl}>{pl}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : prospects.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-lg border border-gray-200">
          <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p className="text-lg font-medium text-gray-600">Aucun prospect</p>
          <p className="text-sm text-gray-400 mt-1">Cliquez sur &quot;Importer un CSV&quot; pour charger vos contacts.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Prénom</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Nom</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Email</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Téléphone</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Poste</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Entreprise</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Statut</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Pipeline</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide max-w-xs">Notes</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((p) => {
                  const isEditing = editingId === p.id;
                  return (
                    <tr key={p.id} className={cn("group hover:bg-gray-50 transition-colors", isEditing && "bg-blue-50")}>
                      <td className="px-4 py-2.5">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editData.prenom || ""}
                            onChange={(e) => setEditData({ ...editData, prenom: e.target.value })}
                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-indigo-400 outline-none"
                          />
                        ) : (
                          <span className="font-medium text-gray-900">{p.prenom}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editData.nom || ""}
                            onChange={(e) => setEditData({ ...editData, nom: e.target.value })}
                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-indigo-400 outline-none"
                          />
                        ) : (
                          <span className="text-gray-700">{p.nom}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {isEditing ? (
                          <input
                            type="email"
                            value={editData.email || ""}
                            onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-indigo-400 outline-none"
                          />
                        ) : (
                          <span className="text-gray-600 text-xs">{p.email}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editData.telephone || ""}
                            onChange={(e) => setEditData({ ...editData, telephone: e.target.value })}
                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-indigo-400 outline-none"
                          />
                        ) : (
                          <span className="text-gray-600 text-xs">{p.telephone}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editData.poste || ""}
                            onChange={(e) => setEditData({ ...editData, poste: e.target.value })}
                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-indigo-400 outline-none"
                          />
                        ) : (
                          <span className="text-gray-600 text-xs">{p.poste}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editData.entreprise || ""}
                            onChange={(e) => setEditData({ ...editData, entreprise: e.target.value })}
                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-indigo-400 outline-none"
                          />
                        ) : (
                          <span className="text-gray-700 text-xs font-medium">{p.entreprise}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {isEditing ? (
                          <select
                            value={editData.statut || "en cours"}
                            onChange={(e) => setEditData({ ...editData, statut: e.target.value })}
                            className="px-2 py-1 text-xs border border-gray-300 rounded bg-white focus:ring-1 focus:ring-indigo-400 outline-none"
                          >
                            <option value="en cours">En cours</option>
                            <option value="perdu">Perdu</option>
                          </select>
                        ) : (
                          <span
                            className={cn(
                              "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold",
                              p.statut === "en cours"
                                ? "bg-green-100 text-green-700"
                                : "bg-red-100 text-red-700"
                            )}
                          >
                            {p.statut === "en cours" ? "En cours" : "Perdu"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-gray-500 text-[10px]">{p.pipelines}</span>
                      </td>
                      <td className="px-4 py-2.5 max-w-xs">
                        {isEditing ? (
                          <textarea
                            value={editData.notes || ""}
                            onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                            rows={2}
                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-indigo-400 outline-none resize-none"
                          />
                        ) : (
                          <span className="text-gray-500 text-[10px] line-clamp-2 block max-w-xs" title={p.notes}>{p.notes}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {isEditing ? (
                          <div className="flex items-center gap-1 justify-center">
                            <button
                              onClick={saveEdit}
                              disabled={saving}
                              className="p-1 text-green-600 hover:text-green-700 cursor-pointer disabled:opacity-40"
                            >
                              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEdit(p)}
                            className="p-1 text-gray-400 hover:text-indigo-600 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Modifier"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 text-xs text-gray-500">
            {filtered.length} résultat{filtered.length !== 1 ? "s" : ""} sur {prospects.length} contacts
          </div>
        </div>
      )}
    </div>
  );
}
