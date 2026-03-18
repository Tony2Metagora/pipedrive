"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { FileSpreadsheet, Globe, Database } from "lucide-react";
import { cn } from "@/lib/utils";

const ImportTab = dynamic(() => import("@/components/ImportTab"), { ssr: false });
const ApiGouvTab = dynamic(() => import("@/components/ApiGouvTab"), { ssr: false });

type ScrappingTab = "csv" | "phantom" | "apigouv";

export default function ScrappingPage() {
  const [activeTab, setActiveTab] = useState<ScrappingTab>("csv");

  return (
    <div>
      {/* Tab bar */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6">
          <button
            onClick={() => setActiveTab("csv")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors cursor-pointer",
              activeTab === "csv"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            )}
          >
            <FileSpreadsheet className="w-4 h-4" />
            Import CSV
          </button>
          <button
            onClick={() => setActiveTab("phantom")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors cursor-pointer",
              activeTab === "phantom"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            )}
          >
            <Globe className="w-4 h-4" />
            PhantomBuster
          </button>
          <button
            onClick={() => setActiveTab("apigouv")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors cursor-pointer",
              activeTab === "apigouv"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            )}
          >
            <Database className="w-4 h-4" />
            API Gouv
          </button>
        </div>

        {/* Tab content */}
        {activeTab === "apigouv" && <ApiGouvTab />}
        {(activeTab === "csv" || activeTab === "phantom") && (
          <ImportTab initialTab={activeTab === "phantom" ? "search" : "csv"} key={activeTab} />
        )}
    </div>
  );
}
