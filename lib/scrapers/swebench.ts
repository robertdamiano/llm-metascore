import { ModelEntry } from '../types';

interface SWEBenchResult {
  name: string;
  per_instance_details: Record<string, { resolved: boolean; [key: string]: unknown }>;
  [key: string]: unknown;
}

interface SWEBenchCategory {
  name: string;
  results: SWEBenchResult[];
}

export async function fetchSWEBench(): Promise<Record<string, ModelEntry[]>> {
  try {
    const res = await fetch('https://www.swebench.com/', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const html = await res.text();

    // Extract the JavaScript array containing leaderboard data
    // The data is embedded as a JavaScript variable in the HTML
    // Find the start of the bash-only data
    const bashStartMatch = html.match(/\[\s*\{\s*"name"\s*:\s*"bash-only"\s*,\s*"results"\s*:\s*\[/);

    if (!bashStartMatch || bashStartMatch.index === undefined) {
      console.warn('No SWE-bench bash-only data found');
      return {};
    }

    try {
      // Find the matching closing bracket for the bash-only object
      // We need to count braces to find where this object ends
      const startPos = bashStartMatch.index;
      let braceCount = 0;
      let inString = false;
      let escapeNext = false;
      let endPos = startPos;

      for (let i = startPos; i < html.length; i++) {
        const char = html[i];

        if (escapeNext) {
          escapeNext = false;
          continue;
        }

        if (char === '\\') {
          escapeNext = true;
          continue;
        }

        if (char === '"' && !escapeNext) {
          inString = !inString;
          continue;
        }

        if (!inString) {
          if (char === '{' || char === '[') {
            braceCount++;
          } else if (char === '}' || char === ']') {
            braceCount--;
            if (braceCount === 0) {
              endPos = i + 1;
              break;
            }
          }
        }
      }

      if (endPos === startPos) {
        console.warn('Could not find end of bash-only data');
        return {};
      }

      // Extract the JSON string
      const jsonStr = html.substring(startPos, endPos);

      const categories: SWEBenchCategory[] = JSON.parse(jsonStr);
      const bashOnly = categories.find(cat => cat.name === 'bash-only');

      if (!bashOnly || !bashOnly.results || bashOnly.results.length === 0) {
        console.warn('No bash-only results found in parsed data');
        return {};
      }

      // Process each model result
      const entries: Array<ModelEntry & { score?: number }> = [];

      for (const result of bashOnly.results) {
        if (!result.name || !result.per_instance_details) continue;

        // Calculate resolved percentage from per_instance_details
        const instances = Object.values(result.per_instance_details);
        if (instances.length === 0) continue;

        const resolvedCount = instances.filter(instance => instance.resolved === true).length;
        const resolvedPercent = (resolvedCount / instances.length) * 100;

        entries.push({
          name: result.name,
          rank: 0,
          source: 'swebench:bash',
          score: resolvedPercent,
        });
      }

      if (entries.length === 0) {
        console.warn('No valid SWE-bench entries extracted');
        return {};
      }

      // Dedupe by name (keep highest resolved score)
      const byName = new Map<string, ModelEntry & { score?: number }>();
      for (const entry of entries) {
        const existing = byName.get(entry.name);
        if (!existing || (entry.score ?? 0) > (existing.score ?? 0)) {
          byName.set(entry.name, entry);
        }
      }

      // Sort by resolved % descending, assign ranks
      const deduped = Array.from(byName.values());
      deduped.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      deduped.forEach((e, idx) => {
        e.rank = idx + 1;
        delete e.score;
      });

      return { 'swebench:bash': deduped };
    } catch (parseError) {
      console.error('Error parsing SWE-bench JSON:', parseError);
      return {};
    }
  } catch (error) {
    console.error('SWE-bench fetch failed:', error);
    return {};
  }
}
