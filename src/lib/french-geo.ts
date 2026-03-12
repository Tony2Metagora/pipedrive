/**
 * French geography utilities — city → postal code + region mapping.
 * Covers ~250 main cities that appear in LinkedIn profiles.
 * Also parses LinkedIn-style location strings like "Paris, Île-de-France, France".
 */

// ─── City database: city_lowercase → { cp, region } ─────

interface CityInfo {
  cp: string;
  region: string;
}

const CITIES: Record<string, CityInfo> = {
  // Île-de-France
  paris: { cp: "75000", region: "Île-de-France" },
  boulogne: { cp: "92100", region: "Île-de-France" },
  "boulogne-billancourt": { cp: "92100", region: "Île-de-France" },
  "saint-denis": { cp: "93200", region: "Île-de-France" },
  "st-denis": { cp: "93200", region: "Île-de-France" },
  montreuil: { cp: "93100", region: "Île-de-France" },
  nanterre: { cp: "92000", region: "Île-de-France" },
  "créteil": { cp: "94000", region: "Île-de-France" },
  creteil: { cp: "94000", region: "Île-de-France" },
  versailles: { cp: "78000", region: "Île-de-France" },
  "saint-ouen": { cp: "93400", region: "Île-de-France" },
  "st.-ouen": { cp: "93400", region: "Île-de-France" },
  "st-ouen": { cp: "93400", region: "Île-de-France" },
  levallois: { cp: "92300", region: "Île-de-France" },
  "levallois-perret": { cp: "92300", region: "Île-de-France" },
  neuilly: { cp: "92200", region: "Île-de-France" },
  "neuilly-sur-seine": { cp: "92200", region: "Île-de-France" },
  issy: { cp: "92130", region: "Île-de-France" },
  "issy-les-moulineaux": { cp: "92130", region: "Île-de-France" },
  "courbevoie": { cp: "92400", region: "Île-de-France" },
  "la défense": { cp: "92800", region: "Île-de-France" },
  "la defense": { cp: "92800", region: "Île-de-France" },
  puteaux: { cp: "92800", region: "Île-de-France" },
  clichy: { cp: "92110", region: "Île-de-France" },
  "saint-cloud": { cp: "92210", region: "Île-de-France" },
  vincennes: { cp: "94300", region: "Île-de-France" },
  "ivry-sur-seine": { cp: "94200", region: "Île-de-France" },
  "vitry-sur-seine": { cp: "94400", region: "Île-de-France" },
  pantin: { cp: "93500", region: "Île-de-France" },
  bobigny: { cp: "93000", region: "Île-de-France" },
  colombes: { cp: "92700", region: "Île-de-France" },
  "rueil-malmaison": { cp: "92500", region: "Île-de-France" },
  "massy": { cp: "91300", region: "Île-de-France" },
  evry: { cp: "91000", region: "Île-de-France" },
  "évry": { cp: "91000", region: "Île-de-France" },
  "cergy": { cp: "95000", region: "Île-de-France" },
  "cergy-pontoise": { cp: "95000", region: "Île-de-France" },
  "meaux": { cp: "77100", region: "Île-de-France" },
  "melun": { cp: "77000", region: "Île-de-France" },
  "fontainebleau": { cp: "77300", region: "Île-de-France" },
  "saint-germain-en-laye": { cp: "78100", region: "Île-de-France" },
  "bussy-saint-georges": { cp: "77600", region: "Île-de-France" },
  "noisy-le-grand": { cp: "93160", region: "Île-de-France" },
  "marne-la-vallée": { cp: "77420", region: "Île-de-France" },
  "roissy": { cp: "95700", region: "Île-de-France" },
  "suresnes": { cp: "92150", region: "Île-de-France" },
  "clamart": { cp: "92140", region: "Île-de-France" },
  "chatillon": { cp: "92320", region: "Île-de-France" },
  "malakoff": { cp: "92240", region: "Île-de-France" },
  "montrouge": { cp: "92120", region: "Île-de-France" },
  "gentilly": { cp: "94250", region: "Île-de-France" },

  // Hauts-de-France
  lille: { cp: "59000", region: "Hauts-de-France" },
  roubaix: { cp: "59100", region: "Hauts-de-France" },
  tourcoing: { cp: "59200", region: "Hauts-de-France" },
  amiens: { cp: "80000", region: "Hauts-de-France" },
  dunkerque: { cp: "59140", region: "Hauts-de-France" },
  calais: { cp: "62100", region: "Hauts-de-France" },
  valenciennes: { cp: "59300", region: "Hauts-de-France" },
  lens: { cp: "62300", region: "Hauts-de-France" },
  "boulogne-sur-mer": { cp: "62200", region: "Hauts-de-France" },
  beauvais: { cp: "60000", region: "Hauts-de-France" },
  "saint-quentin": { cp: "02100", region: "Hauts-de-France" },
  compiègne: { cp: "60200", region: "Hauts-de-France" },
  compiegne: { cp: "60200", region: "Hauts-de-France" },
  arras: { cp: "62000", region: "Hauts-de-France" },
  douai: { cp: "59500", region: "Hauts-de-France" },
  cambrai: { cp: "59400", region: "Hauts-de-France" },
  laon: { cp: "02000", region: "Hauts-de-France" },
  creil: { cp: "60100", region: "Hauts-de-France" },
  soissons: { cp: "02200", region: "Hauts-de-France" },
  maubeuge: { cp: "59600", region: "Hauts-de-France" },

  // Auvergne-Rhône-Alpes
  lyon: { cp: "69000", region: "Auvergne-Rhône-Alpes" },
  "saint-étienne": { cp: "42000", region: "Auvergne-Rhône-Alpes" },
  "saint-etienne": { cp: "42000", region: "Auvergne-Rhône-Alpes" },
  grenoble: { cp: "38000", region: "Auvergne-Rhône-Alpes" },
  "clermont-ferrand": { cp: "63000", region: "Auvergne-Rhône-Alpes" },
  villeurbanne: { cp: "69100", region: "Auvergne-Rhône-Alpes" },
  annecy: { cp: "74000", region: "Auvergne-Rhône-Alpes" },
  "chambéry": { cp: "73000", region: "Auvergne-Rhône-Alpes" },
  chambery: { cp: "73000", region: "Auvergne-Rhône-Alpes" },
  valence: { cp: "26000", region: "Auvergne-Rhône-Alpes" },
  "bourg-en-bresse": { cp: "01000", region: "Auvergne-Rhône-Alpes" },
  "le puy-en-velay": { cp: "43000", region: "Auvergne-Rhône-Alpes" },
  roanne: { cp: "42300", region: "Auvergne-Rhône-Alpes" },
  aurillac: { cp: "15000", region: "Auvergne-Rhône-Alpes" },
  moulins: { cp: "03000", region: "Auvergne-Rhône-Alpes" },
  vichy: { cp: "03200", region: "Auvergne-Rhône-Alpes" },
  montluçon: { cp: "03100", region: "Auvergne-Rhône-Alpes" },
  montlucon: { cp: "03100", region: "Auvergne-Rhône-Alpes" },
  "vénissieux": { cp: "69200", region: "Auvergne-Rhône-Alpes" },
  venissieux: { cp: "69200", region: "Auvergne-Rhône-Alpes" },
  "villefranche-sur-saône": { cp: "69400", region: "Auvergne-Rhône-Alpes" },

  // Provence-Alpes-Côte d'Azur
  marseille: { cp: "13000", region: "Provence-Alpes-Côte d'Azur" },
  nice: { cp: "06000", region: "Provence-Alpes-Côte d'Azur" },
  toulon: { cp: "83000", region: "Provence-Alpes-Côte d'Azur" },
  "aix-en-provence": { cp: "13100", region: "Provence-Alpes-Côte d'Azur" },
  avignon: { cp: "84000", region: "Provence-Alpes-Côte d'Azur" },
  cannes: { cp: "06400", region: "Provence-Alpes-Côte d'Azur" },
  antibes: { cp: "06600", region: "Provence-Alpes-Côte d'Azur" },
  fréjus: { cp: "83600", region: "Provence-Alpes-Côte d'Azur" },
  frejus: { cp: "83600", region: "Provence-Alpes-Côte d'Azur" },
  gap: { cp: "05000", region: "Provence-Alpes-Côte d'Azur" },
  arles: { cp: "13200", region: "Provence-Alpes-Côte d'Azur" },
  grasse: { cp: "06130", region: "Provence-Alpes-Côte d'Azur" },
  "salon-de-provence": { cp: "13300", region: "Provence-Alpes-Côte d'Azur" },
  "la seyne-sur-mer": { cp: "83500", region: "Provence-Alpes-Côte d'Azur" },
  digne: { cp: "04000", region: "Provence-Alpes-Côte d'Azur" },
  sophia: { cp: "06560", region: "Provence-Alpes-Côte d'Azur" },
  "sophia antipolis": { cp: "06560", region: "Provence-Alpes-Côte d'Azur" },

  // Nouvelle-Aquitaine
  bordeaux: { cp: "33000", region: "Nouvelle-Aquitaine" },
  limoges: { cp: "87000", region: "Nouvelle-Aquitaine" },
  poitiers: { cp: "86000", region: "Nouvelle-Aquitaine" },
  pau: { cp: "64000", region: "Nouvelle-Aquitaine" },
  "la rochelle": { cp: "17000", region: "Nouvelle-Aquitaine" },
  bayonne: { cp: "64100", region: "Nouvelle-Aquitaine" },
  biarritz: { cp: "64200", region: "Nouvelle-Aquitaine" },
  angoulême: { cp: "16000", region: "Nouvelle-Aquitaine" },
  angouleme: { cp: "16000", region: "Nouvelle-Aquitaine" },
  périgueux: { cp: "24000", region: "Nouvelle-Aquitaine" },
  perigueux: { cp: "24000", region: "Nouvelle-Aquitaine" },
  agen: { cp: "47000", region: "Nouvelle-Aquitaine" },
  niort: { cp: "79000", region: "Nouvelle-Aquitaine" },
  "mont-de-marsan": { cp: "40000", region: "Nouvelle-Aquitaine" },
  brive: { cp: "19100", region: "Nouvelle-Aquitaine" },
  "brive-la-gaillarde": { cp: "19100", region: "Nouvelle-Aquitaine" },
  mérignac: { cp: "33700", region: "Nouvelle-Aquitaine" },
  merignac: { cp: "33700", region: "Nouvelle-Aquitaine" },
  pessac: { cp: "33600", region: "Nouvelle-Aquitaine" },
  guéret: { cp: "23000", region: "Nouvelle-Aquitaine" },
  tulle: { cp: "19000", region: "Nouvelle-Aquitaine" },

  // Occitanie
  toulouse: { cp: "31000", region: "Occitanie" },
  montpellier: { cp: "34000", region: "Occitanie" },
  nîmes: { cp: "30000", region: "Occitanie" },
  nimes: { cp: "30000", region: "Occitanie" },
  perpignan: { cp: "66000", region: "Occitanie" },
  béziers: { cp: "34500", region: "Occitanie" },
  beziers: { cp: "34500", region: "Occitanie" },
  narbonne: { cp: "11100", region: "Occitanie" },
  albi: { cp: "81000", region: "Occitanie" },
  castres: { cp: "81100", region: "Occitanie" },
  tarbes: { cp: "65000", region: "Occitanie" },
  carcassonne: { cp: "11000", region: "Occitanie" },
  rodez: { cp: "12000", region: "Occitanie" },
  auch: { cp: "32000", region: "Occitanie" },
  cahors: { cp: "46000", region: "Occitanie" },
  montauban: { cp: "82000", region: "Occitanie" },
  sète: { cp: "34200", region: "Occitanie" },
  sete: { cp: "34200", region: "Occitanie" },
  "lourdes": { cp: "65100", region: "Occitanie" },
  foix: { cp: "09000", region: "Occitanie" },
  mende: { cp: "48000", region: "Occitanie" },

  // Grand Est
  strasbourg: { cp: "67000", region: "Grand Est" },
  reims: { cp: "51100", region: "Grand Est" },
  metz: { cp: "57000", region: "Grand Est" },
  mulhouse: { cp: "68100", region: "Grand Est" },
  nancy: { cp: "54000", region: "Grand Est" },
  colmar: { cp: "68000", region: "Grand Est" },
  troyes: { cp: "10000", region: "Grand Est" },
  "charleville-mézières": { cp: "08000", region: "Grand Est" },
  "charleville-mezieres": { cp: "08000", region: "Grand Est" },
  châlons: { cp: "51000", region: "Grand Est" },
  chalons: { cp: "51000", region: "Grand Est" },
  épinal: { cp: "88000", region: "Grand Est" },
  epinal: { cp: "88000", region: "Grand Est" },
  thionville: { cp: "57100", region: "Grand Est" },
  haguenau: { cp: "67500", region: "Grand Est" },
  sélestat: { cp: "67600", region: "Grand Est" },
  schiltigheim: { cp: "67300", region: "Grand Est" },
  "mittelbergheim": { cp: "67140", region: "Grand Est" },
  illkirch: { cp: "67400", region: "Grand Est" },

  // Pays de la Loire
  nantes: { cp: "44000", region: "Pays de la Loire" },
  angers: { cp: "49000", region: "Pays de la Loire" },
  "le mans": { cp: "72000", region: "Pays de la Loire" },
  "saint-nazaire": { cp: "44600", region: "Pays de la Loire" },
  "la roche-sur-yon": { cp: "85000", region: "Pays de la Loire" },
  cholet: { cp: "49300", region: "Pays de la Loire" },
  laval: { cp: "53000", region: "Pays de la Loire" },
  saumur: { cp: "49400", region: "Pays de la Loire" },

  // Bretagne
  rennes: { cp: "35000", region: "Bretagne" },
  brest: { cp: "29200", region: "Bretagne" },
  quimper: { cp: "29000", region: "Bretagne" },
  lorient: { cp: "56100", region: "Bretagne" },
  vannes: { cp: "56000", region: "Bretagne" },
  "saint-brieuc": { cp: "22000", region: "Bretagne" },
  "saint-malo": { cp: "35400", region: "Bretagne" },
  lannion: { cp: "22300", region: "Bretagne" },

  // Normandie
  rouen: { cp: "76000", region: "Normandie" },
  "le havre": { cp: "76600", region: "Normandie" },
  caen: { cp: "14000", region: "Normandie" },
  cherbourg: { cp: "50100", region: "Normandie" },
  évreux: { cp: "27000", region: "Normandie" },
  evreux: { cp: "27000", region: "Normandie" },
  dieppe: { cp: "76200", region: "Normandie" },
  alençon: { cp: "61000", region: "Normandie" },
  alencon: { cp: "61000", region: "Normandie" },
  lisieux: { cp: "14100", region: "Normandie" },

  // Centre-Val de Loire
  tours: { cp: "37000", region: "Centre-Val de Loire" },
  orléans: { cp: "45000", region: "Centre-Val de Loire" },
  orleans: { cp: "45000", region: "Centre-Val de Loire" },
  bourges: { cp: "18000", region: "Centre-Val de Loire" },
  blois: { cp: "41000", region: "Centre-Val de Loire" },
  chartres: { cp: "28000", region: "Centre-Val de Loire" },
  châteauroux: { cp: "36000", region: "Centre-Val de Loire" },
  chateauroux: { cp: "36000", region: "Centre-Val de Loire" },
  dreux: { cp: "28100", region: "Centre-Val de Loire" },

  // Bourgogne-Franche-Comté
  dijon: { cp: "21000", region: "Bourgogne-Franche-Comté" },
  besançon: { cp: "25000", region: "Bourgogne-Franche-Comté" },
  besancon: { cp: "25000", region: "Bourgogne-Franche-Comté" },
  belfort: { cp: "90000", region: "Bourgogne-Franche-Comté" },
  auxerre: { cp: "89000", region: "Bourgogne-Franche-Comté" },
  chalon: { cp: "71100", region: "Bourgogne-Franche-Comté" },
  "chalon-sur-saône": { cp: "71100", region: "Bourgogne-Franche-Comté" },
  nevers: { cp: "58000", region: "Bourgogne-Franche-Comté" },
  mâcon: { cp: "71000", region: "Bourgogne-Franche-Comté" },
  macon: { cp: "71000", region: "Bourgogne-Franche-Comté" },
  "le creusot": { cp: "71200", region: "Bourgogne-Franche-Comté" },
  montbéliard: { cp: "25200", region: "Bourgogne-Franche-Comté" },
  montbeliard: { cp: "25200", region: "Bourgogne-Franche-Comté" },

  // Corse
  ajaccio: { cp: "20000", region: "Corse" },
  bastia: { cp: "20200", region: "Corse" },

  // DOM-TOM
  "fort-de-france": { cp: "97200", region: "Martinique" },
  "pointe-à-pitre": { cp: "97110", region: "Guadeloupe" },
  cayenne: { cp: "97300", region: "Guyane" },
  "saint-denis de la réunion": { cp: "97400", region: "La Réunion" },
};

