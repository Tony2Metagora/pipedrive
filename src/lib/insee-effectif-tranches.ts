/**
 * Codes officiels tranche d’effectifs salariés (INSEE / API Recherche d’entreprises).
 */

export const INSEE_TRANCHE_OPTIONS: { code: string; label: string }[] = [
  { code: "NN", label: "Non renseigné" },
  { code: "00", label: "0 salarié" },
  { code: "01", label: "1 ou 2" },
  { code: "02", label: "3 à 5" },
  { code: "03", label: "6 à 9" },
  { code: "11", label: "10 à 19" },
  { code: "12", label: "20 à 49" },
  { code: "21", label: "50 à 99" },
  { code: "22", label: "100 à 199" },
  { code: "31", label: "200 à 249" },
  { code: "32", label: "250 à 499" },
  { code: "41", label: "500 à 999" },
  { code: "42", label: "1 000 à 1 999" },
  { code: "51", label: "2 000 à 4 999" },
  { code: "52", label: "5 000 à 9 999" },
  { code: "53", label: "10 000 et plus" },
];

/** Regroupements métier → codes INSEE à envoyer à l’API (multi-sélection). */
export const EFFECTIF_PRESETS: { id: string; label: string; codes: string[] }[] = [
  { id: "p-0-19", label: "0–19 salariés", codes: ["00", "01", "02", "03", "11"] },
  { id: "p-20-99", label: "20–99 salariés", codes: ["12", "21"] },
  { id: "p-100-499", label: "100–499 salariés", codes: ["22", "31", "32"] },
  { id: "p-500plus", label: "500 salariés et +", codes: ["41", "42", "51", "52", "53"] },
];
