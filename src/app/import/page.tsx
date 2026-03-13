"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Upload,
  FileSpreadsheet,
  Loader2,
  Sparkles,
  Download,
  Trash2,
  AlertCircle,
  Linkedin,
  Eye,
  EyeOff,
  ChevronDown,
  Users,
  Plus,
  Search,
  Globe,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Pencil,
  Building2,
  Merge,
  Check,
  X,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useResizableColumns } from "@/hooks/useResizableColumns";
import * as XLSX from "xlsx";

// ─── Column mapping aliases ─────────────────────────────

const COLUMN_ALIASES: Record<string, string> = {
  // first_name
  first_name: "first_name", firstname: "first_name", "first name": "first_name", prénom: "first_name", prenom: "first_name",
  "prénom dirigeant": "first_name", "prenom dirigeant": "first_name",
  // last_name
  last_name: "last_name", lastname: "last_name", "last name": "last_name", nom: "last_name",
  "nom dirigeant": "last_name",
  // email
  email: "email", "e-mail": "email", mail: "email", courriel: "email",
  // company
  company: "company", companyname: "company", "company name": "company", entreprise: "company", société: "company", societe: "company",
  "raison sociale": "company", enseigne: "company",
  // job
  job: "job", title: "job", jobtitle: "job", "job title": "job", poste: "job", fonction: "job",
  "rôle dirigeant": "job", "role dirigeant": "job",
  // phone
  phone: "phone", telephone: "phone", téléphone: "phone", tel: "phone", "phone number": "phone",
  // linkedin
  linkedin: "linkedin", linkedinurl: "linkedin", linkedinprofileurl: "linkedin", "linkedin profile": "linkedin",
  defaultprofileurl: "linkedin", profileurl: "linkedin",
  // location (profile)
  location: "location", ville: "location", city: "location", région: "location", region: "location",
  commune: "location",
  // company_location
  companylocation: "company_location", "company location": "company_location", "lieu entreprise": "company_location",
  "ville entreprise": "company_location", companylocality: "company_location",
  // postal_code (from scrapping CSV)
  "code postal": "postal_code", cp: "postal_code", "postal code": "postal_code", postalcode: "postal_code",
  // siren / siret
  siren: "siren", siret: "siret",
  // naf
  "code naf": "naf_code", codenaf: "naf_code", "libellé naf": "naf_label", libellenaf: "naf_label",
  // nb_employees
  effectif: "nb_employees", "tranche effectif": "nb_employees", effectifs: "nb_employees", "eff. approx.": "nb_employees",
};

function mapColumnName(header: string): string | null {
  const normalized = header.trim().toLowerCase().replace(/[_\-]/g, "").replace(/\s+/g, " ");
  // Direct match
  if (COLUMN_ALIASES[normalized]) return COLUMN_ALIASES[normalized];
  // Try without accents
  const noAccents = normalized.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (COLUMN_ALIASES[noAccents]) return COLUMN_ALIASES[noAccents];
  // Partial match (header contains alias key)
  for (const [alias, mapped] of Object.entries(COLUMN_ALIASES)) {
    if (normalized.includes(alias) || alias.includes(normalized)) return mapped;
  }
  return null;
}

// ─── Types ───────────────────────────────────────────────

interface ImportList {
  id: string;
  name: string;
  created_at: string;
  count: number;
  companies?: string[];
  source?: "csv" | "search";
  company_tag?: string;
  enriched_at?: string;
}

interface ImportContact {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  company: string;
  job: string;
  phone: string;
  linkedin: string;
  location?: string;
  company_location?: string;
  region?: string;
  postal_code?: string;
  mobile_phone?: string;
  website?: string;
  company_linkedin?: string;
  company_domain?: string;
  siren?: string;
  siret?: string;
  naf_code?: string;
  naf_label?: string;
  nb_employees?: string;
  company_address?: string;
  company_city?: string;
  company_postal_code?: string;
  company_country?: string;
  email_qualification?: string;
  enriched?: boolean;
}

interface PhantomProfile {
  firstName: string;
  lastName: string;
  title: string;
  companyName: string;
  linkedinUrl: string;
  location?: string;
  companyLocation?: string;
  isDuplicate?: boolean;
  duplicateListName?: string;
}

type TabKey = "csv" | "search";

// ─── Column definitions ──────────────────────────────────

interface ColumnDef {
  key: keyof ImportContact;
  label: string;
  defaultVisible: boolean;
  enrichedOnly?: boolean;
  defaultWidth: number;
  minWidth: number;
}

