import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";
import { askAzureFast } from "@/lib/azure-ai";
import { listCampaigns, getSequences } from "@/lib/smartlead";

const COLD_EMAIL_BEST_PRACTICES = `
## Cold Email Best Practices (Excelr8 / Yves Mimeran)

### Email Length & Style
- 50-125 words max (75-100 mots = 51% reply rate)
- Niveau de lecture 3ème (simple, pas de jargon)
- Texte plain — pas d'images ni HTML lourd en cold email
- Ton : poli, professionnel mais chaleureux, pas vendeur
- Vouvoiement (français B2B professionnel)

### Subject Line
- 5-10 mots, minuscules, ton neutre
- Personnaliser avec nom ou entreprise (+26-50% open rate)
- Éviter : "Urgent", "Offre", "Gratuit", points d'exclamation, CAPS
- Formules : question, connexion mutuelle, valeur spécifique, actualité

### Structure (Frameworks)
- AIDA : Attention → Intérêt → Désir → Action
- PAS : Problème → Agiter → Solution  
- BAB : Avant → Après → Pont
- 3C (Alex Berman) : Compliment → Case Study → CTA

### Personnalisation (3 niveaux)
- Basique : prénom, entreprise, poste
- Contextuel : actualité entreprise, contenu LinkedIn, techno utilisée
- Hyper-perso : pain point spécifique au rôle + secteur, first line custom

### CTA (Call to Action)
- UN SEUL CTA par email (+371% performance)
- Friction basse : "Un créneau de 15 min cette semaine ?"
- Éviter : liens multiples, pièces jointes, demandes trop engageantes

### Séquence recommandée
- Email 1 (J1) : Introduction — first line perso, proposition de valeur, CTA doux
- Email 2 (J3-4) : Relance douce — même thread, plus court, angle différent
- Email 3 (J7-10) : Nouvelle valeur — ressource, case study, insight
- Email 4 (J14-18) : Preuve sociale — résultat client similaire
- Email 5 (J21-30) : Breakup — "je ne vous recontacterai pas, bonne continuation"

### Timing
- Meilleurs jours : Mardi, Mercredi, Jeudi
- Meilleure heure : 10h-14h heure locale
- Espacement : 3 jours pour relance 1, puis 5-7 jours entre les suivantes
`;

const METAGORA_CONTEXT = `
Metagora est une startup française spécialisée dans la formation commerciale immersive par l'IA.

Notre solution permet aux conseillers de vente de s'entraîner avec des clients virtuels ultra-réalistes, 
disponibles 24/7, dans un environnement 3D immersif. L'IA conversationnelle simule des interactions 
client réalistes avec personnalités, objections et comportements adaptés au secteur du client.

Points clés :
- +30% de performance commerciale prouvée
- 100% de taux de complétion des parcours
- Déploiement en 1 jour
- Personnalisation totale (scénarios, avatars, environnements 3D aux couleurs de la marque)
- Intégration possible avec Yoobic, LMS existants
- Nouveau produit : Coach virtuel IA pour feedback personnalisé aux vendeurs et managers
- Clients : Hermès, Guerlain, Make Up For Ever, LVMH, et autres grandes maisons du luxe et du retail

Secteurs cibles : Luxe, Retail, Beauty, Fashion, Hospitality.
Site web : metagora.tech
`;

