"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Globe,
  Loader2,
  Eye,
  Rocket,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Monitor,
  Smartphone,
  Sparkles,
  ImageIcon,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  Save,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Navbar from "@/components/Navbar";

// ─── Types ────────────────────────────────────────────────

interface StoreCity {
  city: string;
  country: string;
  flagEmoji: string;
}

interface BrandConfig {
  name: string;
  type: string;
  stores: Record<string, { name: string; address: string; image: string }>;
}

interface VariablesData {
  brandTypes: Record<string, { label: string; examples: string[]; keywords: Record<string, string>; basePath: string }>;
  languages: Record<string, { code: string; label: string }>;
  stores: Record<string, StoreCity>;
  brands: Record<string, BrandConfig>;
}

interface PreviewResult {
  html: string;
  variables: Record<string, string>;
  outputPath: string;
  publicUrl: string;
  variableCount: number;
}

interface GenerateResult {
  success: boolean;
  outputPath: string;
  publicUrl: string;
  sha: string;
  commitMessage: string;
  variablesUsed: number;
}

// ─── Slug helper ──────────────────────────────────────────

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .replace(/^-+|-+$/g, "");
}

// ─── Languages list (available even before variables.json loads) ──

const LANGUAGES = [
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "en", label: "English", flag: "🇬🇧" },
];

const ALL_CITIES = [
  { key: "paris", label: "Paris", flag: "\u{1F1EB}\u{1F1F7}", langs: ["fr"], urlCode: "fr" },
  { key: "london", label: "Londres", flag: "\u{1F1EC}\u{1F1E7}", langs: ["fr", "en"], urlCode: "uk" },
  { key: "newyork", label: "New York", flag: "\u{1F1FA}\u{1F1F8}", langs: ["fr", "en"], urlCode: "us" },
  { key: "tokyo", label: "Tokyo", flag: "\u{1F1EF}\u{1F1F5}", langs: ["fr"], urlCode: "jp" },
  { key: "shanghai", label: "Shanghai", flag: "\u{1F1E8}\u{1F1F3}", langs: ["fr"], urlCode: "cn" },
];

// ─── Component ────────────────────────────────────────────

