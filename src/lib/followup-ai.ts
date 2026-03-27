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
  return {
    subject: subjectMatch?.[1]?.trim() || `Suivi - ${input.company || input.leadName || "votre projet"}`,
    body: bodyMatch?.[1]?.trim() || text,
  };
}

