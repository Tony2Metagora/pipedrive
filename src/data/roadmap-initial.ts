/**
 * Données initiales de la roadmap (production interne).
 * Pas de persistance : état uniquement en mémoire côté client.
 */

export type RoadmapItemStatus = "todo" | "done";

export interface RoadmapItemData {
  id: string;
  title: string;
  status: RoadmapItemStatus;
  note?: string;
  order: number;
}

export interface RoadmapSectionData {
  id: string;
  title: string;
  order: number;
  items: RoadmapItemData[];
}

export const ROADMAP_INITIAL_SECTIONS: RoadmapSectionData[] = [
  {
    id: "scraping-dirigeants",
    title: "Scraping dirigeants de boutiques France",
    order: 1,
    items: [
      { id: "scraping-api", title: "Connecter l'API", status: "done", order: 1 },
      { id: "scraping-leads-total", title: "Récolter la totalité des leads", status: "todo", order: 2 },
      {
        id: "scraping-separer",
        title: "Séparer les dirigeants",
        status: "todo",
        order: 3,
        note: "codé mais pas finalisé / pas branché",
      },
      { id: "scraping-scoring", title: "Outil de scoring et export de leads", status: "done", order: 4 },
    ],
  },
  {
    id: "enrichissement",
    title: "Enrichissement contacts",
    order: 2,
    items: [
      { id: "enrich-dropcontact", title: "Mail / tel via Dropcontact", status: "done", order: 1 },
      { id: "enrich-cascade", title: "Créer la cascade d'enrichissement", status: "todo", order: 2 },
    ],
  },
  {
    id: "contextualisation",
    title: "Contextualisation",
    order: 3,
    items: [
      { id: "ctx-linkedin", title: "API enrichissement infos LinkedIn", status: "todo", order: 1 },
      { id: "ctx-personne", title: "API infos personne (actu, origine école, etc.)", status: "todo", order: 2 },
      { id: "ctx-maps", title: "API Google Maps boîte concurrente", status: "todo", order: 3 },
    ],
  },
  {
    id: "outbound",
    title: "Outbound",
    order: 4,
    items: [
      { id: "out-sequences", title: "Générer les séquences mail", status: "done", order: 1 },
      {
        id: "out-csv-mini",
        title: "Séparer un CSV en mini CSV pour envois par dizaine (limite 10 mails/semaine)",
        status: "todo",
        order: 2,
      },
      { id: "out-audio-ia", title: "Outil audio IA", status: "todo", order: 3 },
      { id: "out-twilio", title: "Outil API d'appel Twilio Phone", status: "todo", order: 4 },
    ],
  },
  {
    id: "landing-estimateur",
    title: "Landing estimateur de renta",
    order: 5,
    items: [
      { id: "land-gen", title: "Générer la landing", status: "done", order: 1 },
      { id: "land-template", title: "Générer un template estimateur", status: "todo", order: 2 },
    ],
  },
];
