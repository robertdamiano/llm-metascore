from __future__ import annotations

import re


def identify_creator(model_name: str) -> str:
    n = (model_name or "").lower()
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

    # Fallback: try provider prefix like "provider/model"
    if "/" in model_name:
        return model_name.split("/", 1)[0]
    return "Other"