export default function LandingGeneratorPage() {
  // Form state
  const [brandType, setBrandType] = useState<"luxe" | "premium">("luxe");
  const [brandName, setBrandName] = useState("");
  const [brandSlug, setBrandSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [language, setLanguage] = useState("fr");
  const [storeName, setStoreName] = useState("");
  const [storeCity, setStoreCity] = useState("paris");
  const [storeAddress, setStoreAddress] = useState("");
  const [storeImage, setStoreImage] = useState("");
  const [imageConfirmed, setImageConfirmed] = useState(false);
  const [storeFinderLoading, setStoreFinderLoading] = useState(false);
  const [imageSearchResults, setImageSearchResults] = useState<string[]>([]);
  const [imageSearchLoading, setImageSearchLoading] = useState(false);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [imageModalIndex, setImageModalIndex] = useState(0);
  const [imageSaving, setImageSaving] = useState(false);

  // UI state
  const [loading, setLoading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [showPreviewVars, setShowPreviewVars] = useState(false);
  const [showPreviewPage, setShowPreviewPage] = useState(false);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Variables.json metadata (for pre-filled brands)
  const [varsData, setVarsData] = useState<VariablesData | null>(null);

  // Load variables.json from API for brand suggestions
  useEffect(() => {
    fetch("/api/landing/variables")
      .then((r) => r.json())
      .then((d) => { if (d.data) setVarsData(d.data); })
      .catch(() => {});
  }, []);

  // Auto-compute slug from brand name
  useEffect(() => {
    if (!slugManual) {
      setBrandSlug(toSlug(brandName));
    }
  }, [brandName, slugManual]);

  // Pre-fill from known brand
  const knownBrands = useMemo(() => {
    if (!varsData?.brands) return [];
    return Object.entries(varsData.brands).map(([slug, b]) => ({
      slug,
      name: b.name,
      type: b.type as "luxe" | "premium",
      stores: b.stores,
    }));
  }, [varsData]);

  const selectKnownBrand = (slug: string) => {
    const brand = varsData?.brands[slug];
    if (!brand) return;
    setBrandName(brand.name);
    setBrandSlug(slug);
    setSlugManual(true);
    setBrandType(brand.type as "luxe" | "premium");

    // Pre-fill store if available for selected city
    const store = brand.stores[storeCity] || Object.values(brand.stores)[0];
    if (store) {
      setStoreName(store.name);
      setStoreAddress(store.address);
      setStoreImage(store.image);
      // Set city to match the store
      const cityKey = Object.keys(brand.stores).find((k) => brand.stores[k] === store) || storeCity;
      setStoreCity(cityKey);
    }
  };

  // When city changes, try to update store info from known brand
  useEffect(() => {
    if (!varsData?.brands) return;
    const brand = Object.entries(varsData.brands).find(([, b]) => b.name === brandName);
    if (!brand) return;
    const store = brand[1].stores[storeCity];
    if (store) {
      setStoreName(store.name);
      setStoreAddress(store.address);
      setStoreImage(store.image);
    }
  }, [storeCity, brandName, varsData]);

  // URL code derived from city (uk, us, fr, jp, cn)
  const urlCode = ALL_CITIES.find((c) => c.key === storeCity)?.urlCode || language;

  // Build request body
  const body = useMemo(() => ({
    brandSlug,
    brandName,
    brandType,
    language,
    urlCode,
    store: {
      name: storeName,
      address: storeAddress,
      city: storeCity,
      image: storeImage || `boutiques/Boutique ${brandName} ${urlCode}.jpg`,
    },
  }), [brandSlug, brandName, brandType, language, urlCode, storeName, storeAddress, storeCity, storeImage]);

  // Filter cities by language
  const cities = useMemo(() => ALL_CITIES.filter((c) => c.langs.includes(language)), [language]);

  // Reset city if current city not available for new language
  useEffect(() => {
    const available = ALL_CITIES.filter((c) => c.langs.includes(language));
    if (!available.find((c) => c.key === storeCity)) {
      setStoreCity(available[0]?.key || "paris");
    }
  }, [language, storeCity]);

  const isValid = brandName && brandSlug && storeName && storeAddress && imageConfirmed;

  // ─── Actions ──────────────────────────────────────────

  const handlePreview = async () => {
    setError(null);
    setResult(null);
    setPreviewing(true);
    try {
      const res = await fetch("/api/landing/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.error) {
        setError(json.error);
      } else {
        setPreview(json);
        setShowPreviewPage(true);
        setShowPreviewVars(false);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setPreviewing(false);
    }
  };

  const handleGenerate = async () => {
    if (!confirm(`Générer et déployer la landing page pour ${brandName} (${urlCode}) ?\n\nFichier: ${preview?.outputPath || `retail-${brandType}/${brandSlug}/${urlCode}/index.html`}\nURL: ${preview?.publicUrl || `https://metagora-tech.fr/retail-${brandType}/${brandSlug}/${urlCode}/`}`)) return;

    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/landing/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.error) {
        setError(json.error);
      } else {
        setResult(json);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // AI store finder
  const handleFindStore = async () => {
    if (!brandName) return;
    setStoreFinderLoading(true);
    setError(null);
    try {
      const cityLabel = ALL_CITIES.find((c) => c.key === storeCity)?.label || storeCity;
      const res = await fetch("/api/landing/store-finder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandName, city: cityLabel }),
      });
      const json = await res.json();
      if (json.error) {
        setError(json.error);
      } else if (json.data?.notFound) {
        setError(`Pas de boutique flagship trouvée pour ${brandName} à ${cityLabel}`);
      } else {
        setStoreName(json.data.storeName || "");
        setStoreAddress(json.data.storeAddress || "");
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setStoreFinderLoading(false);
    }
  };

  // Image search
  const handleImageSearch = async () => {
    if (!storeName) return;
    setImageSearchLoading(true);
    setImageSearchResults([]);
    setError(null);
    try {
      const res = await fetch("/api/landing/image-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: `${brandName} ${storeName} ${storeAddress} store facade exterior photo` }),
      });
      const json = await res.json();
      if (json.error) {
        setError(json.error);
      } else {
        setImageSearchResults(json.data || []);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setImageSearchLoading(false);
    }
  };

  // Open image in modal for preview
  const openImageModal = (index: number) => {
    setImageModalIndex(index);
    setImageModalOpen(true);
  };

  // Confirm and save the selected image
  const handleConfirmImage = async () => {
    const imageUrl = imageSearchResults[imageModalIndex];
    if (!imageUrl) return;
    setImageSaving(true);
    setError(null);
    const imagePath = `boutiques/Boutique ${brandName} ${urlCode}.jpg`;
    setStoreImage(imagePath);
    try {
      const res = await fetch("/api/landing/save-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl, imagePath, brandType }),
      });
      const json = await res.json();
      if (json.error) {
        setError(json.error);
        return;
      }
      setImageConfirmed(true);
      setImageSearchResults([]);
      setImageModalOpen(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setImageSaving(false);
    }
  };

  return (
    <>
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
            <Globe className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Générateur de Landing Pages</h1>
            <p className="text-sm text-gray-500">Créez des pages personnalisées par marque et langue</p>
          </div>
        </div>

        {/* Success banner */}
        {result && (
          <div className="mb-6 rounded-xl border border-green-200 bg-green-50 p-5">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-green-800 mb-1">Page générée et déployée !</h3>
                <p className="text-xs text-green-700 mb-3">Commit: {result.commitMessage} • {result.variablesUsed} variables remplacées</p>
                <div className="flex items-center gap-2">
                  <a
                    href={result.publicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Voir la page
                  </a>
                  <button
                    onClick={() => copyUrl(result.publicUrl)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 bg-white border border-green-200 rounded-lg hover:bg-green-50 transition-colors cursor-pointer"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? "Copié !" : "Copier l'URL"}
                  </button>
                </div>
                <p className="text-[11px] text-green-600 mt-2">Fichier: {result.outputPath}</p>
              </div>
            </div>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-800">Erreur</p>
              <p className="text-xs text-red-600 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ─── Form ─────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-6">
            {/* Brand type */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-800 mb-3">Type de marque</h2>
              <div className="flex gap-3">
                {(["luxe", "premium"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setBrandType(t)}
                    className={cn(
                      "flex-1 py-3 px-4 rounded-xl border-2 text-sm font-semibold transition-all cursor-pointer",
                      brandType === t
                        ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                        : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                    )}
                  >
                    <span className="text-lg mb-1 block">{t === "luxe" ? "💎" : "⭐"}</span>
                    {t === "luxe" ? "Luxe" : "Premium"}
                    <span className="block text-[10px] font-normal text-gray-400 mt-0.5">
                      {t === "luxe" ? "Louis Vuitton, Hermès, Dior..." : "Lacoste, Nike, Sephora..."}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Brand name + slug */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-800 mb-3">Marque</h2>

              {/* Quick select from known brands */}
              {knownBrands.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {knownBrands.map((b) => (
                    <button
                      key={b.slug}
                      onClick={() => selectKnownBrand(b.slug)}
                      className={cn(
                        "px-2.5 py-1 text-xs rounded-full border transition-colors cursor-pointer",
                        brandSlug === b.slug
                          ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-medium"
                          : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                      )}
                    >
                      {b.name}
                    </button>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nom de la marque</label>
                  <input
                    type="text"
                    value={brandName}
                    onChange={(e) => { setBrandName(e.target.value); setSlugManual(false); }}
                    placeholder="Louis Vuitton"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Slug URL</label>
                  <input
                    type="text"
                    value={brandSlug}
                    onChange={(e) => { setBrandSlug(e.target.value); setSlugManual(true); }}
                    placeholder="louisvuitton"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none font-mono text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Language */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-800 mb-3">Langue</h2>
              <div className="flex gap-2">
                {LANGUAGES.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => setLanguage(l.code)}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors cursor-pointer",
                      language === l.code
                        ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                        : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                    )}
                  >
                    <span>{l.flag}</span>
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Store */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-800 mb-3">Boutique emblématique</h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Ville</label>
                  <div className="flex flex-wrap gap-1.5">
                    {cities.map((c) => (
                      <button
                        key={c.key}
                        onClick={() => setStoreCity(c.key)}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer",
                          storeCity === c.key
                            ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                            : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                        )}
                      >
                        <span>{c.flag}</span> {c.label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* AI Store Finder button */}
                <button
                  onClick={handleFindStore}
                  disabled={!brandName || storeFinderLoading}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {storeFinderLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {storeFinderLoading ? "Recherche IA..." : "Trouver la boutique flagship (IA)"}
                </button>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nom de la boutique</label>
                  <input
                    type="text"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    placeholder="Louis Vuitton Maison Champs-Élysées"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Adresse complète</label>
                  <input
                    type="text"
                    value={storeAddress}
                    onChange={(e) => setStoreAddress(e.target.value)}
                    placeholder="101 avenue des Champs-Élysées, 75008 Paris"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none"
                  />
                </div>

                {/* Image section */}
                <div className="border-t border-gray-100 pt-3 mt-1">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-gray-600">Image boutique</label>
                    {imageConfirmed && (
                      <span className="flex items-center gap-1 text-[10px] text-green-600 font-medium">
                        <Check className="w-3 h-3" /> Image confirmée
                      </span>
                    )}
                  </div>
                  {storeImage && (
                    <p className="text-[10px] font-mono text-gray-400 mb-2">{storeImage}</p>
                  )}
                  <button
                    onClick={handleImageSearch}
                    disabled={!storeName || imageSearchLoading}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {imageSearchLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    {imageSearchLoading ? "Recherche..." : "Rechercher des photos"}
                  </button>

                  {/* Image search results grid */}
                  {imageSearchResults.length > 0 && (
                    <div className="mt-3">
                      <p className="text-[10px] text-gray-500 mb-2">Cliquez sur une image pour la sélectionner :</p>
                      <div className="grid grid-cols-3 gap-2">
                        {imageSearchResults.map((url, i) => (
                          <button
                            key={i}
                            onClick={() => openImageModal(i)}
                            className="relative aspect-video rounded-lg overflow-hidden border-2 border-gray-200 hover:border-indigo-500 transition-colors cursor-pointer group"
                          >
                            <img
                              src={url}
                              alt={`Résultat ${i + 1}`}
                              className="w-full h-full object-cover"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                              <ImageIcon className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {!imageConfirmed && !imageSearchResults.length && (
                    <p className="text-[10px] text-amber-600 mt-2 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Image requise avant prévisualisation et déploiement
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ─── Sidebar: Summary + Actions ───────────── */}
          <div className="space-y-4">
            {/* Summary card */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 sticky top-20">
              <h2 className="text-sm font-semibold text-gray-800 mb-3">Résumé</h2>
              <div className="space-y-2 text-xs text-gray-600">
                <div className="flex justify-between">
                  <span className="text-gray-400">Type</span>
                  <span className="font-medium">{brandType === "luxe" ? "💎 Luxe" : "⭐ Premium"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Marque</span>
                  <span className="font-medium">{brandName || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Langue</span>
                  <span className="font-medium">{LANGUAGES.find((l) => l.code === language)?.flag} {language.toUpperCase()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Ville</span>
                  <span className="font-medium">{ALL_CITIES.find((c) => c.key === storeCity)?.flag} {ALL_CITIES.find((c) => c.key === storeCity)?.label}</span>
                </div>
                <hr className="border-gray-100" />
                <div>
                  <span className="text-gray-400">Fichier</span>
                  <p className="font-mono text-[10px] text-gray-500 mt-0.5 break-all">
                    retail-{brandType}/{brandSlug || "..."}/{urlCode}/index.html
                  </p>
                </div>
                <div>
                  <span className="text-gray-400">URL publique</span>
                  <p className="font-mono text-[10px] text-indigo-500 mt-0.5 break-all">
                    metagora-tech.fr/retail-{brandType}/{brandSlug || "..."}/{urlCode}/
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-5 space-y-2">
                <button
                  onClick={handlePreview}
                  disabled={!isValid || previewing}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-xl hover:bg-indigo-100 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {previewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                  Prévisualiser
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={!isValid || loading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors cursor-pointer shadow-sm"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
                  {loading ? "Génération..." : "Générer & Déployer"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Full page preview (iframe) ─────────────────── */}
        {preview && showPreviewPage && (
          <div className="mt-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <span className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                <Eye className="w-4 h-4 text-indigo-500" />
                Prévisualisation de la page
              </span>
              <div className="flex items-center gap-2">
                {/* Desktop / Mobile toggle */}
                <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setPreviewMode("desktop")}
                    className={cn(
                      "flex items-center gap-1 px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
                      previewMode === "desktop" ? "bg-indigo-50 text-indigo-700" : "text-gray-400 hover:text-gray-600"
                    )}
                  >
                    <Monitor className="w-3.5 h-3.5" /> Desktop
                  </button>
                  <button
                    onClick={() => setPreviewMode("mobile")}
                    className={cn(
                      "flex items-center gap-1 px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
                      previewMode === "mobile" ? "bg-indigo-50 text-indigo-700" : "text-gray-400 hover:text-gray-600"
                    )}
                  >
                    <Smartphone className="w-3.5 h-3.5" /> Mobile
                  </button>
                </div>
                <button
                  onClick={() => setShowPreviewVars(!showPreviewVars)}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium cursor-pointer"
                >
                  {showPreviewVars ? "Masquer variables" : `Voir les ${preview.variableCount} variables`}
                </button>
                <button
                  onClick={() => setShowPreviewPage(false)}
                  className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer ml-2"
                >
                  Fermer
                </button>
              </div>
            </div>
            {showPreviewVars && (
              <div className="border-b border-gray-100 px-5 py-4 max-h-60 overflow-y-auto bg-gray-50">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
                  {Object.entries(preview.variables).map(([key, val]) => (
                    <div key={key} className="flex gap-2 py-1 border-b border-gray-50">
                      <code className="text-[10px] font-mono text-indigo-600 whitespace-nowrap flex-shrink-0">{`{{${key}}}`}</code>
                      <span className="text-[10px] text-gray-600 truncate" title={val}>{val || <em className="text-gray-300">vide</em>}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="bg-gray-100 flex justify-center overflow-hidden" style={{ height: "80vh" }}>
              <div
                className="origin-top"
                style={
                  previewMode === "desktop"
                    ? { width: 1440, transform: "scale(0.6)", height: "133vh" }
                    : { width: 390, transform: "scale(0.85)", height: "94vh" }
                }
              >
                <iframe
                  srcDoc={preview.html}
                  className="border-0 bg-white"
                  style={
                    previewMode === "desktop"
                      ? { width: 1440, height: "133vh" }
                      : { width: 390, height: "94vh", borderRadius: 20, boxShadow: "0 4px 24px rgba(0,0,0,0.12)" }
                  }
                  title="Landing page preview"
                  sandbox="allow-scripts"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── Image picker modal ───────────────────────────── */}
      {imageModalOpen && imageSearchResults.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="relative w-full max-w-4xl mx-4">
            {/* Close button */}
            <button
              onClick={() => setImageModalOpen(false)}
              className="absolute -top-12 right-0 text-white/80 hover:text-white cursor-pointer"
            >
              <X className="w-6 h-6" />
            </button>

            {/* Image counter */}
            <div className="text-center text-white/70 text-sm mb-3">
              {imageModalIndex + 1} / {imageSearchResults.length}
            </div>

            {/* Main image */}
            <div className="relative bg-black rounded-xl overflow-hidden flex items-center justify-center" style={{ minHeight: 400 }}>
              <img
                src={imageSearchResults[imageModalIndex]}
                alt={`Image ${imageModalIndex + 1}`}
                className="max-w-full max-h-[70vh] object-contain"
                onError={(e) => { (e.target as HTMLImageElement).alt = "Image indisponible"; }}
              />

              {/* Prev button */}
              {imageModalIndex > 0 && (
                <button
                  onClick={() => setImageModalIndex((i) => i - 1)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center text-white cursor-pointer transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}

              {/* Next button */}
              {imageModalIndex < imageSearchResults.length - 1 && (
                <button
                  onClick={() => setImageModalIndex((i) => i + 1)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center text-white cursor-pointer transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-center gap-3 mt-4">
              <button
                onClick={() => setImageModalOpen(false)}
                className="px-5 py-2.5 text-sm font-medium text-white/80 bg-white/10 border border-white/20 rounded-xl hover:bg-white/20 transition-colors cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={handleConfirmImage}
                disabled={imageSaving}
                className="px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors cursor-pointer flex items-center gap-2 shadow-lg"
              >
                {imageSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {imageSaving ? "Sauvegarde..." : "Confirmer et sauvegarder"}
              </button>
            </div>

            {/* Thumbnails strip */}
            <div className="flex items-center justify-center gap-2 mt-4 overflow-x-auto pb-2">
              {imageSearchResults.map((url, i) => (
                <button
                  key={i}
                  onClick={() => setImageModalIndex(i)}
                  className={cn(
                    "flex-shrink-0 w-16 h-12 rounded-lg overflow-hidden border-2 transition-all cursor-pointer",
                    i === imageModalIndex ? "border-indigo-500 ring-2 ring-indigo-500/50" : "border-white/20 opacity-60 hover:opacity-100"
                  )}
                >
                  <img src={url} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