// ─── Region aliases from LinkedIn format ─────────────────

const REGION_ALIASES: Record<string, string> = {
  "île-de-france": "Île-de-France",
  "ile-de-france": "Île-de-France",
  "ile de france": "Île-de-France",
  "hauts-de-france": "Hauts-de-France",
  "auvergne-rhône-alpes": "Auvergne-Rhône-Alpes",
  "auvergne-rhone-alpes": "Auvergne-Rhône-Alpes",
  "provence-alpes-côte d'azur": "Provence-Alpes-Côte d'Azur",
  "provence-alpes-cote d'azur": "Provence-Alpes-Côte d'Azur",
  "paca": "Provence-Alpes-Côte d'Azur",
  "nouvelle-aquitaine": "Nouvelle-Aquitaine",
  "occitanie": "Occitanie",
  "grand est": "Grand Est",
  "pays de la loire": "Pays de la Loire",
  "bretagne": "Bretagne",
  "normandie": "Normandie",
  "centre-val de loire": "Centre-Val de Loire",
  "bourgogne-franche-comté": "Bourgogne-Franche-Comté",
  "bourgogne-franche-comte": "Bourgogne-Franche-Comté",
  "corse": "Corse",
  "martinique": "Martinique",
  "guadeloupe": "Guadeloupe",
  "guyane": "Guyane",
  "la réunion": "La Réunion",
  "la reunion": "La Réunion",
  "mayotte": "Mayotte",
};

