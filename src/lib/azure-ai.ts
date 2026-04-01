/**
 * Shared Azure OpenAI helpers.
 * Backward-compatible env strategy:
 * - Primary: AZURE_OPENAI_ENDPOINT / AZURE_OPENAI_API_KEY / AZURE_OPENAI_DEPLOYMENT
 * - Legacy fast overrides still supported: *_FAST
 */

type ChatMessage = { role: string; content: string };

function ensureSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

function readConfig() {
  const endpoint =
    process.env.AZURE_OPENAI_ENDPOINT_FAST ||
    process.env.AZURE_OPENAI_ENDPOINT ||
    "";
  const apiKey =
    process.env.AZURE_OPENAI_API_KEY_FAST ||
    process.env.AZURE_OPENAI_API_KEY ||
    "";
  const deployment =
    process.env.AZURE_OPENAI_DEPLOYMENT_FAST ||
    process.env.AZURE_OPENAI_DEPLOYMENT ||
    "gpt-5-2";
  const chatApiVersion =
    process.env.AZURE_OPENAI_API_VERSION_FAST ||
    process.env.AZURE_OPENAI_API_VERSION ||
    "2024-12-01-preview";
  const responsesApiVersion =
    process.env.AZURE_OPENAI_API_VERSION_RESPONSES ||
    "2025-04-01-preview";

  return {
    endpoint: ensureSlash(endpoint),
    apiKey,
    deployment,
    chatApiVersion,
    responsesApiVersion,
  };
}

function assertConfig() {
  const cfg = readConfig();
  if (!cfg.endpoint || !cfg.apiKey) {
    throw new Error(
      "Azure OpenAI non configuré: définir AZURE_OPENAI_ENDPOINT et AZURE_OPENAI_API_KEY"
    );
  }
  return cfg;
}

/* ── askAzureAI: Responses API when available, fallback to chat/completions ── */

export async function askAzureAI(
  messages: ChatMessage[],
  maxTokens = 1500,
  tools?: { type: string }[]
): Promise<string> {
  const cfg = assertConfig();
  const input: { role: string; content: string }[] = [];
  for (const m of messages) {
    input.push({ role: m.role === "system" ? "developer" : m.role, content: m.content });
  }

  const body: Record<string, unknown> = {
    model: cfg.deployment,
    input,
    max_output_tokens: maxTokens,
  };
  if (tools) body.tools = tools;

  const url = `${cfg.endpoint}openai/responses?api-version=${cfg.responsesApiVersion}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": cfg.apiKey },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      console.warn(
        "Azure Responses API failed, fallback to chat/completions:",
        res.status,
        err.slice(0, 200)
      );
      return askAzureFast(messages, maxTokens);
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
  } catch (error) {
    console.warn("Azure Responses API exception, fallback to chat/completions:", error);
    return askAzureFast(messages, maxTokens);
  }
}

/* ── askAzureFast: chat/completions ── */

export async function askAzureFast(
  messages: ChatMessage[],
  maxTokens = 1500
): Promise<string> {
  const cfg = assertConfig();
  const url = `${cfg.endpoint}openai/deployments/${cfg.deployment}/chat/completions?api-version=${cfg.chatApiVersion}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": cfg.apiKey },
    body: JSON.stringify({ messages, max_tokens: maxTokens }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Azure Chat Completions error:", res.status, err);
    throw new Error(`Azure OpenAI ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}
