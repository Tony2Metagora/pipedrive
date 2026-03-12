/**
 * Service Dropcontact — enrichissement de contacts (email, LinkedIn, téléphone, poste).
 * API docs: https://developer.dropcontact.com/
 */

const API_KEY = process.env.DROPCONTACT_API_KEY!;
const BASE_URL = "https://api.dropcontact.com/v1/enrich/all";

interface DropcontactInput {
  first_name?: string;
  last_name?: string;
  full_name?: string;
  company?: string;
  email?: string;
}

export interface DropcontactResult {
  email?: { email: string; qualification: string }[];
  first_name?: string;
  last_name?: string;
  full_name?: string;
  phone?: string;
  mobile_phone?: string;
  job?: string;
  linkedin?: string;
  company?: string;
  website?: string;
  nb_employees?: string;
  naf5_code?: string;
  naf5_des?: string;
  siren?: string;
  siret?: string;
  siret_address?: string;
  company_linkedin?: string;
  company_turnover?: string;
}

/**
 * Submit a batch of contacts to Dropcontact for enrichment.
 * Returns request_id for later polling.
 */
export async function submitBatchEnrich(inputs: DropcontactInput[]): Promise<string> {
  console.log(`[Dropcontact] Submitting batch of ${inputs.length} contacts...`);
  const submitRes = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Access-Token": API_KEY,
    },
    body: JSON.stringify({
      data: inputs,
      siren: true,
      language: "fr",
    }),
  });

  if (!submitRes.ok) {
    const text = await submitRes.text();
    console.error("[Dropcontact] Submit error:", submitRes.status, text);
    throw new Error(`Dropcontact submit error: ${submitRes.status} ${text}`);
  }

  const submitJson = await submitRes.json();
  console.log("[Dropcontact] Submit response:", JSON.stringify(submitJson));
  const requestId = submitJson.request_id;

  if (!requestId) {
    throw new Error("Dropcontact: no request_id returned");
  }

  return requestId;
}

/**
 * Poll for batch enrichment results.
 * Returns { done: true, data } if complete, { done: false } if still processing.
 */
export async function pollBatchEnrich(requestId: string): Promise<{ done: boolean; data?: DropcontactResult[]; error?: string }> {
  console.log(`[Dropcontact] Polling request ${requestId}...`);
  const pollRes = await fetch(`${BASE_URL}/${requestId}`, {
    method: "GET",
    headers: {
      "X-Access-Token": API_KEY,
    },
  });

  if (!pollRes.ok) {
    const text = await pollRes.text();
    console.error("[Dropcontact] Poll error:", pollRes.status, text);
    return { done: true, error: `Dropcontact poll error: ${pollRes.status} ${text}` };
  }

  const pollJson = await pollRes.json();
  console.log("[Dropcontact] Poll response:", JSON.stringify(pollJson).slice(0, 800));

  if (pollJson.error) {
    return { done: true, error: pollJson.reason || "Dropcontact API error" };
  }

  if (pollJson.success && pollJson.data?.length > 0) {
    return { done: true, data: pollJson.data as DropcontactResult[] };
  }

  // Still processing
  return { done: false };
}

/**
 * Legacy single-contact enrichment (with internal polling, for non-prospect use).
 */
export async function enrichContact(input: DropcontactInput): Promise<DropcontactResult | null> {
  const requestId = await submitBatchEnrich([input]);

  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const result = await pollBatchEnrich(requestId);
    if (result.done) {
      if (result.error) throw new Error(result.error);
      return result.data?.[0] ?? null;
    }
  }

  throw new Error("Dropcontact: timeout (60s) waiting for enrichment result");
}
