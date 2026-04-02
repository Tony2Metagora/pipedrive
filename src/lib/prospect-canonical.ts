export const CANONICAL_PROSPECT_FIELDS = [
  "nom",
  "prenom",
  "email",
  "telephone",
  "poste",
  "entreprise",
  "linkedin",
  "naf_code",
  "effectifs",
  "ville",
  "duree_poste",
  "duree_entreprise",
  "linkedin_entreprise",
  "resume_entreprise",
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

  linkedin: "linkedin",
  linkedinurl: "linkedin",
  linkedin_url: "linkedin",
  linkedinprofileurl: "linkedin",
  profileurl: "linkedin",
  defaultprofileurl: "linkedin",
  company_linkedin: "linkedin_entreprise",
  companylinkedin: "linkedin_entreprise",
  company_linkedin_url: "linkedin_entreprise",

  naf: "naf_code",
  nafcode: "naf_code",
  naf_code: "naf_code",
  naf5code: "naf_code",
  naf5_code: "naf_code",

  effectifs: "effectifs",
  nbeemployees: "effectifs",
  nbemployees: "effectifs",
  nb_employees: "effectifs",

  resumeentreprise: "resume_entreprise",
  resume_entreprise: "resume_entreprise",

  ville: "ville",
  city: "ville",
  location: "ville",

  durationinrole: "duree_poste",
  duration_in_role: "duree_poste",
  duree_poste: "duree_poste",
  "duree dans le poste": "duree_poste",
  "durée dans le poste": "duree_poste",

  durationincompany: "duree_entreprise",
  duration_in_company: "duree_entreprise",
  duree_entreprise: "duree_entreprise",
  "duree dans l entreprise": "duree_entreprise",
  "durée dans l'entreprise": "duree_entreprise",

  linkedinentreprise: "linkedin_entreprise",
  linkedin_entreprise: "linkedin_entreprise",
  "linkedin entreprise": "linkedin_entreprise",
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
