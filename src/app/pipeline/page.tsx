"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  TrendingUp,
  Hash,
  DollarSign,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Building2,
  User,
} from "lucide-react";
import { PIPELINES } from "@/lib/config";
import { cn } from "@/lib/utils";

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
}

interface StageStats {
  stageId: number;
  stageName: string;
  count: number;
  totalValue: number;
  deals: Deal[];
}

interface PipelineStats {
  pipelineId: number;
  pipelineName: string;
  totalDeals: number;
  totalValue: number;
  stages: StageStats[];
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export default function PipelinePage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPipeline, setExpandedPipeline] = useState<number | null>(null);
  const [expandedStage, setExpandedStage] = useState<string | null>(null);

  useEffect(() => {
    const fetchDeals = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/deals?status=open");
        const json = await res.json();
        setDeals(json.data || []);
      } catch (err) {
        console.error("Erreur chargement deals:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchDeals();
  }, []);

  // Build pipeline stats
  const pipelineStats: PipelineStats[] = PIPELINES.map((pipeline) => {
    const pipelineDeals = deals.filter((d) => d.pipeline_id === pipeline.id);
    const stages: StageStats[] = pipeline.stages.map((stage) => {
      const stageDeals = pipelineDeals.filter((d) => d.stage_id === stage.id);
      return {
        stageId: stage.id,
        stageName: stage.name,
        count: stageDeals.length,
        totalValue: stageDeals.reduce((sum, d) => sum + (d.value || 0), 0),
        deals: stageDeals,
      };
    });
    return {
      pipelineId: pipeline.id,
      pipelineName: pipeline.name,
      totalDeals: pipelineDeals.length,
      totalValue: pipelineDeals.reduce((sum, d) => sum + (d.value || 0), 0),
      stages,
    };
  });

  const grandTotalDeals = pipelineStats.reduce((s, p) => s + p.totalDeals, 0);
  const grandTotalValue = pipelineStats.reduce((s, p) => s + p.totalValue, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pipeline</h1>
          <p className="text-sm text-gray-500 mt-1">
            Vue d&apos;ensemble des affaires par pipeline et étape
          </p>
        </div>
      </div>

      {/* Totaux globaux */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center">
              <Hash className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Affaires ouvertes</p>
              <p className="text-2xl font-bold text-gray-900">{grandTotalDeals}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Valeur totale</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(grandTotalValue)}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Valeur moyenne</p>
              <p className="text-2xl font-bold text-gray-900">
                {grandTotalDeals > 0 ? formatCurrency(grandTotalValue / grandTotalDeals) : "—"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Pipelines */}
      <div className="space-y-4">
        {pipelineStats.map((pipeline) => {
          const isExpanded = expandedPipeline === pipeline.pipelineId;
          return (
            <div
              key={pipeline.pipelineId}
              className="bg-white rounded-xl border border-gray-200 overflow-hidden"
            >
              {/* Header pipeline */}
              <button
                onClick={() =>
                  setExpandedPipeline(isExpanded ? null : pipeline.pipelineId)
                }
                className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div className="text-left">
                    <h2 className="text-base font-semibold text-gray-900">
                      {pipeline.pipelineName}
                    </h2>
                    <p className="text-sm text-gray-500">
                      {pipeline.totalDeals} affaire{pipeline.totalDeals !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-lg font-bold text-gray-900">
                      {formatCurrency(pipeline.totalValue)}
                    </p>
                    <p className="text-xs text-gray-400">valeur totale</p>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  )}
                </div>
              </button>

              {/* Stages */}
              {isExpanded && (
                <div className="border-t border-gray-100">
                  {pipeline.stages.map((stage) => {
                    const stageKey = `${pipeline.pipelineId}-${stage.stageId}`;
                    const isStageExpanded = expandedStage === stageKey;
                    const hasDeals = stage.count > 0;
                    const barWidth =
                      pipeline.totalValue > 0
                        ? Math.max(
                            (stage.totalValue / pipeline.totalValue) * 100,
                            stage.count > 0 ? 3 : 0
                          )
                        : stage.count > 0
                        ? (stage.count / pipeline.totalDeals) * 100
                        : 0;

                    return (
                      <div key={stage.stageId}>
                        <button
                          onClick={() =>
                            hasDeals &&
                            setExpandedStage(isStageExpanded ? null : stageKey)
                          }
                          disabled={!hasDeals}
                          className={cn(
                            "w-full flex items-center gap-4 px-5 py-3 border-b border-gray-50 transition-colors",
                            hasDeals
                              ? "hover:bg-gray-50 cursor-pointer"
                              : "opacity-50 cursor-default"
                          )}
                        >
                          <div className="w-32 text-left">
                            <p
                              className={cn(
                                "text-sm font-medium",
                                hasDeals ? "text-gray-800" : "text-gray-400"
                              )}
                            >
                              {stage.stageName}
                            </p>
                          </div>
                          <div className="flex-1">
                            <div className="h-6 bg-gray-100 rounded-full overflow-hidden relative">
                              <div
                                className="h-full bg-gradient-to-r from-indigo-400 to-indigo-600 rounded-full transition-all duration-500"
                                style={{ width: `${barWidth}%` }}
                              />
                              {hasDeals && (
                                <span className="absolute inset-0 flex items-center px-3 text-xs font-medium text-gray-700">
                                  {stage.count} affaire{stage.count !== 1 ? "s" : ""}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="w-28 text-right">
                            <p
                              className={cn(
                                "text-sm font-semibold",
                                stage.totalValue > 0
                                  ? "text-emerald-600"
                                  : "text-gray-400"
                              )}
                            >
                              {formatCurrency(stage.totalValue)}
                            </p>
                          </div>
                          <div className="w-5">
                            {hasDeals &&
                              (isStageExpanded ? (
                                <ChevronUp className="w-4 h-4 text-gray-400" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-gray-400" />
                              ))}
                          </div>
                        </button>

                        {/* Deals list */}
                        {isStageExpanded && (
                          <div className="bg-gray-50 border-b border-gray-100">
                            {stage.deals.map((deal) => (
                              <Link
                                key={deal.id}
                                href={`/deal/${deal.id}`}
                                className="flex items-center justify-between px-8 py-2.5 hover:bg-gray-100 transition-colors border-b border-gray-100 last:border-0"
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <span className="text-sm font-medium text-gray-800 truncate">
                                    {deal.title}
                                  </span>
                                  {deal.org_name && (
                                    <span className="flex items-center gap-1 text-xs text-gray-400">
                                      <Building2 className="w-3 h-3" />
                                      {deal.org_name}
                                    </span>
                                  )}
                                  {deal.person_name && (
                                    <span className="flex items-center gap-1 text-xs text-gray-400">
                                      <User className="w-3 h-3" />
                                      {deal.person_name}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 flex-shrink-0">
                                  <span
                                    className={cn(
                                      "text-sm font-semibold",
                                      deal.value > 0
                                        ? "text-emerald-600"
                                        : "text-gray-400"
                                    )}
                                  >
                                    {formatCurrency(deal.value || 0)}
                                  </span>
                                  <ExternalLink className="w-3.5 h-3.5 text-gray-300" />
                                </div>
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
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
}