const ALL_COLUMNS: ColumnDef[] = [
  { key: "first_name", label: "Prénom", defaultVisible: true, defaultWidth: 80, minWidth: 40 },
  { key: "last_name", label: "Nom", defaultVisible: true, defaultWidth: 80, minWidth: 40 },
  { key: "email", label: "Email", defaultVisible: true, defaultWidth: 170, minWidth: 60 },
  { key: "company", label: "Entreprise", defaultVisible: true, defaultWidth: 110, minWidth: 50 },
  { key: "job", label: "Poste", defaultVisible: true, defaultWidth: 90, minWidth: 40 },
  { key: "phone", label: "Téléphone", defaultVisible: true, defaultWidth: 90, minWidth: 40 },
  { key: "linkedin", label: "LinkedIn", defaultVisible: true, defaultWidth: 36, minWidth: 28 },
  { key: "location", label: "Localisation", defaultVisible: false, defaultWidth: 120, minWidth: 50 },
  { key: "region", label: "Région", defaultVisible: true, defaultWidth: 100, minWidth: 50 },
  { key: "postal_code", label: "Code postal", defaultVisible: true, defaultWidth: 70, minWidth: 40 },
  { key: "company_location", label: "Lieu entreprise", defaultVisible: false, defaultWidth: 120, minWidth: 50 },
  { key: "company_address", label: "Adresse siège", defaultVisible: false, enrichedOnly: true, defaultWidth: 150, minWidth: 60 },
  { key: "company_city", label: "Ville siège", defaultVisible: false, enrichedOnly: true, defaultWidth: 100, minWidth: 50 },
  { key: "company_postal_code", label: "CP siège", defaultVisible: false, enrichedOnly: true, defaultWidth: 60, minWidth: 40 },
  { key: "mobile_phone", label: "Mobile", defaultVisible: false, enrichedOnly: true, defaultWidth: 90, minWidth: 40 },
  { key: "website", label: "Site web", defaultVisible: false, enrichedOnly: true, defaultWidth: 120, minWidth: 50 },
  { key: "naf_code", label: "NAF", defaultVisible: false, enrichedOnly: true, defaultWidth: 60, minWidth: 30 },
  { key: "naf_label", label: "Libellé NAF", defaultVisible: false, enrichedOnly: true, defaultWidth: 100, minWidth: 40 },
  { key: "nb_employees", label: "Effectifs", defaultVisible: false, enrichedOnly: true, defaultWidth: 60, minWidth: 30 },
  { key: "siren", label: "SIREN", defaultVisible: false, enrichedOnly: true, defaultWidth: 80, minWidth: 40 },
  { key: "siret", label: "SIRET", defaultVisible: false, enrichedOnly: true, defaultWidth: 90, minWidth: 40 },
  { key: "email_qualification", label: "Qualité email", defaultVisible: false, enrichedOnly: true, defaultWidth: 80, minWidth: 40 },
  { key: "enriched", label: "Enrichi", defaultVisible: true, defaultWidth: 52, minWidth: 36 },
];

const MAPPED_COLUMNS = ["first_name", "last_name", "email", "company", "job", "phone", "linkedin", "location", "company_location", "postal_code", "siren", "siret", "naf_code", "naf_label", "nb_employees"];

// ─── Smart CSV parser (auto-detect delimiter, RFC 4180) ──

function smartParseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  // Auto-detect delimiter from first line
  const firstLine = text.split(/\r?\n/)[0] || "";
  const semicolons = (firstLine.match(/;/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  const delimiter = semicolons > commas ? ";" : ",";

  // RFC 4180 parser — handles newlines inside quoted fields
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        row.push(field); field = "";
      } else if (ch === "\r") {
        // skip \r
      } else if (ch === "\n") {
        row.push(field); field = "";
        if (row.some((v) => v.trim())) records.push(row);
        row = [];
      } else {
        field += ch;
      }
    }
  }
  row.push(field);
  if (row.some((v) => v.trim())) records.push(row);

  if (records.length === 0) return { headers: [], rows: [] };

  const headers = records[0].map((h) => h.trim());
  const rows = records.slice(1).map((values) => {
    const r: Record<string, string> = {};
    headers.forEach((h, j) => { r[h] = (values[j] || "").trim(); });
    return r;
  }).filter((r) => Object.values(r).some((v) => v.trim()));

  return { headers, rows };
}

// ─── Map raw rows to standard column names ───────────────

function mapRows(headers: string[], rows: Record<string, string>[]): { mapped: Record<string, string>[]; mappingInfo: Record<string, string> } {
  const mappingInfo: Record<string, string> = {};
  const headerMap: Record<string, string> = {};
  for (const h of headers) {
    const target = mapColumnName(h);
    if (target) {
      headerMap[h] = target;
      mappingInfo[h] = target;
    }
  }
  const mapped = rows.map((r) => {
    const out: Record<string, string> = {};
    for (const col of MAPPED_COLUMNS) out[col] = "";
    for (const [origCol, val] of Object.entries(r)) {
      const target = headerMap[origCol];
      if (target && val.trim()) {
        // Keep first non-empty match for this target field
        if (!out[target]) out[target] = val.trim();
      }
    }
    return out;
  }).filter((r) => r.first_name || r.last_name || r.company);
  return { mapped, mappingInfo };
}

// ─── Main Component ──────────────────────────────────────

