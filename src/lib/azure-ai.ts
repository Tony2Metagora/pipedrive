/**
 * Shared Azure OpenAI helper — uses Responses API directly.
 * Compatible with gpt-5.4-pro and similar models on Azure AI Foundry.
 */

const ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT!;
const API_KEY = process.env.AZURE_OPENAI_API_KEY!;
const DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-5.4-pro";

export async function askAzureAI(
  messages: { role: string; content: string }[],
  maxTokens = 1500
): Promise<string> {
  // Convert messages: system → developer for Responses API
  const input: { role: string; content: string }[] = [];
  for (const m of messages) {
    input.push({ role: m.role === "system" ? "developer" : m.role, content: m.content });
  }

  const url = `${ENDPOINT}openai/responses?api-version=2025-04-01-preview`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": API_KEY },
    body: JSON.stringify({ model: DEPLOYMENT, input, max_output_tokens: maxTokens }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Azure OpenAI Responses API error:", res.status, err);
    throw new Error(`Azure OpenAI ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  // Responses API: output[] → message → content[] → output_text
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
