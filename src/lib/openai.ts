/**
 * Service Azure OpenAI — génération de textes (emails, SMS).
 * Utilisé uniquement côté serveur (API routes).
 */

const ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT!;
const API_KEY = process.env.AZURE_OPENAI_API_KEY!;
const API_VERSION = process.env.AZURE_OPENAI_API_VERSION || "2024-12-01-preview";
const DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-5.4-pro";

/** Description de Metagora pour le system prompt */
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

interface GenerateTextParams {
  /** Type de texte à générer */
  type: "email" | "sms";
  /** Contenu du template sélectionné */
  template: string;
  /** Données du contact */
  contact: {
    name: string;
    company?: string;
    jobTitle?: string;
    stage?: string;
    pipeline?: string;
  };
  /** Notes sur le deal */
  dealNotes?: string;
  /** Prompt libre de l'utilisateur */
  userPrompt?: string;
}

export async function generateText(params: GenerateTextParams): Promise<string> {
  const { type, template, contact, dealNotes, userPrompt } = params;

  const systemMessage = `Tu es l'assistant commercial de Tony chez Metagora. Tu rédiges des ${
    type === "email" ? "emails" : "SMS/messages WhatsApp"
  } de prospection.

${METAGORA_CONTEXT}

Règles de rédaction :
- Ton : poli, friendly, amical
- Tutoiement par défaut (sauf si le prompt demande le vouvoiement)
- Messages concis et percutants
- Personnalise avec les infos du contact
- ${type === "sms" ? "Format court adapté WhatsApp, pas de formalités excessives" : "Format email professionnel mais chaleureux"}
- Signe toujours "Tony" à la fin
`;

  const userMessage = `Génère un ${type === "email" ? "email" : "SMS/WhatsApp"} pour :

Contact : ${contact.name}
${contact.company ? `Entreprise : ${contact.company}` : ""}
${contact.jobTitle ? `Poste : ${contact.jobTitle}` : ""}
${contact.pipeline ? `Pipeline : ${contact.pipeline}` : ""}
${contact.stage ? `Étape : ${contact.stage}` : ""}
${dealNotes ? `Notes : ${dealNotes}` : ""}

Template de base :
${template}

${userPrompt ? `Instructions supplémentaires : ${userPrompt}` : "Adapte le template avec les infos du contact."}

Réponds UNIQUEMENT avec le texte du message, sans commentaire ni explication.`;

  const url = `${ENDPOINT}openai/deployments/${DEPLOYMENT}/chat/completions?api-version=${API_VERSION}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": API_KEY,
    },
    body: JSON.stringify({
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: userMessage },
      ],
      max_completion_tokens: 1000,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Azure OpenAI error: ${res.status} ${text}`);
  }

  const json = await res.json();
  return json.choices?.[0]?.message?.content?.trim() ?? "";
}
