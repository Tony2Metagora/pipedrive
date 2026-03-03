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
}

/**
 * Enrich a contact via Dropcontact (async API with polling).
 * POST /v1/enrich/all → request_id
 * GET  /v1/enrich/all/{request_id} → poll until success=true
 */
export async function enrichContact(input: DropcontactInput): Promise<DropcontactResult | null> {
  // 1. Submit enrichment request
  console.log("[Dropcontact] Submitting:", JSON.stringify(input));
  const submitRes = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Access-Token": API_KEY,
    },
    body: JSON.stringify({
      data: [input],
      siren: false,
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

  // 2. Poll for result (max 60s, every 3s)
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 3000));

    console.log(`[Dropcontact] Polling attempt ${i + 1}/20...`);
    const pollRes = await fetch(`${BASE_URL}/${requestId}`, {
      method: "GET",
      headers: {
        "X-Access-Token": API_KEY,
      },
    });

    if (!pollRes.ok) {
      const text = await pollRes.text();
      console.error("[Dropcontact] Poll error:", pollRes.status, text);
      throw new Error(`Dropcontact poll error: ${pollRes.status} ${text}`);
    }

    const pollJson = await pollRes.json();
    console.log("[Dropcontact] Poll response:", JSON.stringify(pollJson).slice(0, 500));

    if (pollJson.success && pollJson.data?.length > 0) {
      console.log("[Dropcontact] Enrichment complete:", JSON.stringify(pollJson.data[0]).slice(0, 500));
      return pollJson.data[0] as DropcontactResult;
    }

    // success=false means still processing, keep polling
    if (!pollJson.success && !pollJson.error) {
      continue;
    }

    // If error=true, stop
    if (pollJson.error) {
      console.error("[Dropcontact] API error:", pollJson.reason);
      return null;
    }
  }

  throw new Error("Dropcontact: timeout (60s) waiting for enrichment result");
}
