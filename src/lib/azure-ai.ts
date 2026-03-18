/**
 * Shared Azure OpenAI helper — tries chat/completions first,
 * falls back to Responses API for gpt-5.4-pro and similar models.
 */

const ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT!;
const API_KEY = process.env.AZURE_OPENAI_API_KEY!;
const API_VERSION = process.env.AZURE_OPENAI_API_VERSION || "2024-12-01-preview";
const DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-5.4-pro";

export async function askAzureAI(
  messages: { role: string; content: string }[],
  maxTokens = 1500
): Promise<string> {
  // 1) Try chat/completions (works for gpt-5.2-chat, gpt-4o, etc.)
  const chatUrl = `${ENDPOINT}openai/deployments/${DEPLOYMENT}/chat/completions?api-version=${API_VERSION}`;
  const chatRes = await fetch(chatUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": API_KEY },
    body: JSON.stringify({ messages, max_completion_tokens: maxTokens }),
  });

  if (chatRes.ok) {
    const data = await chatRes.json();
    return data.choices?.[0]?.message?.content?.trim() || "";
  }

  // 2) Fallback to Responses API (gpt-5.4-pro etc.)
  const chatErr = await chatRes.text();
  console.warn("Chat completions failed, trying Responses API:", chatRes.status, chatErr.slice(0, 120));

  const systemMsg = messages.find((m) => m.role === "system")?.content || "";
  const otherMsgs = messages.filter((m) => m.role !== "system");
  const input: { role: string; content: string }[] = [];
  if (systemMsg) input.push({ role: "developer", content: systemMsg });
  for (const m of otherMsgs) input.push({ role: m.role, content: m.content });

  const responsesUrl = `${ENDPOINT}openai/responses?api-version=2025-04-01-preview`;
  const responsesRes = await fetch(responsesUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": API_KEY },
    body: JSON.stringify({ model: DEPLOYMENT, input, max_output_tokens: maxTokens }),
  });

  if (!responsesRes.ok) {
    const err = await responsesRes.text();
    console.error("Responses API error:", responsesRes.status, err);
    throw new Error(`Azure OpenAI ${responsesRes.status}: ${err.slice(0, 200)}`);
  }

  const rData = await responsesRes.json();
  // Responses API: output[] → message → content[] → output_text
  if (Array.isArray(rData.output)) {
    for (const item of rData.output) {
      if (item.type === "message" && Array.isArray(item.content)) {
        for (const c of item.content) {
          if (c.type === "output_text" && c.text) return c.text.trim();
        }
      }
    }
  }
  return rData.output_text?.trim() || "";
}
