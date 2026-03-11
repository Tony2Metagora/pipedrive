/**
 * PhantomBuster API integration — Sales Navigator Search Export.
 *
 * Launches a configured Phantom agent with a Sales Nav search URL,
 * polls for completion, and parses the extracted profiles.
 *
 * Env vars required:
 *   PHANTOMBUSTER_API_KEY — your PhantomBuster API key
 *   PHANTOMBUSTER_AGENT_ID — the ID of your "Sales Navigator Search Export" Phantom
 */

const API_KEY = process.env.PHANTOMBUSTER_API_KEY || "";
const AGENT_ID = process.env.PHANTOMBUSTER_AGENT_ID || "";
const BASE = "https://api.phantombuster.com/api/v2";

// ─── Types ───────────────────────────────────────────────

export interface PhantomProfile {
  firstName: string;
  lastName: string;
  title: string;
  companyName: string;
  linkedinUrl: string;
  location?: string;
  connectionDegree?: string;
  vmid?: string;
  profileImageUrl?: string;
}

export interface LaunchResult {
  containerId: string;
}

export interface AgentStatus {
  status: "running" | "finished" | "error" | "starting" | "paused";
  containerId: string;
  exitCode?: number;
}

// ─── Launch ──────────────────────────────────────────────

export async function launchAgent(salesNavUrl: string, numberOfProfiles: number = 100): Promise<LaunchResult> {
  if (!API_KEY) throw new Error("PHANTOMBUSTER_API_KEY non configuré");
  if (!AGENT_ID) throw new Error("PHANTOMBUSTER_AGENT_ID non configuré");

  console.log(`[PhantomBuster] Launching agent ${AGENT_ID} with URL: ${salesNavUrl.slice(0, 80)}...`);

  const res = await fetch(`${BASE}/agents/launch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Phantombuster-Key": API_KEY,
    },
    body: JSON.stringify({
      id: AGENT_ID,
      argument: JSON.stringify({
        searchUrl: salesNavUrl,
        numberOfProfiles,
        removeDuplicateProfiles: true,
      }),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[PhantomBuster] Launch error:", res.status, text);
    throw new Error(`PhantomBuster launch error: ${res.status} — ${text}`);
  }

  const json = await res.json();
  console.log("[PhantomBuster] Launch response:", JSON.stringify(json));

  return { containerId: json.containerId };
}

// ─── Poll status ─────────────────────────────────────────

export async function getAgentStatus(): Promise<AgentStatus> {
  const res = await fetch(`${BASE}/agents/fetch?id=${AGENT_ID}`, {
    headers: { "X-Phantombuster-Key": API_KEY },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PhantomBuster status error: ${res.status} — ${text}`);
  }

  const json = await res.json();

  // Map PhantomBuster's lastEndMessage / running states
  let status: AgentStatus["status"] = "running";
  if (json.lastEndMessage || json.lastEndStatus) {
    status = json.lastEndStatus === "error" ? "error" : "finished";
  }
  if (json.running === true) {
    status = "running";
  }

  return {
    status,
    containerId: json.containerId || "",
    exitCode: json.exitCode,
  };
}

// ─── Fetch output ────────────────────────────────────────

export async function fetchAgentOutput(): Promise<PhantomProfile[]> {
  const res = await fetch(`${BASE}/agents/fetch-output?id=${AGENT_ID}`, {
    headers: { "X-Phantombuster-Key": API_KEY },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PhantomBuster output error: ${res.status} — ${text}`);
  }

  const json = await res.json();

  // PhantomBuster returns output as a JSON string in json.output or json.resultObject
  let raw: Record<string, unknown>[] = [];

  if (json.resultObject) {
    try {
      raw = typeof json.resultObject === "string" ? JSON.parse(json.resultObject) : json.resultObject;
    } catch {
      console.warn("[PhantomBuster] Could not parse resultObject");
    }
  }

  if ((!raw || raw.length === 0) && json.output) {
    // Some Phantoms return output as JSONL (one JSON per line)
    try {
      const lines = String(json.output).trim().split("\n");
      const lastLine = lines[lines.length - 1];
      const parsed = JSON.parse(lastLine);
      raw = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      console.warn("[PhantomBuster] Could not parse output");
    }
  }

  console.log(`[PhantomBuster] Parsed ${raw.length} profiles from output`);

  return raw.map((r) => ({
    firstName: String(r.firstName || r.first_name || r.name || "").trim(),
    lastName: String(r.lastName || r.last_name || "").trim(),
    title: String(r.title || r.jobTitle || r.job || "").trim(),
    companyName: String(r.companyName || r.company || r.companyName || "").trim(),
    linkedinUrl: String(r.linkedinUrl || r.profileUrl || r.linkedin || r.linkedInUrl || "").trim(),
    location: String(r.location || r.city || "").trim(),
    connectionDegree: String(r.connectionDegree || r.degree || "").trim(),
    vmid: String(r.vmid || r.memberId || "").trim(),
    profileImageUrl: String(r.profileImageUrl || r.imgUrl || "").trim(),
  }));
}
