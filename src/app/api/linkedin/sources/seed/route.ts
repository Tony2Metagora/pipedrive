/**
 * POST /api/linkedin/sources/seed — One-time seed of sourcing sites from the text file.
 * Idempotent: skips if sources already exist.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";
import { getSources, createSource } from "@/lib/linkedin-store";

export const dynamic = "force-dynamic";

const INITIAL_SOURCES = [
  // ── Sites Learning (theme: ia-formation) ──
  { name: "The Learning Guild", url: "https://www.learningguild.com/articles", themes: ["ia-formation"], type: "site" as const },
  { name: "Work-Learning Research", url: "https://www.worklearning.com", themes: ["ia-formation"], type: "site" as const },
  { name: "Donald H Taylor", url: "https://donaldhtaylor.wordpress.com/writing/", themes: ["ia-formation"], type: "site" as const },
  { name: "Clive Shepherd / Learnnovators", url: "https://learnnovators.com/blog/clive-shepherd-crystal-balling-with-learnnovators/", themes: ["ia-formation"], type: "site" as const },
  { name: "OpenClassrooms Talent Blog", url: "https://talents.openclassrooms.com/blog", themes: ["ia-formation"], type: "site" as const },
  { name: "Education Endowment Foundation", url: "https://educationendowmentfoundation.org.uk/news", themes: ["ia-formation"], type: "site" as const },
  { name: "Evidence Based Education", url: "https://evidencebased.education/resource/", themes: ["ia-formation"], type: "site" as const },
  { name: "Digital Learning Institute", url: "https://www.digitallearninginstitute.com/blog", themes: ["ia-formation"], type: "site" as const },
  { name: "Aurora Institute", url: "https://aurora-institute.org", themes: ["ia-formation"], type: "site" as const },
  { name: "CERPEG", url: "https://j4.cerpeg.fr/ressources-2/metier-enseignant/blog-metier-enseignant", themes: ["ia-formation"], type: "site" as const },
  // ── YouTube Learning ──
  { name: "The Learning Guild (YT)", url: "https://www.youtube.com/results?search_query=the+learning+guild+cognitive+science", themes: ["ia-formation"], type: "youtube" as const },
  { name: "Huberman Lab", url: "https://www.youtube.com/results?search_query=huberman+lab+cognition+memory", themes: ["ia-formation"], type: "youtube" as const },
  // ── Sites IA Retail (theme: ia-operationnelle + journal-ceo) ──
  { name: "Retail AI News", url: "https://www.retailnews.ai", themes: ["ia-operationnelle", "journal-ceo"], type: "site" as const },
  { name: "Retail Insight", url: "https://www.retailinsight.io/blog", themes: ["ia-operationnelle", "journal-ceo"], type: "site" as const },
  { name: "YOOBIC Blog", url: "https://yoobic.com/blog", themes: ["ia-operationnelle", "journal-ceo"], type: "site" as const },
  { name: "The Retail Exec", url: "https://theretailexec.com", themes: ["ia-operationnelle", "journal-ceo"], type: "site" as const },
  { name: "TruRating Blog", url: "https://trurating.com/blog/ai-in-retail/", themes: ["ia-operationnelle"], type: "site" as const },
  { name: "AICE", url: "https://www.aice.ai", themes: ["ia-operationnelle"], type: "site" as const },
  { name: "ActuIA", url: "https://www.actuia.com", themes: ["ia-operationnelle"], type: "site" as const },
  { name: "LSA Conso", url: "https://www.lsa-conso.fr", themes: ["journal-ceo", "ia-operationnelle"], type: "site" as const },
  { name: "FashionNetwork", url: "https://fr.fashionnetwork.com", themes: ["journal-ceo"], type: "site" as const },
  // ── YouTube IA Retail ──
  { name: "HI-GTM", url: "https://www.youtube.com/results?search_query=HI-GTM+retail+AI", themes: ["ia-operationnelle", "journal-ceo"], type: "youtube" as const },
  { name: "T-ROC Global", url: "https://www.youtube.com/results?search_query=T-ROC+AI+retail+operations", themes: ["ia-operationnelle"], type: "youtube" as const },
];

export async function POST() {
  const guard = await requireAuth("linkedin", "POST");
  if (guard.denied) return guard.denied;

  try {
    const existing = await getSources();
    if (existing.length > 0) {
      return NextResponse.json({ data: { message: `Déjà ${existing.length} sources, seed ignoré.` } });
    }

    for (const s of INITIAL_SOURCES) {
      await createSource(s);
    }

    return NextResponse.json({ data: { message: `${INITIAL_SOURCES.length} sources créées.` } });
  } catch (error) {
    console.error("POST /api/linkedin/sources/seed error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
