import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";
import { askAzureFast } from "@/lib/azure-ai";

/** POST /api/sequences/rewrite-email — Rewrite a single email via GPT-5.2 */
export async function POST(request: Request) {
  const guard = await requireAuth("sequences" as never, "POST");
  if (guard.denied) return guard.denied;

  try {
    const { subject, body, instruction, campaignGoal, tone, memoryContext } = await request.json();

    if (!body && !subject) {
      return NextResponse.json({ error: "Email vide" }, { status: 400 });
    }

    const systemPrompt = `Tu es un expert en cold emailing B2B. Tu réécrits des emails de prospection.

Règles :
- 50-125 mots max
- Ton : ${tone || "professionnel mais chaleureux, tutoiement"}
- Sujet : 5-10 mots, minuscules, pas de ponctuation excessive
- UN SEUL CTA par email
- Garde les variables Smartlead : {{first_name}}, {{last_name}}, {{company_name}}
- Texte plain, pas d'HTML
${campaignGoal ? `- But de la campagne : ${campaignGoal}` : ""}
${memoryContext || ""}

Réponds UNIQUEMENT en JSON :
\`\`\`json
{ "subject": "...", "body": "..." }
\`\`\``;

    const userPrompt = `Voici l'email actuel :

**Sujet :** ${subject || "(aucun)"}
**Corps :**
${body || "(vide)"}

**Instruction de modification :** ${instruction || "Améliore cet email pour le rendre plus percutant et augmenter le taux de réponse."}

Réécris l'email en suivant l'instruction.`;

    const response = await askAzureFast([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ], 1500);

    let parsed;
    try {
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, response];
      parsed = JSON.parse(jsonMatch[1]!.trim());
    } catch {
      try {
        parsed = JSON.parse(response);
      } catch {
        return NextResponse.json({ error: "L'IA n'a pas retourné un JSON valide", raw: response }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, ...parsed });
  } catch (error) {
    console.error("Rewrite email error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
