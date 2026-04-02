/** Codes NAF retail ciblés (alignés ApiGouvTab / Completion) */
export const RETAIL_NAF_CODES = [
  { code: "47.71Z", label: "Habillement (détail)" },
  { code: "47.72A", label: "Chaussures (détail)" },
  { code: "47.72B", label: "Maroquinerie & articles de voyage" },
  { code: "47.75Z", label: "Parfumerie & cosmétiques" },
  { code: "47.77Z", label: "Horlogerie & bijouterie" },
] as const;

export const RETAIL_NAF_CODE_SET = new Set<string>(RETAIL_NAF_CODES.map((x) => x.code));

/** Départements Île-de-France */
export const IDF_DEPARTEMENTS = ["75", "77", "78", "91", "92", "93", "94", "95"] as const;

/** Ordre d'affichage des grandes régions (libellés identiques au mapping dept→région du scrapping) */
export const GRANDES_REGIONS_ORDER: string[] = [
  "Ile-de-France",
  "Auvergne-Rhone-Alpes",
  "Hauts-de-France",
  "Nouvelle-Aquitaine",
  "Occitanie",
  "Grand Est",
  "Bretagne",
  "Pays de la Loire",
  "Normandie",
  "Centre-Val de Loire",
  "Bourgogne-Franche-Comte",
  "Provence-Alpes-Cote d'Azur",
  "Corse",
  "Guadeloupe",
  "Martinique",
  "Guyane",
  "La Reunion",
  "Saint-Pierre-et-Miquelon",
  "Mayotte",
  "Saint-Barthelemy",
  "Saint-Martin",
  "Wallis-et-Futuna",
  "Polynesie francaise",
  "Nouvelle-Caledonie",
];

export function normalizeDeptDigits(value: string | null | undefined): string {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "";
  if (raw === "2A" || raw === "2B") return raw;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length >= 3 && (digits.startsWith("97") || digits.startsWith("98"))) return digits.slice(0, 3);
  return digits.slice(0, 2);
}

export function isIdfDepartement(dept: string | null | undefined): boolean {
  const d = normalizeDeptDigits(dept);
  return IDF_DEPARTEMENTS.includes(d as (typeof IDF_DEPARTEMENTS)[number]);
}
