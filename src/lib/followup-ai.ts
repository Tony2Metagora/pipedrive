import { askAzureFast } from "@/lib/azure-ai";
import { getActivitiesForDeal, getDeal, getNotesForDeal, getPersons } from "@/lib/blob-store";

interface GmailMessage {
  id: string;
}

interface GmailMessageDetail {
  snippet: string;
  payload: {
    headers: { name: string; value: string }[];
    parts?: { mimeType: string; body: { data?: string } }[];
    body?: { data?: string };
  };
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return Buffer.from(base64, "base64").toString("utf-8");
  } catch {
    return "";
  }
}

function extractTextBody(payload: GmailMessageDetail["payload"]): string {
  if (payload.parts) {
    const textPart = payload.parts.find((p) => p.mimeType === "text/plain");
    if (textPart?.body?.data) return decodeBase64Url(textPart.body.data);
  }
  if (payload.body?.data) return decodeBase64Url(payload.body.data);
  return "";
}

function header(headers: { name: string; value: string }[], name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
}

function normalizeTemplateTokens(text: string): string {
  return (text || "")
    .replace(/\{\s*pr[ée]nom\s*\}/gi, "{{prenom}}")
    .replace(/\{\{\s*pr[ée]nom\s*\}\}/gi, "{{prenom}}")
    .replace(/\{\s*entreprise\s*\}/gi, "{{entreprise}}")
    .replace(/\{\{\s*entreprise\s*\}\}/gi, "{{entreprise}}");
}

function ensureBonjourPrenom(body: string): string {
  const cleaned = normalizeTemplateTokens((body || "").replace(/\r/g, "").trim());
  const wanted = "Bonjour {{prenom}},";
  if (!cleaned) return `${wanted}\n\nJe me permets de revenir vers vous.\n\nTony`;

  if (/^bonjour\b/i.test(cleaned)) {
    const withoutFirstLine = cleaned.replace(/^bonjour[^\n]*\n*/i, "").trimStart();
    return `${wanted}\n\n${withoutFirstLine}`.trim();
  }

  return `${wanted}\n\n${cleaned}`.trim();
}

