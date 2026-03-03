/**
 * Configuration des pipelines et stages Pipedrive.
 * IDs récupérés via l'API Pipedrive le 27/02/2026.
 */

export const PIPELINES = [
  {
    id: 1,
    name: "Hot leads (3-6 mois)",
    stages: [
      { id: 2, name: "cold leads" },
      { id: 24, name: "Marketing qualified lead" },
      { id: 3, name: "Sales Qualified lead" },
      { id: 1, name: "Opportunity lead" },
      { id: 5, name: "Client" },
    ],
  },
  {
    id: 12,
    name: "6-12 mois",
    stages: [
      { id: 57, name: "leads" },
      { id: 58, name: "Marketing qualified Lead" },
      { id: 59, name: "Sales qualified lead" },
      { id: 60, name: "Devis envoyé" },
      { id: 61, name: "devis validé" },
      { id: 62, name: "Nurturing" },
    ],
  },
  {
    id: 7,
    name: "Nurturing / cold leads",
    stages: [
      { id: 30, name: "démo à faire" },
      { id: 31, name: "nurturing" },
      { id: 32, name: "marketing lead" },
    ],
  },
  {
    id: 4,
    name: "Partenaires (Yves)",
    stages: [
      { id: 14, name: "cold lead" },
      { id: 15, name: "Marketing Qualified Lead" },
      { id: 17, name: "Sales Qualified Lead" },
      { id: 18, name: "Opportunity Lead" },
      { id: 41, name: "Client" },
    ],
  },
] as const;

/** Domaines email autorisés */
export const ALLOWED_DOMAINS = ["metagora.tech"];

/** Whitelist utilisateurs (en plus du domaine) */
export const ALLOWED_EMAILS = ["tony@metagora.tech"];

/** Types d'activité avec icônes */
export const ACTIVITY_TYPES = [
  { value: "call", label: "Appel", icon: "Phone" },
  { value: "email", label: "Email", icon: "Mail" },
  { value: "sms", label: "SMS / WhatsApp", icon: "MessageSquare" },
  { value: "meeting", label: "Rendez-vous", icon: "Calendar" },
  { value: "task", label: "Tâche", icon: "CheckSquare" },
] as const;

/** Récupère les stages d'un pipeline par ID */
export function getStagesForPipeline(pipelineId: number) {
  const pipeline = PIPELINES.find((p) => p.id === pipelineId);
  return pipeline?.stages ?? [];
}

/** Récupère le nom d'un pipeline par ID */
export function getPipelineName(pipelineId: number) {
  return PIPELINES.find((p) => p.id === pipelineId)?.name ?? "Inconnu";
}

/** Récupère le nom d'un stage par ID */
export function getStageName(stageId: number) {
  for (const pipeline of PIPELINES) {
    const stage = pipeline.stages.find((s) => s.id === stageId);
    if (stage) return stage.name;
  }
  return "Inconnu";
}
