"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Database, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

const ApiGouvTab = dynamic(() => import("@/components/ApiGouvTab"), { ssr: false });
const CompletionTab = dynamic(() => import("@/components/CompletionTab"), { ssr: false });

type ScrappingTab = "apigouv" | "completion";

export default function ScrappingPage() {
  const [activeTab, setActiveTab] = useState<ScrappingTab>("apigouv");

  return (
    <div>
      {/* Tab bar */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6">
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
          <button
            onClick={() => setActiveTab("completion")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors cursor-pointer",
              activeTab === "completion"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            )}
          >
            <BarChart3 className="w-4 h-4" />
            Completion
          </button>
        </div>

        {/* Tab content */}
        {activeTab === "apigouv" && <ApiGouvTab />}
        {activeTab === "completion" && <CompletionTab />}
    </div>
  );
}
