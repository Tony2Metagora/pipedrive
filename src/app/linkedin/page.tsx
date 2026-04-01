"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Linkedin, PenTool, Calendar, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

const LinkedInGenerator = dynamic(() => import("@/components/LinkedInGenerator"), { ssr: false });
const LinkedInCalendar = dynamic(() => import("@/components/LinkedInCalendar"), { ssr: false });
const LinkedInCarouselBuilder = dynamic(() => import("@/components/LinkedInCarouselBuilder"), { ssr: false });

type LinkedInTab = "generator" | "calendar" | "carousel";

export default function LinkedInPage() {
  const [activeTab, setActiveTab] = useState<LinkedInTab>("generator");
  const [calendarKey, setCalendarKey] = useState(0);

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 sm:mb-6">
        <div className="w-9 h-9 sm:w-10 sm:h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <Linkedin className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-gray-900">Posts LinkedIn</h1>
          <p className="text-xs sm:text-sm text-gray-500">Génère et planifie tes posts LinkedIn</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-5">
        <button
          onClick={() => setActiveTab("generator")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer",
            activeTab === "generator"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          )}
        >
          <PenTool className="w-4 h-4" />
          Générateur
        </button>
        <button
          onClick={() => setActiveTab("calendar")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer",
            activeTab === "calendar"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          )}
        >
          <Calendar className="w-4 h-4" />
          Calendrier
        </button>
        <button
          onClick={() => setActiveTab("carousel")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer",
            activeTab === "carousel"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          )}
        >
          <Layers className="w-4 h-4" />
          Carrousel
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "generator" && (
        <LinkedInGenerator
          onPostValidated={() => {
            setCalendarKey((k) => k + 1);
          }}
        />
      )}
      {activeTab === "calendar" && <LinkedInCalendar key={calendarKey} />}
      {activeTab === "carousel" && <LinkedInCarouselBuilder />}
    </>
  );
}
