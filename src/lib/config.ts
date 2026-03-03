/**
 * Configuration des pipelines et stages Pipedrive.
 * IDs récupérés via l'API Pipedrive le 27/02/2026.
 */

export const PIPELINES = [
  {
    id: 1,
    name: "Hot leads (3-6 mois)",
    stages: [
      { id: 2, name: "Cold leads" },
      { id: 24, name: "Marketing Qualified Lead" },
      { id: 3, name: "Sales Qualified Lead" },
      { id: 1, name: "Opportunity Lead" },
      { id: 5, name: "Client" },
    ],
  },
  {
    id: 12,
    name: "6-12 mois",
    stages: [
      { id: 57, name: "Leads" },
      { id: 58, name: "Marketing Qualified Lead" },
      { id: 59, name: "Sales Qualified Lead" },
      { id: 60, name: "Devis envoyé" },
      { id: 61, name: "Devis validé" },
      { id: 62, name: "Nurturing" },
    ],
  },
  {
    id: 7,
    name: "Nurturing / cold leads",
    stages: [
      { id: 30, name: "Mail 1" },
      { id: 31, name: "Relance 1" },
      { id: 32, name: "Relecture" },
      { id: 33, name: "Publié" },
    ],
  },
  {
    id: 4,
    name: "Partenaires (Yves)",
    stages: [
      { id: 14, name: "Cold lead" },
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
