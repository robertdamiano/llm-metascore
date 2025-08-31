from __future__ import annotations

import re


ALLOWED_CREATORS = {"OpenAI", "Google", "Anthropic", "xAI"}


def identify_creator(model_name: str) -> str:
    n = (model_name or "").lower()
    # Normalize known provider slugs to canonical creator names (only those we track)
    provider_map = {
        "openai": "OpenAI",
        "google": "Google",
        "anthropic": "Anthropic",
        "x-ai": "xAI",
        "xai": "xAI",
        # Common placeholders
        "others": "Other",
        "other": "Other",
    }
    if n in provider_map:
        return provider_map[n]
    if "/" in model_name:
        prov = model_name.split("/", 1)[0].strip().lower()
        if prov in provider_map:
            return provider_map[prov]
    # OpenAI
    if "gpt" in n or "chatgpt" in n:
        return "OpenAI"
    # o<number>- family (e.g., o4, o3-mini)
    if re.match(r"^o\d+\b", n):
        return "OpenAI"

    # Google
    if any(k in n for k in ["gemini", "imagen", "veo"]):
        return "Google"

    # Anthropic
    if "claude" in n:
        return "Anthropic"

    # xAI
    if "grok" in n:
        return "xAI"

    # Fallback: try provider prefix like "provider/model"
    if "/" in model_name:
        return model_name.split("/", 1)[0]
    return "Other"