// ─── Public API ──────────────────────────────────────────

export interface GeoResult {
  city?: string;
  postal_code?: string;
  region?: string;
}

/**
 * Parse a LinkedIn-style location string and extract city, postal code, region.
 * Examples:
 *   "Paris, Île-de-France, France" → { city: "Paris", postal_code: "75000", region: "Île-de-France" }
 *   "Lille, Hauts-de-France, France" → { city: "Lille", postal_code: "59000", region: "Hauts-de-France" }
 *   "France" → { region: undefined } (too vague)
 *   "Greater Strasbourg Metropolitan Area" → { city: "Strasbourg", postal_code: "67000", region: "Grand Est" }
 */
export function parseLocation(location: string): GeoResult {
  if (!location?.trim()) return {};
  const raw = location.trim();

  // Split by comma: "City, Region, Country" or "Region, Country" or just "Country"
  const parts = raw.split(",").map(s => s.trim()).filter(Boolean);

  const result: GeoResult = {};

  // Try to find region from any part
  for (const part of parts) {
    const norm = part.toLowerCase();
    if (REGION_ALIASES[norm]) {
      result.region = REGION_ALIASES[norm];
    }
  }

  // Try to find city from first part
  if (parts.length >= 1) {
    let cityCandidate = parts[0].toLowerCase();

    // Handle "Greater X Metropolitan Area" / "Greater X Area"
    const greaterMatch = cityCandidate.match(/^greater\s+(.+?)\s+(metropolitan\s+)?area$/i);
    if (greaterMatch) {
      cityCandidate = greaterMatch[1].toLowerCase().trim();
    }

    const cityInfo = CITIES[cityCandidate];
    if (cityInfo) {
      result.city = parts[0].replace(/^greater\s+/i, "").replace(/\s*(metropolitan\s+)?area$/i, "").trim();
      result.postal_code = cityInfo.cp;
      if (!result.region) result.region = cityInfo.region;
    }
  }

  // If no region found yet, try city lookup from any part
  if (!result.region) {
    for (const part of parts) {
      const norm = part.toLowerCase().trim();
      if (CITIES[norm]) {
        result.region = CITIES[norm].region;
        if (!result.city) {
          result.city = part.trim();
          result.postal_code = CITIES[norm].cp;
        }
        break;
      }
    }
  }

  return result;
}

/**
 * Extract just the normalized region from a location string.
 */
export function extractRegion(location: string): string | undefined {
  return parseLocation(location).region;
}

/**
 * Extract postal code from a location string (via city lookup).
 */
export function extractPostalCode(location: string): string | undefined {
  return parseLocation(location).postal_code;
}