export async function loadThreadContextForLead(accessToken: string, email: string): Promise<string> {
  const query = encodeURIComponent(`from:${email} OR to:${email}`);
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=6`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!listRes.ok) return "Aucun email Gmail lisible.";
  const listJson = (await listRes.json().catch(() => ({}))) as { messages?: GmailMessage[] };
  const messages = listJson.messages || [];
  if (!messages.length) return "Aucun email trouve avec ce lead.";

  const details = await Promise.all(
    messages.slice(0, 4).map(async (msg) => {
      const detailRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!detailRes.ok) return null;
      const detail = (await detailRes.json()) as GmailMessageDetail;
      const h = detail.payload?.headers || [];
      const body = extractTextBody(detail.payload);
      return {
        from: header(h, "From"),
        to: header(h, "To"),
        subject: header(h, "Subject"),
        date: header(h, "Date"),
        body: (body || detail.snippet || "").slice(0, 1300),
      };
    })
  );

  const valid = details.filter(Boolean);
  if (!valid.length) return "Emails trouves mais non lisibles.";
  return valid
    .map((e, i) => {
      const v = e!;
      return `Email ${i + 1}\nDe: ${v.from}\nA: ${v.to}\nSujet: ${v.subject}\nDate: ${v.date}\n${v.body}`;
    })
    .join("\n\n---\n\n");
}

export async function loadDealContextForLead(
  leadEmail: string,
  dealId?: number | null
): Promise<{ dealId: number | null; context: string }> {
  const persons = await getPersons();
  const person = persons.find((p) => p.email?.some((e) => e.value?.toLowerCase() === leadEmail.toLowerCase()));
  const effectiveDealId = dealId ?? null;

  if (!effectiveDealId) {
    return {
      dealId: null,
      context: person
        ? `Contact connu: ${person.name} (${person.job_title || "poste non renseigne"})`
        : "Aucun contexte affaire trouve.",
    };
  }

  const [deal, notes, activities] = await Promise.all([
    getDeal(effectiveDealId),
    getNotesForDeal(effectiveDealId),
    getActivitiesForDeal(effectiveDealId),
  ]);

  if (!deal) {
    return { dealId: effectiveDealId, context: "Aucune affaire trouvee pour cet ID." };
  }

  const notesText = notes.slice(-3).map((n) => `- ${n.content.slice(0, 200)}`).join("\n") || "- aucune note";
  const activitiesText =
    activities
      .slice(-3)
      .map((a) => `- ${a.type}: ${a.subject} (${a.due_date || "date n/a"})`)
      .join("\n") || "- aucune activite";

  return {
    dealId: effectiveDealId,
    context: [
      `Affaire: ${deal.title}`,
      `Pipeline: ${deal.pipeline_id}, Stage: ${deal.stage_id}, Statut: ${deal.status}`,
      `Valeur: ${deal.value} ${deal.currency || ""}`,
      "Notes recentes:",
      notesText,
      "Activites recentes:",
      activitiesText,
    ].join("\n"),
  };
}

export async function generateFollowupDraft(input: {
  leadName?: string;
  leadEmail: string;
  company?: string;
  threadContext: string;
  dealContext: string;
}): Promise<{ subject: string; body: string }> {
  const system = `Tu es l'assistant commercial de Tony chez Metagora.
Tu rediges un follow-up email commercial en francais, court, naturel, actionnable.
IMPORTANT:
- Le mail DOIT commencer strictement par "Bonjour {{prenom}},"
- Utilise uniquement les placeholders exacts "{{prenom}}" (prénom) et "{{entreprise}}" (entreprise).
- Ne remplace jamais ces placeholders par des valeurs reelles.
Respecte ce format STRICT:
SUBJECT: ...
BODY:
...
Tony`;

  const user = [
    `Lead: ${input.leadName || "N/A"} <${input.leadEmail}>`,
    `Entreprise: ${input.company || "N/A"}`,
    "",
    "Contexte emails Gmail (thread):",
    input.threadContext,
    "",
    "Contexte affaire CRM:",
    input.dealContext,
    "",
    "Instruction: redige une V1 de follow-up avec proposition de next step concrete.",
  ].join("\n");

  const raw = await askAzureFast(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    700
  );

  const text = (raw || "").replace(/\r/g, "").trim();
  const subjectMatch = text.match(/SUBJECT:\s*(.+)/i);
  const bodyMatch = text.match(/BODY:\s*([\s\S]+)/i);
  const subject = normalizeTemplateTokens(subjectMatch?.[1]?.trim() || `Suivi - {{entreprise}}`).trim();
  const body = ensureBonjourPrenom(
    bodyMatch?.[1]?.trim() || text || "Je me permets de revenir vers vous.\n\nTony"
  );
  return {
    subject,
    body,
  };
}

export async function generateFollowupSequenceDrafts(input: {
  leadName?: string;
  leadEmail: string;
  company?: string;
  threadContext: string;
  dealContext: string;
  sequenceCount: number;
}): Promise<Array<{ step: number; subject: string; body: string; delayDays: number }>> {
  const count = Math.max(1, Math.min(5, input.sequenceCount));

  const system = `Tu es l'assistant commercial de Tony chez Metagora.
Tu dois generer une sequence de follow-up email en francais.
Contraintes:
- Produis exactement ${count} emails.
- Ton naturel, concis, commercial, actionnable.
- Chaque email doit etre differencie (pas de repetition).
- Delais progressifs entre emails (en jours).
- IMPORTANT:
  - Chaque mail DOIT commencer strictement par "Bonjour {{prenom}},"
  - Utilise uniquement les placeholders exacts "{{prenom}}" (prénom) et "{{entreprise}}" (entreprise).
  - Ne remplace jamais ces placeholders par des valeurs reelles.
  - Le mail 2 doit rebondir sur le fil Gmail precedent (objection, question, point ouvert).
  - Le mail 3 doit rebondir sur les mails precedents avec un angle differencie (valeur/CTA).
- Renvoie uniquement du JSON strict sans markdown.
Schema attendu:
{"emails":[{"step":1,"delayDays":0,"subject":"...","body":"..."},{"step":2,"delayDays":1,"subject":"...","body":"..."}]}`;

  const user = [
    `Lead: ${input.leadName || "N/A"} <${input.leadEmail}>`,
    `Entreprise: ${input.company || "N/A"}`,
    "",
    "Contexte emails Gmail (thread):",
    input.threadContext,
    "",
    "Contexte affaire CRM:",
    input.dealContext,
    "",
    `Instruction: genere ${count} mails de follow-up avec delais en jours.`,
  ].join("\n");

  const raw = await askAzureFast(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    1600
  );

  const fallbackFirst = await generateFollowupDraft({
    leadName: input.leadName,
    leadEmail: input.leadEmail,
    company: input.company,
    threadContext: input.threadContext,
    dealContext: input.dealContext,
  });

  try {
    const jsonBlock = raw.match(/\{[\s\S]*\}/)?.[0] || raw;
    const parsed = JSON.parse(jsonBlock) as {
      emails?: Array<{ step?: number; delayDays?: number; subject?: string; body?: string }>;
    };
    const emails = parsed.emails || [];
    if (!emails.length) throw new Error("No emails");

    const normalized = Array.from({ length: count }).map((_, idx) => {
      const step = idx + 1;
      const found = emails.find((e) => Number(e.step) === step) || emails[idx] || {};
      if (step === 1) {
        return {
          step,
          delayDays: 0,
          subject: normalizeTemplateTokens((found.subject || fallbackFirst.subject || "").trim()),
          body: ensureBonjourPrenom((found.body || fallbackFirst.body || "").trim()),
        };
      }
      return {
        step,
        delayDays: Math.max(0, Number(found.delayDays) || step - 1),
        subject: normalizeTemplateTokens((found.subject || `Relance ${step} - {{prenom}}`).trim()),
        body: ensureBonjourPrenom(
          (found.body || "Je me permets de vous relancer.\n\nTony").trim()
        ),
      };
    });

    return normalized;
  } catch {
    return Array.from({ length: count }).map((_, idx) => {
      const step = idx + 1;
      if (step === 1) {
        return { step, delayDays: 0, subject: fallbackFirst.subject, body: fallbackFirst.body };
      }
      return {
        step,
        delayDays: step - 1,
        subject: normalizeTemplateTokens(`Relance ${step} - {{prenom}}`),
        body: ensureBonjourPrenom("Je me permets de vous relancer.\n\nTony"),
      };
    });
  }
}

