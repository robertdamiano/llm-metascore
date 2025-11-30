export const ALLOWED_CREATORS = new Set(["OpenAI", "Google", "Anthropic", "xAI"]);

export function identifyCreator(modelName: string): string {
  const n = (modelName || "").toLowerCase();

  // Normalize known provider slugs to canonical creator names
  const providerMap: Record<string, string> = {
    "openai": "OpenAI",
    "google": "Google",
    "anthropic": "Anthropic",
    "x-ai": "xAI",
    "xai": "xAI",
    "others": "Other",
    "other": "Other",
  };

  if (providerMap[n]) {
    return providerMap[n];
  }

  if (modelName.includes("/")) {
    const prov = modelName.split("/")[0].trim().toLowerCase();
    if (providerMap[prov]) {
      return providerMap[prov];
    }
  }

  // OpenAI
  if (n.includes("gpt") || n.includes("chatgpt")) {
    return "OpenAI";
  }

  // o<number> family (e.g., o4, o3-mini)
  if (/^o\d+\b/.test(n)) {
    return "OpenAI";
  }

  // Google
  if (["gemini", "imagen", "veo"].some(k => n.includes(k))) {
    return "Google";
  }

  // Anthropic
  if (n.includes("claude")) {
    return "Anthropic";
  }

  // xAI
  if (n.includes("grok")) {
    return "xAI";
  }

  // Fallback: try provider prefix
  if (modelName.includes("/")) {
    return modelName.split("/")[0];
  }

  return "Other";
}
