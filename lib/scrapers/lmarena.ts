import { ModelEntry } from '../types';

type LMArenaCategory = 'text' | 'vision' | 'search' | 'webdev';

// Helper to decode Unicode escape sequences in Next.js streaming chunks
function decodeUnicode(str: string): string {
  return str.replace(/\\u[\dA-F]{4}/gi, (match) => {
    return String.fromCharCode(parseInt(match.replace(/\\u/g, ''), 16));
  });
}

function parseCategoryPage(html: string, category: LMArenaCategory): ModelEntry[] {
  try {
    // Extract Next.js streaming data chunks: self.__next_f.push([...])
    const chunkRegex = /self\.__next_f\.push\((\[.*?\])\)/g;
    let match;

    while ((match = chunkRegex.exec(html)) !== null) {
      try {
        // Parse the outer array to get the streaming chunk
        const parsed = JSON.parse(match[1]);
        if (!Array.isArray(parsed) || parsed.length < 2) continue;

        // The actual data is in the second element (index 1), decode Unicode escapes
        const content = decodeUnicode(String(parsed[1]));

        // Look for the "entries" array containing leaderboard data
        const entriesMatch = content.indexOf('"entries":[');
        if (entriesMatch === -1) continue;

        // Find the complete entries array using bracket counting
        const arrayStart = content.indexOf('[', entriesMatch);
        if (arrayStart === -1) continue;

        let bracketCount = 0;
        let inString = false;
        let escape = false;
        let arrayEnd = arrayStart;

        for (let i = arrayStart; i < content.length; i++) {
          const char = content[i];

          if (escape) {
            escape = false;
            continue;
          }

          if (char === '\\') {
            escape = true;
            continue;
          }

          if (char === '"' && !escape) {
            inString = !inString;
          }

          if (!inString) {
            if (char === '[') bracketCount++;
            if (char === ']') {
              bracketCount--;
              if (bracketCount === 0) {
                arrayEnd = i + 1;
                break;
              }
            }
          }
        }

        if (arrayEnd === arrayStart) continue;

        // Parse the entries array
        const arrayStr = content.substring(arrayStart, arrayEnd);
        const leaderboardEntries = JSON.parse(arrayStr);

        if (!Array.isArray(leaderboardEntries) || leaderboardEntries.length === 0) continue;

        // Convert to ModelEntry format
        const entries: ModelEntry[] = leaderboardEntries
          .filter((e: { rank?: number; modelDisplayName?: string }) => e.rank && e.rank > 0 && e.rank < 1000 && e.modelDisplayName)
          .map((e: { modelDisplayName: string; rank: number }) => ({
            name: e.modelDisplayName,
            rank: e.rank,
            source: `lmarena:${category}`,
          }));

        if (entries.length > 0) {
          // Dedupe by name (keep lowest rank)
          const byName = new Map<string, ModelEntry>();
          for (const entry of entries) {
            const existing = byName.get(entry.name);
            if (!existing || entry.rank < existing.rank) {
              byName.set(entry.name, entry);
            }
          }

          return Array.from(byName.values()).sort((a, b) => a.rank - b.rank);
        }
      } catch {
        // Skip malformed chunks silently
        continue;
      }
    }

    return [];
  } catch (error) {
    console.error(`Error parsing LMArena ${category}:`, error);
    return [];
  }
}

async function fetchCategory(category: LMArenaCategory): Promise<ModelEntry[]> {
  try {
    const res = await fetch(`https://lmarena.ai/leaderboard/${category}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseCategoryPage(await res.text(), category);
  } catch (error) {
    console.error(`LMArena ${category} fetch failed:`, error);
    return [];
  }
}

export async function fetchLMArenaAllSources(): Promise<Record<string, ModelEntry[]>> {
  const [text, vision, search, webdev] = await Promise.all([
    fetchCategory('text'),
    fetchCategory('vision'),
    fetchCategory('search'),
    fetchCategory('webdev'),
  ]);

  const sources: Record<string, ModelEntry[]> = {};
  if (text.length > 0) sources['lmarena:text'] = text;
  if (vision.length > 0) sources['lmarena:vision'] = vision;
  if (search.length > 0) sources['lmarena:search'] = search;
  if (webdev.length > 0) sources['lmarena:webdev'] = webdev;
  return sources;
}