export default function ImportPage() {
  // Tab
  const [activeTab, setActiveTab] = useState<TabKey>("csv");

  // Lists state
  const [lists, setLists] = useState<ImportList[]>([]);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<ImportContact[]>([]);
  const [loadingLists, setLoadingLists] = useState(true);
  const [loadingContacts, setLoadingContacts] = useState(false);

  // CSV Upload state
  const [csvError, setCsvError] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<Record<string, string>[] | null>(null);
  const [listName, setListName] = useState("");
  const [creating, setCreating] = useState(false);

  // PhantomBuster CSV state
  const [snListName, setSnListName] = useState("");
  const [snLoading, setSnLoading] = useState(false);
  const [snMsg, setSnMsg] = useState<string | null>(null);
  const [snError, setSnError] = useState<string | null>(null);
  const [snProfiles, setSnProfiles] = useState<PhantomProfile[] | null>(null);
  const [snImporting, setSnImporting] = useState(false);

  // List editing state
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCompanyTag, setEditCompanyTag] = useState("");

  // Company filter & multi-select for merge
  const [companyFilter, setCompanyFilter] = useState("");
  const [selectedListIds, setSelectedListIds] = useState<Set<string>>(new Set());
  const [merging, setMerging] = useState(false);
  const [mergeName, setMergeName] = useState("");
  const [showMergeDialog, setShowMergeDialog] = useState(false);

  // Column visibility
  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    new Set(ALL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key))
  );
  const [showColPicker, setShowColPicker] = useState(false);

  // Enrichment
  const [enriching, setEnriching] = useState(false);
  const [enrichMsg, setEnrichMsg] = useState<string | null>(null);

  // Contact selection for selective enrichment
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());

  // Search (table filter)
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState("");

  // Resizable columns
  const { widths: colWidths, onMouseDown: onColResize } = useResizableColumns(
    ALL_COLUMNS.map((c) => ({ key: c.key, minWidth: c.minWidth, defaultWidth: c.defaultWidth }))
  );

  // ── Fetch lists ──
  const fetchLists = useCallback(async () => {
    try {
      const res = await fetch("/api/imports");
      const json = await res.json();
      if (json.data) setLists(json.data);
    } catch (err) {
      console.error("Erreur chargement listes:", err);
    } finally {
      setLoadingLists(false);
    }
  }, []);

  useEffect(() => {
    fetchLists();
  }, [fetchLists]);


  // ── Fetch contacts for selected list ──
  const fetchContacts = useCallback(async (listId: string) => {
    setLoadingContacts(true);
    try {
      const res = await fetch(`/api/imports/${listId}?t=${Date.now()}`);
      const json = await res.json();
      if (json.data) setContacts(json.data);
    } catch (err) {
      console.error("Erreur chargement contacts:", err);
    } finally {
      setLoadingContacts(false);
    }
  }, []);

  useEffect(() => {
    setLocationFilter("");
    setSelectedContactIds(new Set());
    if (selectedListId) fetchContacts(selectedListId);
    else setContacts([]);
  }, [selectedListId, fetchContacts]);

  // ── CSV / Excel file handler ──
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setCsvError(null);
    setParsedRows(null);

    try {
      let headers: string[];
      let rawRows: Record<string, string>[];

      const isExcel = /\.(xlsx?|xls)$/i.test(f.name);
      if (isExcel) {
        const buffer = await f.arrayBuffer();
        const wb = XLSX.read(buffer, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });
        if (json.length === 0) { setCsvError("Le fichier est vide."); return; }
        headers = Object.keys(json[0]);
        rawRows = json.map((r) => {
          const row: Record<string, string> = {};
          for (const [k, v] of Object.entries(r)) row[k] = String(v || "").trim();
          return row;
        });
      } else {
        const text = await f.text();
        const parsed = smartParseCsv(text);
        headers = parsed.headers;
        rawRows = parsed.rows;
      }

      if (rawRows.length === 0) {
        setCsvError("Le fichier ne contient aucune ligne de données.");
        return;
      }

      // Map columns flexibly
      const { mapped, mappingInfo } = mapRows(headers, rawRows);
      const mappedFields = Object.values(mappingInfo);
      const unmapped = headers.filter((h) => !mapColumnName(h));

      if (!mappedFields.includes("first_name") && !mappedFields.includes("last_name") && !mappedFields.includes("company")) {
        setCsvError(`Impossible de détecter les colonnes prénom/nom/entreprise. Colonnes trouvées : ${headers.join(", ")}. Essayez avec des en-têtes comme : first_name, last_name, email, company, job, phone, linkedin.`);
        return;
      }

      if (mapped.length === 0) {
        setCsvError("Aucun contact valide trouvé (prénom, nom ou entreprise requis).");
        return;
      }

      // Show mapping info
      const infoLines: string[] = [];
      for (const [orig, target] of Object.entries(mappingInfo)) {
        if (orig.toLowerCase() !== target.toLowerCase()) infoLines.push(`${orig} → ${target}`);
      }
      if (unmapped.length > 0) infoLines.push(`Colonnes ignorées : ${unmapped.join(", ")}`);
      if (infoLines.length > 0) setCsvError(`ℹ️ Mapping automatique : ${infoLines.join(" · ")}`);

      setParsedRows(mapped);
      const baseName = f.name.replace(/\.(csv|xlsx?)$/i, "").replace(/[_-]/g, " ");
      setListName(baseName);
    } catch (err) {
      console.error("File parse error:", err);
      setCsvError("Erreur lors de la lecture du fichier.");
    }
  };

  // ── Create list (CSV) ──
  const createList = async () => {
    if (!parsedRows || !listName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: listName.trim(), rows: parsedRows }),
      });
      const json = await res.json();
      if (json.data) {
        setParsedRows(null);
        setCsvError(null);
        setListName("");
        await fetchLists();
        setSelectedListId(json.data.id);
      } else {
        setCsvError(json.error || "Erreur lors de la création");
      }
    } catch {
      setCsvError("Erreur réseau lors de la création");
    } finally {
      setCreating(false);
    }
  };

  // ── Delete list ──
  const deleteList = async (id: string) => {
    if (!confirm("Supprimer cette liste d'import ?")) return;
    try {
      await fetch(`/api/imports/${id}`, { method: "DELETE" });
      if (selectedListId === id) {
        setSelectedListId(null);
        setContacts([]);
      }
      await fetchLists();
    } catch {
      alert("Erreur lors de la suppression");
    }
  };

  // ── Edit list (rename / company tag) ──
  const startEditing = (l: ImportList) => {
    setEditingListId(l.id);
    setEditName(l.name);
    setEditCompanyTag(l.company_tag || "");
  };

  const saveEdit = async () => {
    if (!editingListId) return;
    try {
      const res = await fetch(`/api/imports/${editingListId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), company_tag: editCompanyTag.trim() }),
      });
      const json = await res.json();
      if (json.data) {
        setLists((prev) => prev.map((l) => l.id === editingListId ? { ...l, ...json.data } : l));
      }
    } catch {
      alert("Erreur lors de la sauvegarde");
    }
    setEditingListId(null);
  };

  const cancelEdit = () => setEditingListId(null);

  // ── Multi-select toggle ──
  const toggleSelect = (id: string) => {
    setSelectedListIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ── Merge lists ──
  const mergeLists = async () => {
    if (selectedListIds.size < 2 || !mergeName.trim()) return;
    setMerging(true);
    try {
      // Determine common company tag
      const selectedLists = lists.filter((l) => selectedListIds.has(l.id));
      const tags = [...new Set(selectedLists.map((l) => l.company_tag).filter(Boolean))];
      const companyTag = tags.length === 1 ? tags[0] : undefined;

      const res = await fetch("/api/imports/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listIds: [...selectedListIds], name: mergeName.trim(), companyTag }),
      });
      const json = await res.json();
      if (json.error) {
        alert(json.error);
      } else if (json.data) {
        setSelectedListIds(new Set());
        setShowMergeDialog(false);
        setMergeName("");
        await fetchLists();
        setSelectedListId(json.data.id);
      }
    } catch {
      alert("Erreur lors de la fusion");
    } finally {
      setMerging(false);
    }
  };

  // ── PhantomBuster CSV handler ──
  const handlePbCsvChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setSnError(null);
    setSnMsg(null);
    setSnProfiles(null);
    setSnLoading(true);

    try {
      const text = await f.text();

      // RFC 4180 CSV parser — handles newlines inside quoted fields
      const parseRfc4180 = (csv: string): string[][] => {
        const records: string[][] = [];
        let row: string[] = [];
        let field = "";
        let inQuotes = false;
        for (let i = 0; i < csv.length; i++) {
          const ch = csv[i];
          if (inQuotes) {
            if (ch === '"') {
              if (csv[i + 1] === '"') { field += '"'; i++; }
              else inQuotes = false;
            } else {
              field += ch;
            }
          } else {
            if (ch === '"') {
              inQuotes = true;
            } else if (ch === ",") {
              row.push(field); field = "";
            } else if (ch === "\r") {
              // skip \r (handle \r\n)
            } else if (ch === "\n") {
              row.push(field); field = "";
              if (row.some((v) => v.trim())) records.push(row);
              row = [];
            } else {
              field += ch;
            }
          }
        }
        // Last field / row
        row.push(field);
        if (row.some((v) => v.trim())) records.push(row);
        return records;
      };

      const allRows = parseRfc4180(text);
      if (allRows.length < 2) {
        setSnError("Le fichier CSV est vide ou ne contient qu'un en-tête.");
        setSnLoading(false);
        return;
      }

      const headers = allRows[0].map((h) => h.trim());
      const rows = allRows.slice(1).map((values) => {
        const row: Record<string, string> = {};
        headers.forEach((h, i) => { row[h] = (values[i] || "").trim(); });
        return row;
      }).filter((r) => Object.values(r).some((v) => v.trim()));

      if (rows.length === 0) {
        setSnError("Aucun profil trouvé dans le fichier.");
        setSnLoading(false);
        return;
      }

      // Map PhantomBuster CSV columns to our PhantomProfile format
      const profiles = rows.map((r) => ({
        firstName: r.firstName || r.first_name || r["First Name"] || "",
        lastName: r.lastName || r.last_name || r["Last Name"] || "",
        title: r.title || r.jobTitle || r["Job Title"] || "",
        companyName: r.companyName || r.company || r["Company"] || "",
        linkedinUrl: r.linkedInProfileUrl || r.linkedinUrl || r.profileUrl || r.defaultProfileUrl || r.linkedin || r["LinkedIn URL"] || "",
        location: r.location || r.city || "",
        companyLocation: r.companyLocation || r["Company Location"] || "",
      })).filter((p) => p.firstName.trim() || p.lastName.trim());

      // Deduplicate via API
      const dedupeRes = await fetch("/api/search/dedupe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profiles }),
      });
      const dedupeJson = await dedupeRes.json();

      if (dedupeJson.error) {
        setSnError(dedupeJson.error);
      } else {
        setSnProfiles(dedupeJson.profiles || profiles);
        setSnMsg(`${dedupeJson.total || profiles.length} profils chargés${dedupeJson.duplicateCount > 0 ? ` (${dedupeJson.duplicateCount} doublons)` : ""}`);
      }

      // Auto-fill list name from file name
      if (!snListName.trim()) {
        const baseName = f.name.replace(/\.(csv|xlsx?)$/i, "").replace(/[_-]/g, " ");
        setSnListName(baseName);
      }
    } catch (err) {
      console.error("PB CSV parse error:", err);
      setSnError("Erreur lors de la lecture du fichier CSV.");
    } finally {
      setSnLoading(false);
    }
  };

  // ── PhantomBuster: Remove duplicates from results ──
  const removeDuplicates = () => {
    if (!snProfiles) return;
    setSnProfiles(snProfiles.filter((p) => !p.isDuplicate));
  };

  // ── PhantomBuster: Import profiles into a list ──
  const importProfiles = async () => {
    if (!snProfiles || snProfiles.length === 0 || !snListName.trim()) return;
    setSnImporting(true);
    try {
      const res = await fetch("/api/search/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profiles: snProfiles, listName: snListName.trim() }),
      });
      const json = await res.json();
      if (json.data) {
        setSnMsg(`✓ ${json.count} contacts importés dans "${snListName}"`);
        setSnProfiles(null);
        setSnListName("");
        await fetchLists();
        setSelectedListId(json.data.id);
      } else {
        setSnError(json.error || "Erreur lors de l'import");
      }
    } catch {
      setSnError("Erreur réseau lors de l'import");
    } finally {
      setSnImporting(false);
    }
  };

  // ── Enrich via Dropcontact ──
  const enrichList = async () => {
    if (!selectedListId) return;
    const hasSelection = selectedContactIds.size > 0;
    const toEnrich = hasSelection
      ? contacts.filter((c) => selectedContactIds.has(c.id) && !c.enriched)
      : contacts.filter((c) => (!c.email || !c.phone || !c.linkedin) && !c.enriched);
    const toEnrichCount = toEnrich.length;
    if (toEnrichCount === 0) {
      setEnrichMsg(hasSelection ? "Les contacts sélectionnés sont déjà enrichis" : "Tous les contacts ont déjà email + téléphone + linkedin (ou sont déjà enrichis)");
      setTimeout(() => setEnrichMsg(null), 5000);
      return;
    }
    const label = hasSelection ? `Enrichir ${toEnrichCount} contact${toEnrichCount > 1 ? "s" : ""} sélectionné${toEnrichCount > 1 ? "s" : ""}` : `Enrichir ${toEnrichCount} contact${toEnrichCount > 1 ? "s" : ""}`;
    if (!confirm(`${label} via Dropcontact ?\nCela consommera des crédits API.`)) return;

    setEnriching(true);
    setEnrichMsg("Envoi à Dropcontact...");

    try {
      const submitRes = await fetch(`/api/imports/${selectedListId}/enrich`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(hasSelection ? { contactIds: [...selectedContactIds] } : {}),
      });
      const submitJson = await submitRes.json();

      if (!submitJson.submitted) {
        setEnrichMsg(`Erreur : ${submitJson.error}`);
        setTimeout(() => setEnrichMsg(null), 5000);
        setEnriching(false);
        return;
      }

      const { requestId, contactIds } = submitJson;
      setEnrichMsg(`Dropcontact traite ${submitJson.count} contacts...`);

      for (let attempt = 0; attempt < 24; attempt++) {
        await new Promise((r) => setTimeout(r, 5000));
        setEnrichMsg(`Enrichissement en cours... (${(attempt + 1) * 5}s)`);

        const pollRes = await fetch(
          `/api/imports/${selectedListId}/enrich?requestId=${encodeURIComponent(requestId)}&ids=${contactIds.join(",")}`
        );
        const pollJson = await pollRes.json();

        if (pollJson.done) {
          if (pollJson.error) {
            setEnrichMsg(`Erreur Dropcontact : ${pollJson.error}`);
          } else {
            setEnrichMsg(`${pollJson.enriched}/${pollJson.total} enrichi${pollJson.enriched > 1 ? "s" : ""}`);
            await fetchContacts(selectedListId);
            await fetchLists();
          }
          setTimeout(() => setEnrichMsg(null), 8000);
          setEnriching(false);
          return;
        }
      }

      setEnrichMsg("Timeout — Dropcontact n'a pas répondu en 2 min");
      setTimeout(() => setEnrichMsg(null), 5000);
    } catch (err) {
      console.error("Enrichissement error:", err);
      setEnrichMsg("Erreur lors de l'enrichissement");
      setTimeout(() => setEnrichMsg(null), 5000);
    }
    setEnriching(false);
  };

  // ── Download CSV ──
  const downloadCsv = () => {
    if (!selectedListId) return;
    window.open(`/api/imports/${selectedListId}/download`, "_blank");
  };

  // ── Column toggle ──
  const toggleCol = (key: string) => {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ── Unique regions for filter dropdown ──
  const allRegions = useMemo(() => {
    const regs = contacts.map((c) => c.region?.trim()).filter(Boolean) as string[];
    return [...new Set(regs)].sort();
  }, [contacts]);

  // ── Filtered contacts ──
  const filtered = useMemo(() => {
    let arr = contacts;
    if (locationFilter) {
      arr = arr.filter((c) => c.region?.trim() === locationFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      arr = arr.filter((c) =>
        c.first_name?.toLowerCase().includes(q) ||
        c.last_name?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.company?.toLowerCase().includes(q) ||
        c.job?.toLowerCase().includes(q) ||
        c.phone?.includes(q) ||
        c.location?.toLowerCase().includes(q) ||
        c.region?.toLowerCase().includes(q)
      );
    }
    return arr;
  }, [contacts, search, locationFilter]);

  const visibleColumns = ALL_COLUMNS.filter((c) => visibleCols.has(c.key));
  const selectedList = lists.find((l) => l.id === selectedListId);
  const enrichableCount = contacts.filter((c) => (!c.email || !c.phone || !c.linkedin) && !c.enriched).length;
  const snDuplicateCount = snProfiles?.filter((p) => p.isDuplicate).length ?? 0;

  // Company tags for filter
  const allCompanyTags = useMemo(() => {
    const tags = lists.map((l) => l.company_tag).filter(Boolean) as string[];
    return [...new Set(tags)].sort();
  }, [lists]);

  // Filtered lists by company
  const filteredLists = useMemo(() => {
    let arr = [...lists];
    if (companyFilter) {
      arr = arr.filter((l) => l.company_tag === companyFilter);
    }
    return arr.sort((a, b) => {
      // Sort by company_tag first, then by date
      const tagA = (a.company_tag || "zzz").toLowerCase();
      const tagB = (b.company_tag || "zzz").toLowerCase();
      if (tagA !== tagB) return tagA.localeCompare(tagB);
      return b.created_at.localeCompare(a.created_at);
    });
  }, [lists, companyFilter]);

  // Can merge? Need 2+ selected, all must be enriched
  const canMerge = useMemo(() => {
    if (selectedListIds.size < 2) return false;
    return [...selectedListIds].every((id) => {
      const l = lists.find((li) => li.id === id);
      return l && l.enriched_at;
    });
  }, [selectedListIds, lists]);

  const selectedMergeLists = lists.filter((l) => selectedListIds.has(l.id));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <Upload className="w-7 h-7 text-indigo-600" />
            Import &amp; Recherche
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Importez des contacts via CSV ou PhantomBuster, enrichissez et exportez.
          </p>
        </div>
      </div>

      {/* Tabs + Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Tab content */}
        <div className="lg:col-span-2 space-y-4">
          {/* Tab switcher */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setActiveTab("csv")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer",
                activeTab === "csv" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
            >
              <FileSpreadsheet className="w-4 h-4" />
              Import CSV
            </button>
            <button
              onClick={() => setActiveTab("search")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer",
                activeTab === "search" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
            >
              <Globe className="w-4 h-4" />
              PhantomBuster
            </button>
          </div>

          {/* CSV Tab */}
          {activeTab === "csv" && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Nouvelle liste CSV
              </h2>
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors">
                <div className="flex flex-col items-center gap-1.5 text-gray-500">
                  {parsedRows ? (
                    <>
                      <FileSpreadsheet className="w-6 h-6 text-indigo-500" />
                      <span className="text-sm font-medium text-gray-700">{parsedRows.length} contacts détectés</span>
                      <span className="text-xs text-gray-400">Cliquer pour changer de fichier</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-6 h-6" />
                      <span className="text-sm font-medium">Glisser un fichier CSV / Excel ou cliquer ici</span>
                      <span className="text-[10px] text-gray-400">
                        Colonnes détectées auto : prénom, nom, email, entreprise, poste, téléphone, linkedin
                      </span>
                    </>
                  )}
                </div>
                <input type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={handleFileChange} />
              </label>

              {csvError && (
                <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  {csvError}
                </div>
              )}

              {parsedRows && (
                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="text"
                    value={listName}
                    onChange={(e) => setListName(e.target.value)}
                    placeholder="Nom de la liste (ex: Salon VivaTech 2026)"
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 outline-none"
                  />
                  <button
                    onClick={createList}
                    disabled={creating || !listName.trim()}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
                  >
                    {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    Importer
                  </button>
                </div>
              )}
            </div>
          )}

          {/* PhantomBuster Tab */}
          {activeTab === "search" && (
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Globe className="w-4 h-4" />
                Import CSV PhantomBuster
              </h2>
              <p className="text-xs text-gray-400">
                Exportez vos résultats depuis PhantomBuster au format CSV, puis importez-les ici.
                Les doublons avec vos listes existantes seront détectés automatiquement.
              </p>

              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors">
                <div className="flex flex-col items-center gap-1.5 text-gray-500">
                  {snLoading ? (
                    <>
                      <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                      <span className="text-sm font-medium text-gray-700">Analyse en cours...</span>
                    </>
                  ) : snProfiles ? (
                    <>
                      <FileSpreadsheet className="w-6 h-6 text-blue-500" />
                      <span className="text-sm font-medium text-gray-700">{snProfiles.length} profils chargés</span>
                      <span className="text-xs text-gray-400">Cliquer pour changer de fichier</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-6 h-6" />
                      <span className="text-sm font-medium">Glisser un CSV PhantomBuster ou cliquer ici</span>
                      <span className="text-[10px] text-gray-400">
                        Colonnes attendues : firstName, lastName, title, companyName, linkedInProfileUrl...
                      </span>
                    </>
                  )}
                </div>
                <input type="file" className="hidden" accept=".csv" onChange={handlePbCsvChange} disabled={snLoading} />
              </label>

              {!snProfiles && !snLoading && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nom de la liste</label>
                  <input
                    type="text"
                    value={snListName}
                    onChange={(e) => setSnListName(e.target.value)}
                    placeholder="Ex: CTO France Tech"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 outline-none"
                  />
                </div>
              )}

              {snMsg && (
                <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-700 flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                  {snMsg}
                </div>
              )}

              {snError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
                  <XCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  {snError}
                </div>
              )}

              {/* Results preview */}
              {snProfiles && snProfiles.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-gray-700">
                      {snProfiles.length} profils extraits
                    </h3>
                    <div className="flex items-center gap-2">
                      {snDuplicateCount > 0 && (
                        <button
                          onClick={removeDuplicates}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                          Supprimer {snDuplicateCount} doublon{snDuplicateCount > 1 ? "s" : ""}
                        </button>
                      )}
                      <button
                        onClick={importProfiles}
                        disabled={snImporting}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
                      >
                        {snImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                        Importer dans la liste
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 text-gray-500 text-[10px] uppercase">
                        <tr>
                          <th className="px-3 py-2 text-left w-8"></th>
                          <th className="px-3 py-2 text-left">Prénom</th>
                          <th className="px-3 py-2 text-left">Nom</th>
                          <th className="px-3 py-2 text-left">Poste</th>
                          <th className="px-3 py-2 text-left">Entreprise</th>
                          <th className="px-3 py-2 text-left w-8">LI</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {snProfiles.slice(0, 50).map((p, i) => (
                          <tr key={i} className={cn("hover:bg-gray-50/50", p.isDuplicate && "bg-orange-50/50")}>
                            <td className="px-3 py-1.5">
                              {p.isDuplicate ? (
                                <span title={`Doublon : ${p.duplicateListName}`}><AlertTriangle className="w-3.5 h-3.5 text-orange-500" /></span>
                              ) : (
                                <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-gray-800">{p.firstName}</td>
                            <td className="px-3 py-1.5 text-gray-800">{p.lastName}</td>
                            <td className="px-3 py-1.5 text-gray-600 max-w-[200px] truncate">{p.title}</td>
                            <td className="px-3 py-1.5 text-gray-600">{p.companyName}</td>
                            <td className="px-3 py-1.5">
                              {p.linkedinUrl ? (
                                <a href={p.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800">
                                  <Linkedin className="w-3.5 h-3.5" />
                                </a>
                              ) : (
                                <span className="text-gray-200"><Linkedin className="w-3.5 h-3.5" /></span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {snProfiles.length > 50 && (
                      <div className="px-3 py-2 text-center text-[10px] text-gray-400 bg-gray-50 border-t border-gray-100">
                        ... et {snProfiles.length - 50} de plus
                      </div>
                    )}
                  </div>

                  {snDuplicateCount > 0 && (
                    <div className="p-3 rounded-lg bg-orange-50 border border-orange-200 text-xs text-orange-700 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <div>
                        <strong>{snDuplicateCount} doublon{snDuplicateCount > 1 ? "s" : ""}</strong> détecté{snDuplicateCount > 1 ? "s" : ""} (même nom + prénom + entreprise).
                        {snProfiles.filter((p) => p.isDuplicate).slice(0, 5).map((p, i) => (
                          <div key={i} className="mt-0.5 text-[10px] text-orange-600">
                            {p.firstName} {p.lastName} · {p.companyName} — déjà dans &quot;{p.duplicateListName}&quot;
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {snProfiles && !snLoading && snProfiles.length > 0 && !snListName.trim() && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nom de la liste</label>
                  <input
                    type="text"
                    value={snListName}
                    onChange={(e) => setSnListName(e.target.value)}
                    placeholder="Ex: CTO France Tech"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 outline-none"
                  />
                </div>
              )}

              {snProfiles && snProfiles.length === 0 && (
                <div className="p-4 text-center text-sm text-gray-400">
                  Aucun profil trouvé dans le fichier CSV.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: List selector */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Users className="w-4 h-4" />
              Listes ({filteredLists.length}{companyFilter ? `/${lists.length}` : ""})
            </h2>
            {selectedListIds.size >= 2 && (
              <button
                onClick={() => { setMergeName(""); setShowMergeDialog(true); }}
                disabled={!canMerge}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-md cursor-pointer transition-colors",
                  canMerge
                    ? "text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100"
                    : "text-gray-400 bg-gray-50 border border-gray-200 cursor-not-allowed"
                )}
                title={canMerge ? "Fusionner les listes sélectionnées" : "Seules les listes enrichies peuvent être fusionnées"}
              >
                <Merge className="w-3 h-3" />
                Fusionner ({selectedListIds.size})
              </button>
            )}
          </div>

          {/* Company filter */}
          {allCompanyTags.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Filter className="w-3 h-3 text-gray-400" />
              <select
                value={companyFilter}
                onChange={(e) => setCompanyFilter(e.target.value)}
                className="flex-1 text-[10px] px-2 py-1 border border-gray-200 rounded-md text-gray-600 bg-white focus:ring-1 focus:ring-indigo-400 outline-none"
              >
                <option value="">Toutes les entreprises</option>
                {allCompanyTags.map((tag) => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
            </div>
          )}

          {/* Merge dialog */}
          {showMergeDialog && (
            <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-200 space-y-2">
              <p className="text-[10px] font-medium text-indigo-700">
                Fusionner {selectedMergeLists.length} listes ({selectedMergeLists.reduce((s, l) => s + l.count, 0)} contacts) :
              </p>
              <div className="text-[10px] text-indigo-600 space-y-0.5">
                {selectedMergeLists.map((l) => (
                  <div key={l.id}>• {l.name} ({l.count})</div>
                ))}
              </div>
              <input
                type="text"
                value={mergeName}
                onChange={(e) => setMergeName(e.target.value)}
                placeholder="Nom de la liste fusionnée"
                className="w-full px-2 py-1.5 text-xs border border-indigo-200 rounded-md focus:ring-1 focus:ring-indigo-400 outline-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={mergeLists}
                  disabled={merging || !mergeName.trim()}
                  className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-[10px] font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
                >
                  {merging ? <Loader2 className="w-3 h-3 animate-spin" /> : <Merge className="w-3 h-3" />}
                  Fusionner
                </button>
                <button
                  onClick={() => setShowMergeDialog(false)}
                  className="px-2 py-1.5 text-[10px] font-medium text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50 cursor-pointer"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          {loadingLists ? (
            <div className="flex items-center gap-2 text-xs text-gray-400 py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Chargement...
            </div>
          ) : filteredLists.length === 0 ? (
            <p className="text-xs text-gray-400 py-4">{companyFilter ? "Aucune liste pour cette entreprise" : "Aucune liste importée"}</p>
          ) : (
            <div className="space-y-1 max-h-[500px] overflow-y-auto">
              {filteredLists.map((l) => (
                <div key={l.id}>
                  {editingListId === l.id ? (
                    /* Editing mode */
                    <div className="px-3 py-2 rounded-lg border border-indigo-300 bg-indigo-50/50 space-y-1.5">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Nom de la liste"
                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-indigo-400 outline-none"
                        autoFocus
                        onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }}
                      />
                      <div className="flex items-center gap-1.5">
                        <Building2 className="w-3 h-3 text-gray-400" />
                        <input
                          type="text"
                          value={editCompanyTag}
                          onChange={(e) => setEditCompanyTag(e.target.value)}
                          placeholder="Entreprise associée"
                          className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-indigo-400 outline-none"
                          list="company-tags-datalist"
                          onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }}
                        />
                        <datalist id="company-tags-datalist">
                          {allCompanyTags.map((t) => <option key={t} value={t} />)}
                        </datalist>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={saveEdit} className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 cursor-pointer">
                          <Check className="w-3 h-3" /> Sauver
                        </button>
                        <button onClick={cancelEdit} className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200 cursor-pointer">
                          <X className="w-3 h-3" /> Annuler
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Normal display mode */
                    <div
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-lg text-xs cursor-pointer transition-colors group",
                        selectedListId === l.id ? "bg-indigo-50 border border-indigo-200" : "hover:bg-gray-50 border border-transparent",
                        selectedListIds.has(l.id) && "ring-2 ring-indigo-300"
                      )}
                      onClick={() => setSelectedListId(l.id)}
                    >
                      {/* Checkbox for multi-select */}
                      <input
                        type="checkbox"
                        checked={selectedListIds.has(l.id)}
                        onChange={(e) => { e.stopPropagation(); toggleSelect(l.id); }}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 flex-shrink-0 cursor-pointer"
                        title={l.enriched_at ? "Sélectionner pour fusionner" : "Enrichir d'abord pour fusionner"}
                      />

                      {/* Source + enriched icon */}
                      {l.enriched_at ? (
                        <span title={`Enrichi le ${new Date(l.enriched_at).toLocaleDateString("fr-FR")}`}>
                          <Sparkles className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                        </span>
                      ) : l.source === "search" ? (
                        <span title="PhantomBuster"><Globe className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" /></span>
                      ) : (
                        <span title="Import CSV"><FileSpreadsheet className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" /></span>
                      )}

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <p className={cn("font-medium truncate", selectedListId === l.id ? "text-indigo-700" : "text-gray-700")}>{l.name}</p>
                        <p className="text-gray-400 text-[10px] truncate">
                          {l.count} contacts
                          {l.company_tag && <span className="text-blue-500"> · {l.company_tag}</span>}
                          {l.companies?.length ? ` · ${l.companies.length} entrep.` : ""}
                          {" · "}{new Date(l.created_at).toLocaleDateString("fr-FR")}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); startEditing(l); }}
                          className="p-1 text-gray-300 hover:text-indigo-500 cursor-pointer"
                          title="Modifier"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteList(l.id); }}
                          className="p-1 text-gray-300 hover:text-red-500 cursor-pointer"
                          title="Supprimer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* CSV Preview table */}
      {activeTab === "csv" && parsedRows && parsedRows.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">
              Prévisualisation — {parsedRows.length} contact{parsedRows.length > 1 ? "s" : ""}
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500 text-[10px] uppercase">
                <tr>
                  {MAPPED_COLUMNS.map((col) => (
                    <th key={col} className="px-3 py-2.5 text-left">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {parsedRows.slice(0, 20).map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    {MAPPED_COLUMNS.map((col) => (
                      <td key={col} className="px-3 py-2 text-gray-700 max-w-[180px] truncate">
                        {row[col] || <span className="text-gray-300">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
                {parsedRows.length > 20 && (
                  <tr>
                    <td colSpan={MAPPED_COLUMNS.length} className="px-4 py-2 text-center text-gray-400 text-[10px]">
                      ... et {parsedRows.length - 20} de plus
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Selected list content */}
      {selectedListId && selectedList && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Toolbar */}
          <div className="p-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-0 flex items-center gap-2">
              {selectedList.source === "search" ? (
                <Globe className="w-4 h-4 text-blue-500 flex-shrink-0" />
              ) : (
                <FileSpreadsheet className="w-4 h-4 text-gray-400 flex-shrink-0" />
              )}
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-gray-700 truncate">{selectedList.name}</h2>
                <p className="text-xs text-gray-400">
                  {contacts.length} contacts{selectedList.companies?.length ? ` · ${selectedList.companies.length} entreprises` : ""}
                  {enrichableCount > 0 ? ` · ${enrichableCount} à enrichir` : ""}
                </p>
              </div>
            </div>

            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher..."
              className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-1 focus:ring-indigo-400 outline-none w-48"
            />

            {allRegions.length > 0 && (
              <select
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className="px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-1 focus:ring-indigo-400 outline-none max-w-[180px]"
              >
                <option value="">Toutes les régions</option>
                {allRegions.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            )}

            {enrichMsg && (
              <span className="text-xs font-medium px-2 py-1 rounded bg-green-50 text-green-700">{enrichMsg}</span>
            )}

            <div className="relative">
              <button
                onClick={() => setShowColPicker(!showColPicker)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
              >
                {showColPicker ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                Colonnes
                <ChevronDown className="w-3 h-3" />
              </button>
              {showColPicker && (
                <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-lg border border-gray-200 shadow-xl z-50 p-2 space-y-0.5 max-h-80 overflow-y-auto">
                  {ALL_COLUMNS.map((col) => (
                    <label key={col.key} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={visibleCols.has(col.key)}
                        onChange={() => toggleCol(col.key)}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className={cn(col.enrichedOnly ? "text-purple-600" : "text-gray-700")}>
                        {col.label}
                        {col.enrichedOnly && <span className="text-[9px] ml-1 text-purple-400">(enrichi)</span>}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={enrichList}
              disabled={enriching || (enrichableCount === 0 && selectedContactIds.size === 0)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 cursor-pointer"
            >
              {enriching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {selectedContactIds.size > 0
                ? `Enrichir sélection (${selectedContactIds.size})`
                : `Enrichir (${enrichableCount})`
              }
            </button>

            <button
              onClick={downloadCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Exporter CSV
            </button>

          </div>

          {/* Table */}
          {loadingContacts ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="text-xs" style={{ tableLayout: "fixed" }}>
                <thead className="bg-gray-50 text-gray-500 text-[10px] uppercase sticky top-0">
                  <tr>
                    <th className="px-2 py-2.5 w-8 min-w-[32px]">
                      <input
                        type="checkbox"
                        checked={filtered.length > 0 && filtered.every((c) => selectedContactIds.has(c.id))}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedContactIds(new Set(filtered.map((c) => c.id)));
                          } else {
                            setSelectedContactIds(new Set());
                          }
                        }}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </th>
                    {visibleColumns.map((col) => (
                      <th
                        key={col.key}
                        className="relative px-2 py-2.5 text-left whitespace-nowrap font-semibold select-none"
                        style={{ width: colWidths[col.key], minWidth: col.minWidth, maxWidth: colWidths[col.key] }}
                      >
                        {col.label}
                        <span
                          onMouseDown={(e) => onColResize(col.key, e)}
                          className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-indigo-400/40 transition-colors"
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((c) => (
                    <tr key={c.id} className={cn("hover:bg-gray-50/50", selectedContactIds.has(c.id) && "bg-indigo-50/50")}>
                      <td className="px-2 py-2 w-8">
                        <input
                          type="checkbox"
                          checked={selectedContactIds.has(c.id)}
                          onChange={() => {
                            setSelectedContactIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(c.id)) next.delete(c.id); else next.add(c.id);
                              return next;
                            });
                          }}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                      </td>
                      {visibleColumns.map((col) => {
                        const val = c[col.key];
                        const cellStyle = { width: colWidths[col.key], maxWidth: colWidths[col.key] };
                        if (col.key === "linkedin" && val) {
                          return (
                            <td key={col.key} className="px-2 py-2 overflow-hidden" style={cellStyle}>
                              <a href={String(val)} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800">
                                <Linkedin className="w-3.5 h-3.5" />
                              </a>
                            </td>
                          );
                        }
                        if (col.key === "enriched") {
                          return (
                            <td key={col.key} className="px-2 py-2 overflow-hidden" style={cellStyle}>
                              {val ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-green-100 text-green-700">Oui</span>
                              ) : (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-gray-100 text-gray-500">Non</span>
                              )}
                            </td>
                          );
                        }
                        return (
                          <td key={col.key} className="px-2 py-2 text-gray-700 truncate overflow-hidden" style={cellStyle}>
                            {val ? String(val) : <span className="text-gray-300">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={visibleColumns.length} className="px-4 py-8 text-center text-gray-400 text-sm">
                        {search ? "Aucun résultat" : "Aucun contact dans cette liste"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
