/**
 * Shared Azure OpenAI helpers.
 * - askAzureAI: uses gpt-5.4-pro Responses API (slow but powerful, supports web_search)
 * - askAzureFast: uses gpt-5.2-chat chat/completions (fast, ~3-8s)
 */

// gpt-5.4-pro (eastus2) — Responses API
const ENDPOINT_PRO = process.env.AZURE_OPENAI_ENDPOINT || "https://infan-mkcivtsn-eastus2.cognitiveservices.azure.com/";
const KEY_PRO = process.env.AZURE_OPENAI_API_KEY!;
const DEPLOY_PRO = process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-5.4-pro";

// gpt-5.2-chat (swedencentral) — Chat Completions API
const ENDPOINT_FAST = process.env.AZURE_OPENAI_ENDPOINT_FAST!;
const KEY_FAST = process.env.AZURE_OPENAI_API_KEY_FAST!;
const DEPLOY_FAST = process.env.AZURE_OPENAI_DEPLOYMENT_FAST || "gpt-5.2-chat";

/* ── askAzureAI: gpt-5.4-pro via Responses API (supports tools like web_search) ── */

export async function askAzureAI(
  messages: { role: string; content: string }[],
  maxTokens = 1500,
  tools?: { type: string }[]
): Promise<string> {
  const input: { role: string; content: string }[] = [];
  for (const m of messages) {
    input.push({ role: m.role === "system" ? "developer" : m.role, content: m.content });
  }

  const body: Record<string, unknown> = { model: DEPLOY_PRO, input, max_output_tokens: maxTokens };
  if (tools) body.tools = tools;

  const url = `${ENDPOINT_PRO}openai/responses?api-version=2025-04-01-preview`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": KEY_PRO },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Azure Responses API error:", res.status, err);
    throw new Error(`Azure OpenAI ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  if (Array.isArray(data.output)) {
    for (const item of data.output) {
      if (item.type === "message" && Array.isArray(item.content)) {
        for (const c of item.content) {
          if (c.type === "output_text" && c.text) return c.text.trim();
        }
      }
    }
  }
  return data.output_text?.trim() || "";
}

/* ── askAzureFast: gpt-5.2-chat via Chat Completions (fast, ~3-8s) ── */

export async function askAzureFast(
  messages: { role: string; content: string }[],
  maxTokens = 1500
): Promise<string> {
  const url = `${ENDPOINT_FAST}openai/deployments/${DEPLOY_FAST}/chat/completions?api-version=2024-12-01-preview`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": KEY_FAST },
    body: JSON.stringify({ messages, max_completion_tokens: maxTokens }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Azure Chat Completions error:", res.status, err);
    throw new Error(`Azure OpenAI ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}
