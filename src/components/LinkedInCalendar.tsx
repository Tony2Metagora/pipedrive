"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ChevronLeft, ChevronRight, Loader2, Trash2, Clock, Eye, X, Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────

interface CalendarPost {
  id: string;
  title: string;
  content: string;
  theme: string;
  hook: string;
  publishDate: string;
  publishTime: string;
  createdAt: string;
  imagePrompt?: string;
}

const THEME_COLORS: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  "journal-ceo": { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-400", label: "1️⃣ CEO" },
  "ia-formation": { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-400", label: "2️⃣ Formation" },
  "ia-operationnelle": { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-400", label: "3️⃣ IA Opé" },
};

const DAY_NAMES = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

const THEME_OPTIONS = [
  { key: "journal-ceo", label: "1️⃣ Journal d'un CEO" },
  { key: "ia-formation", label: "2️⃣ IA dans la formation" },
  { key: "ia-operationnelle", label: "3️⃣ IA Opérationnelle" },
];

export default function LinkedInCalendar() {
  const [posts, setPosts] = useState<CalendarPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedPost, setSelectedPost] = useState<CalendarPost | null>(null);

  // Manual post creation
  const [showAddPost, setShowAddPost] = useState(false);
  const [newPostTitle, setNewPostTitle] = useState("");
  const [newPostTheme, setNewPostTheme] = useState("journal-ceo");
  const [newPostDate, setNewPostDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [newPostTime, setNewPostTime] = useState("09:00");
  const [addPostLoading, setAddPostLoading] = useState(false);

  // ─── Load posts ───────────────────────────────────────

  const loadPosts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/linkedin/posts");
      const json = await res.json();
      setPosts(json.data || []);
    } catch (err) {
      console.error("Load posts error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  // ─── Calendar computation ─────────────────────────────

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    // Monday = 0 for our grid
    let startDow = firstDay.getDay() - 1;
    if (startDow < 0) startDow = 6;

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days: Array<{ date: number; inMonth: boolean; dateStr: string }> = [];

    // Previous month padding
    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = startDow - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      const m = month === 0 ? 12 : month;
      const y = month === 0 ? year - 1 : year;
      days.push({ date: d, inMonth: false, dateStr: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` });
    }

    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      days.push({
        date: d,
        inMonth: true,
        dateStr: `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      });
    }

    // Next month padding (fill to complete weeks)
    const remaining = 7 - (days.length % 7);
    if (remaining < 7) {
      for (let d = 1; d <= remaining; d++) {
        const m = month + 2 > 12 ? 1 : month + 2;
        const y = month + 2 > 12 ? year + 1 : year;
        days.push({ date: d, inMonth: false, dateStr: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` });
      }
    }

    return days;
  }, [year, month]);

  // Map posts to dates
  const postsByDate = useMemo(() => {
    const map = new Map<string, CalendarPost[]>();
    for (const p of posts) {
      const arr = map.get(p.publishDate) || [];
      arr.push(p);
      map.set(p.publishDate, arr);
    }
    return map;
  }, [posts]);

  const todayStr = new Date().toISOString().split("T")[0];

  const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

  const handleAddManualPost = async () => {
    if (!newPostTitle.trim()) return;
    setAddPostLoading(true);
    try {
      const res = await fetch("/api/linkedin/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newPostTitle.trim(),
          content: newPostTitle.trim(),
          theme: newPostTheme,
          hook: "",
          publishDate: newPostDate,
          publishTime: newPostTime,
        }),
      });
      const json = await res.json();
      if (json.data) {
        setPosts((prev) => [...prev, json.data]);
        setNewPostTitle("");
        setShowAddPost(false);
      }
    } catch (err) {
      console.error("Add post error:", err);
    } finally {
      setAddPostLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer ce post ?")) return;
    try {
      await fetch("/api/linkedin/posts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setPosts((prev) => prev.filter((p) => p.id !== id));
      setSelectedPost(null);
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  // ─── Render ───────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-lg sm:text-xl font-bold text-gray-900">
          {monthNames[month]} {year}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddPost(!showAddPost)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Ajouter
          </button>
          <button
            onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
            className="p-1.5 rounded-lg hover:bg-gray-100 cursor-pointer"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <button
            onClick={() => setCurrentDate(new Date())}
            className="px-3 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 cursor-pointer"
          >
            Aujourd&apos;hui
          </button>
          <button
            onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
            className="p-1.5 rounded-lg hover:bg-gray-100 cursor-pointer"
          >
            <ChevronRight className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Add post form */}
      {showAddPost && (
        <div className="mb-4 p-4 bg-white rounded-xl border border-gray-200 space-y-3">
          <p className="text-sm font-semibold text-gray-800">Ajouter un post manuellement</p>
          <input
            type="text"
            value={newPostTitle}
            onChange={(e) => setNewPostTitle(e.target.value)}
            placeholder="Titre du post"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-300"
          />
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={newPostTheme}
              onChange={(e) => setNewPostTheme(e.target.value)}
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-300 bg-white"
            >
              {THEME_OPTIONS.map((t) => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={newPostDate}
                onChange={(e) => setNewPostDate(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-300"
              />
              <input
                type="time"
                value={newPostTime}
                onChange={(e) => setNewPostTime(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAddManualPost}
              disabled={!newPostTitle.trim() || addPostLoading}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
            >
              {addPostLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Ajouter
            </button>
            <button onClick={() => setShowAddPost(false)} className="px-4 py-2 text-sm text-gray-500 bg-gray-100 rounded-lg hover:bg-gray-200 cursor-pointer">
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Calendar grid */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-gray-200">
          {DAY_NAMES.map((d) => (
            <div key={d} className="px-1 sm:px-2 py-2 text-center text-[10px] sm:text-xs font-semibold text-gray-500 uppercase">
              {d}
            </div>
          ))}
        </div>

        {/* Days */}
        <div className="grid grid-cols-7">
          {calendarDays.map((day, i) => {
            const dayPosts = postsByDate.get(day.dateStr) || [];
            const isToday = day.dateStr === todayStr;

            return (
              <div
                key={i}
                className={cn(
                  "min-h-[60px] sm:min-h-[90px] border-b border-r border-gray-100 p-1 sm:p-1.5",
                  !day.inMonth && "bg-gray-50/50",
                  isToday && "bg-blue-50/30"
                )}
              >
                <span
                  className={cn(
                    "text-[10px] sm:text-xs font-medium",
                    !day.inMonth ? "text-gray-300" : isToday ? "text-blue-600 font-bold" : "text-gray-600"
                  )}
                >
                  {day.date}
                </span>

                {dayPosts.map((p) => {
                  const tc = THEME_COLORS[p.theme] || THEME_COLORS["journal-ceo"];
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPost(p)}
                      className={cn(
                        "w-full mt-0.5 px-1 py-0.5 sm:py-1 rounded text-left cursor-pointer transition-colors",
                        tc.bg, tc.text, "hover:opacity-80"
                      )}
                    >
                      <span className="text-[8px] sm:text-[10px] flex items-center gap-0.5 opacity-70">
                        {p.publishTime} {tc.label.split(" ")[0]}
                      </span>
                      <span className="text-[9px] sm:text-[10px] font-medium block truncate">
                        {p.title}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Stats */}
      <div className="mt-4 flex flex-wrap gap-3">
        {Object.entries(THEME_COLORS).map(([key, tc]) => {
          const count = posts.filter((p) => p.theme === key).length;
          return (
            <div key={key} className="flex items-center gap-1.5">
              <div className={cn("w-2.5 h-2.5 rounded-full", tc.dot)} />
              <span className="text-xs text-gray-600">{tc.label}: <strong>{count}</strong></span>
            </div>
          );
        })}
        <span className="text-xs text-gray-400">Total: <strong>{posts.length}</strong> posts</span>
      </div>

      {/* Post detail modal */}
      {selectedPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSelectedPost(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  {(() => {
                    const tc = THEME_COLORS[selectedPost.theme] || THEME_COLORS["journal-ceo"];
                    return <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", tc.bg, tc.text)}>{tc.label}</span>;
                  })()}
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <Clock className="w-3 h-3" />
                    {selectedPost.publishDate} à {selectedPost.publishTime}
                  </span>
                </div>
                <h3 className="text-base font-semibold text-gray-900">{selectedPost.title}</h3>
              </div>
              <button onClick={() => setSelectedPost(null)} className="p-1 hover:bg-gray-100 rounded-lg cursor-pointer">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {selectedPost.hook && (
              <div className="mb-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-[10px] text-blue-500 font-medium mb-0.5">ACCROCHE</p>
                <p className="text-sm text-blue-800">{selectedPost.hook}</p>
              </div>
            )}

            <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed mb-4 max-h-60 overflow-y-auto">
              {selectedPost.content}
            </div>

            {selectedPost.imagePrompt && (
              <p className="text-[10px] text-gray-400 mb-3">🖼️ Image prompt: {selectedPost.imagePrompt}</p>
            )}

            <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
              <button
                onClick={() => { navigator.clipboard.writeText(selectedPost.content); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5" />
                Copier le post
              </button>
              <button
                onClick={() => handleDelete(selectedPost.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
