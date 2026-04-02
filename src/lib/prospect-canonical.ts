export const CANONICAL_PROSPECT_FIELDS = [
  "nom",
  "prenom",
  "email",
  "telephone",
  "poste",
  "entreprise",
  "statut",
  "pipelines",
  "notes",
  "linkedin",
  "naf_code",
  "effectifs",
  "ai_score",
  "ai_comment",
  "resume_entreprise",
  "siren",
  "siret",
  "adresse_siege",
  "categorie_entreprise",
  "chiffre_affaires",
  "resultat_net",
  "date_creation_entreprise",
  "dirigeants",
  "ville",
] as const;

export type CanonicalProspectField = (typeof CANONICAL_PROSPECT_FIELDS)[number];

const ALIASES: Record<string, CanonicalProspectField> = {
  nom: "nom",
  lastname: "nom",
  last_name: "nom",
  "last name": "nom",
  surname: "nom",

  prenom: "prenom",
  prénom: "prenom",
  firstname: "prenom",
  first_name: "prenom",
  "first name": "prenom",
  givenname: "prenom",
  first: "prenom",

  email: "email",
  "e-mail": "email",
  mail: "email",

  telephone: "telephone",
  téléphone: "telephone",
  phone: "telephone",
  mobile: "telephone",
  mobile_phone: "telephone",
  "phone number": "telephone",

  poste: "poste",
  title: "poste",
  job: "poste",
  jobtitle: "poste",
  job_title: "poste",
  "job title": "poste",
  fonction: "poste",
  position: "poste",

  entreprise: "entreprise",
  company: "entreprise",
  companyname: "entreprise",
  company_name: "entreprise",
  "company name": "entreprise",
  organization: "entreprise",
  organisation: "entreprise",
  "org name": "entreprise",

  statut: "statut",
  status: "statut",

  pipelines: "pipelines",
  pipeline: "pipelines",
  tags: "pipelines",

  notes: "notes",
  note: "notes",
  commentaire: "notes",

  linkedin: "linkedin",
  linkedinurl: "linkedin",
  linkedin_url: "linkedin",
  linkedinprofileurl: "linkedin",
  profileurl: "linkedin",
  defaultprofileurl: "linkedin",
  company_linkedin: "linkedin",
  companylinkedin: "linkedin",
  company_linkedin_url: "linkedin",

  naf: "naf_code",
  nafcode: "naf_code",
  naf_code: "naf_code",
  naf5code: "naf_code",
  naf5_code: "naf_code",

  effectifs: "effectifs",
  nbeemployees: "effectifs",
  nbemployees: "effectifs",
  nb_employees: "effectifs",

  aiscore: "ai_score",
  ai_score: "ai_score",
  aicomment: "ai_comment",
  ai_comment: "ai_comment",
  resumeentreprise: "resume_entreprise",
  resume_entreprise: "resume_entreprise",

  siren: "siren",
  siret: "siret",
  siretaddress: "adresse_siege",
  siret_address: "adresse_siege",
  adressesiege: "adresse_siege",
  adresse_siege: "adresse_siege",

  categorieentreprise: "categorie_entreprise",
  categorie_entreprise: "categorie_entreprise",
  chiffreaffaires: "chiffre_affaires",
  chiffre_affaires: "chiffre_affaires",
  resultatnet: "resultat_net",
  resultat_net: "resultat_net",
  datecreationentreprise: "date_creation_entreprise",
  date_creation_entreprise: "date_creation_entreprise",
  dirigeants: "dirigeants",
  ville: "ville",
  city: "ville",
  location: "ville",
};

export function normalizeProspectKey(input: string): string {
  return (input || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function resolveCanonicalProspectField(input: string): CanonicalProspectField | null {
  const clean = normalizeProspectKey(input);
  if (!clean) return null;
  const compact = clean.replace(/\s+/g, "");
  return ALIASES[clean] || ALIASES[compact] || null;
}
