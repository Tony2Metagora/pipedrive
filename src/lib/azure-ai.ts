/**
 * Shared Azure OpenAI helpers.
 * Backward-compatible env strategy:
 * - Primary: AZURE_OPENAI_ENDPOINT / AZURE_OPENAI_API_KEY / AZURE_OPENAI_DEPLOYMENT
 * - Legacy fast overrides still supported: *_FAST
 *
 * Includes retry with exponential backoff for 429 (Too Many Requests) errors.
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
    "gpt-5.4-mini";
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

/** Sleep helper for retry backoff */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retry config */
const MAX_RETRIES = 4;
const BASE_DELAY_MS = 2000; // 2s, 4s, 8s, 16s

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
    let res: Response | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-key": cfg.apiKey },
        body: JSON.stringify(body),
      });
      if (res.ok) break;
      if ((res.status === 429 || res.status === 503) && attempt < MAX_RETRIES) {
        const retryAfter = res.headers.get("retry-after");
        const delayMs = retryAfter
          ? parseInt(retryAfter) * 1000
          : BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(`Azure Responses ${res.status} attempt ${attempt + 1}, retrying in ${delayMs}ms...`);
        await sleep(delayMs);
        continue;
      }
      break;
    }

    if (!res || !res.ok) {
      const err = res ? await res.text() : "no response";
      console.warn(
        "Azure Responses API failed, fallback to chat/completions:",
        res?.status,
        typeof err === "string" ? err.slice(0, 200) : ""
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

/* ── askAzureFast: chat/completions with retry on 429 ── */

export async function askAzureFast(
  messages: ChatMessage[],
  maxTokens = 1500
): Promise<string> {
  const cfg = assertConfig();
  const url = `${cfg.endpoint}openai/deployments/${cfg.deployment}/chat/completions?api-version=${cfg.chatApiVersion}`;
  const body = JSON.stringify({ messages, max_completion_tokens: maxTokens });

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": cfg.apiKey },
      body,
    });

    if (res.ok) {
      const data = await res.json();
      return data.choices?.[0]?.message?.content?.trim() || "";
    }

    // Retry on 429 (rate limit) and 503 (service unavailable)
    if ((res.status === 429 || res.status === 503) && attempt < MAX_RETRIES) {
      const retryAfter = res.headers.get("retry-after");
      const delayMs = retryAfter
        ? parseInt(retryAfter) * 1000
        : BASE_DELAY_MS * Math.pow(2, attempt);
      console.warn(
        `Azure ${res.status} on attempt ${attempt + 1}/${MAX_RETRIES + 1}, retrying in ${delayMs}ms...`
      );
      await sleep(delayMs);
      continue;
    }

    const err = await res.text();
    console.error("Azure Chat Completions error:", res.status, err);
    throw new Error(`Azure OpenAI ${res.status}: ${err.slice(0, 200)}`);
  }

  throw new Error("Azure OpenAI: max retries exceeded");
}