/** POST /api/sequences/generate-emails */
export async function POST(request: Request) {
  const guard = await requireAuth("sequences" as never, "POST");
  if (guard.denied) return guard.denied;

  try {
    const body = await request.json();
    const {
      campaignName,
      leadOrigin,
      leadProfile,
      campaignGoal,
      tone,
      language,
      senderName,
      existingSequences,
      emailCount: rawEmailCount,
      emailPrompts,
      memoryContext,
    } = body as {
      campaignName: string;
      leadOrigin: string;
      leadProfile: string;
      campaignGoal: string;
      tone?: string;
      language?: string;
      senderName?: string;
      existingSequences?: { campaignName: string; sequences: { subject: string; email_body: string; seq_number: number }[] }[];
      emailCount?: number;
      emailPrompts?: string[];
      memoryContext?: string;
    };

    const emailCount = Math.min(Math.max(rawEmailCount || 3, 1), 7);

    if (!campaignGoal) {
      return NextResponse.json({ error: "Le but de la campagne est requis" }, { status: 400 });
    }

    // Fetch other campaigns' sequences for reference if not provided
    let refSequences = existingSequences || [];
    if (!refSequences.length) {
      try {
        const campaigns = await listCampaigns() as { id: number; name: string }[];
        const top3 = campaigns.slice(0, 3);
        for (const c of top3) {
          try {
            const seqs = await getSequences(c.id) as { seq_number: number; subject: string; email_body: string }[];
            if (seqs?.length) {
              refSequences.push({ campaignName: c.name, sequences: seqs.map((s) => ({ subject: s.subject, email_body: s.email_body?.slice(0, 300) || "", seq_number: s.seq_number })) });
            }
          } catch { /* skip */ }
        }
      } catch { /* skip */ }
    }

    const refContext = refSequences.length > 0
      ? `\n## Exemples de séquences existantes (autres campagnes)\n${refSequences.map((r) =>
          `### Campagne : ${r.campaignName}\n${r.sequences.map((s) => `- Email ${s.seq_number}: Sujet="${s.subject}" | Corps (extrait): ${s.email_body?.slice(0, 200)}...`).join("\n")}`
        ).join("\n\n")}`
      : "";

    // Default descriptions per position
    const defaultEmailDescriptions: Record<number, string> = {
      1: "Introduction — first line personnalisée, proposition de valeur, CTA doux",
      2: "Relance douce — même thread, plus court, angle différent ou question",
      3: "Valeur ajoutée — case study, insight, preuve sociale",
      4: "Relance plus directe — urgence légère ou nouvelle valeur",
      5: "Breakup — dernière tentative de contact, ton amical, bonne continuation",
    };
    const defaultDelays = [0, 3, 7, 14, 21, 28, 35];

    // ─── Generate each email INDIVIDUALLY (1 AI call per email) ───
    // This guarantees each user prompt is strictly respected
    const generatedEmails: { seq_number: number; delay_days: number; subject: string; body: string }[] = [];

    for (let i = 0; i < emailCount; i++) {
      const userPromptForEmail = emailPrompts?.[i]?.trim();
      const defaultDesc = defaultEmailDescriptions[i + 1] || `Email de relance #${i + 1}`;
      const emailInstruction = userPromptForEmail || defaultDesc;
      const delayDays = defaultDelays[i] || (i * 5);

      // Build context of previously generated emails for coherence
      const previousEmailsContext = generatedEmails.length > 0
        ? `\n## Emails précédents déjà générés (pour cohérence, ne pas répéter)\n${generatedEmails.map((e) =>
            `- Email ${e.seq_number} (J+${e.delay_days}): Sujet="${e.subject}" | Corps: ${e.body.slice(0, 200)}...`
          ).join("\n")}`
        : "";

      const systemPrompt = `Tu es un expert en cold emailing B2B pour Metagora. Tu génères UN SEUL email de prospection (email ${i + 1}/${emailCount} de la séquence).

${METAGORA_CONTEXT}

${COLD_EMAIL_BEST_PRACTICES}

## Règles STRICTES pour cet email
- Génère EXACTEMENT 1 email : le numéro ${i + 1} de la séquence
- **INSTRUCTION SPÉCIFIQUE pour cet email : ${emailInstruction}**
- Tu DOIS respecter cette instruction à la lettre. C'est ta directive principale.
- Utilise les variables Smartlead : {{first_name}}, {{last_name}}, {{company_name}}
- Signe "${senderName || "Tony"}" à la fin
- Ton : ${tone || "professionnel mais chaleureux, vouvoiement"}
- Langue : ${language || "français"}
- 50-125 mots MAX
- UN SEUL CTA
- Sujet : 5-10 mots, minuscules
${memoryContext || ""}
${previousEmailsContext}
${refContext}

- Format de réponse STRICT (JSON) :

\`\`\`json
{ "seq_number": ${i + 1}, "delay_days": ${delayDays}, "subject": "...", "body": "..." }
\`\`\`

Réponds UNIQUEMENT avec le JSON, sans commentaire.`;

      const userPrompt = `Génère l'email ${i + 1}/${emailCount} pour cette campagne :

**Nom campagne :** ${campaignName || "Nouvelle campagne"}
**Origine des leads :** ${leadOrigin || "Non précisé"}
**Profil des leads :** ${leadProfile || "Non précisé"}
**But de la campagne :** ${campaignGoal}

**INSTRUCTION pour cet email :** ${emailInstruction}

Génère cet email maintenant.`;

      const response = await askAzureFast([
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ], 1500);

      // Parse JSON from response
      let emailObj;
      try {
        const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, response];
        emailObj = JSON.parse(jsonMatch[1]!.trim());
      } catch {
        try {
          emailObj = JSON.parse(response);
        } catch {
          console.error(`[generate-emails] Failed to parse email ${i + 1}:`, response);
          return NextResponse.json({
            error: `L'IA n'a pas retourné un JSON valide pour l'email ${i + 1}. Réessayez.`,
            raw: response,
            partialEmails: generatedEmails,
          }, { status: 500 });
        }
      }

      generatedEmails.push({
        seq_number: emailObj.seq_number || (i + 1),
        delay_days: emailObj.delay_days ?? delayDays,
        subject: emailObj.subject || "",
        body: emailObj.body || "",
      });
    }

    return NextResponse.json({ success: true, emails: generatedEmails });
  } catch (error) {
    console.error("Generate emails error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
