import * as cheerio from 'cheerio';
import { ModelEntry } from '../types';

interface ValsScraperResult {
  'vals:vibe-code': ModelEntry[];
}

type ValsEntry = Omit<ModelEntry, 'rank'> & { rank?: number };

function normalizeScore(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (raw >= 0 && raw <= 1) return raw * 100;
    return raw;
  }

  if (typeof raw !== 'string') return null;
  const match = raw.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const value = parseFloat(match[1]);
  if (!Number.isFinite(value)) return null;
  if (value >= 0 && value <= 1) return value * 100;
  return value;
}

function mergeEntries(entries: ValsEntry[]): ValsEntry[] {
  const byName = new Map<string, ValsEntry>();

  for (const entry of entries) {
    const key = entry.name.trim().toLowerCase();
    if (!key) continue;
    const existing = byName.get(key);
    if (!existing || (entry.score ?? -1) > (existing.score ?? -1)) {
      byName.set(key, entry);
    }
  }

  return Array.from(byName.values());
}

function rankByScore(entries: ValsEntry[]): ModelEntry[] {
  const scored = entries.filter(entry => typeof entry.score === 'number');
  if (scored.length === 0) return [];

  scored.sort((a, b) => {
    const aVal = a.score ?? 0;
    const bVal = b.score ?? 0;
    if (bVal !== aVal) return bVal - aVal;
    return a.name.localeCompare(b.name);
  });

  let lastScore: number | null = null;
  let lastRank = 0;

  return scored.map((entry, index) => {
    const score = entry.score as number;
    if (lastScore === null || score !== lastScore) {
      lastRank = index + 1;
      lastScore = score;
    }

    return {
      ...entry,
      rank: lastRank,
    };
  });
}

function parseNextDataEntries(html: string): ValsEntry[] {
  const $ = cheerio.load(html);
  const script = $('#__NEXT_DATA__').text().trim();
  if (!script) return [];

  try {
    const data = JSON.parse(script);
    const entries: ValsEntry[] = [];

    const nameKeys = ['model', 'modelName', 'name', 'displayName'];
    const scoreKeys = ['score', 'percentage', 'percent', 'pct', 'value'];

    const visit = (value: unknown) => {
      if (!value) return;

      if (Array.isArray(value)) {
        for (const item of value) visit(item);
        return;
      }

      if (typeof value !== 'object') return;
      const record = value as Record<string, unknown>;

      let name: string | null = null;
      for (const key of nameKeys) {
        if (typeof record[key] === 'string') {
          name = record[key] as string;
          break;
        }
      }

      let score: number | null = null;
      for (const key of scoreKeys) {
        const normalized = normalizeScore(record[key]);
        if (normalized !== null) {
          score = normalized;
          break;
        }
      }

      if (name && score !== null && score >= 0 && score <= 100 && name.length < 100) {
        entries.push({
          name: name.trim(),
          score,
          source: 'vals:vibe-code',
        });
      }

      for (const child of Object.values(record)) visit(child);
    };

    visit(data);

    return mergeEntries(entries);
  } catch (error) {
    console.warn('Failed to parse Vals.ai __NEXT_DATA__ payload:', error);
    return [];
  }
}

function parseTableEntries($: cheerio.CheerioAPI): ValsEntry[] {
  const entries: ValsEntry[] = [];

  $('table').each((_, table) => {
    $(table)
      .find('tbody tr')
      .each((__, row) => {
        const cells = $(row).find('td');
        if (cells.length < 2) return;

        const name = $(cells[0]).text().trim();
        if (!name || /^model$/i.test(name)) return;

        let score: number | null = null;
        cells.each((cellIndex, cell) => {
          if (cellIndex === 0) return;
          if (score !== null) return;
          score = normalizeScore($(cell).text().trim());
        });

        if (score !== null) {
          entries.push({
            name,
            score,
            source: 'vals:vibe-code',
          });
        }
      });
  });

  return mergeEntries(entries);
}

function parseValsVibeCode(html: string): ModelEntry[] {
  const $ = cheerio.load(html);
  const entries: ValsEntry[] = [];

  entries.push(...parseNextDataEntries(html));

  if (entries.length === 0) {
    entries.push(...parseTableEntries($));
  }

  if (entries.length === 0) {
    // Look for text containing model names and percentages
    // Based on our WebFetch, the top 3 are in the static HTML
    const text = $('body').text();
    const patterns = [
      { name: 'GPT 5.2', pattern: /GPT\s*5\.2.*?(\d+\.\d+)%/ },
      { name: 'GPT 5.1', pattern: /GPT\s*5\.1.*?(\d+\.\d+)%/ },
      { name: 'Claude Sonnet 4.5 (Thinking)', pattern: /Claude\s*Sonnet\s*4\.5\s*\(Thinking\).*?(\d+\.\d+)%/ },
    ];

    for (const { name, pattern } of patterns) {
      const match = text.match(pattern);
      if (match) {
        const score = parseFloat(match[1]);
        entries.push({
          name,
          score,
          source: 'vals:vibe-code',
        });
      }
    }
  }

  return rankByScore(mergeEntries(entries));
}

export async function fetchValsAI(): Promise<ValsScraperResult> {
  const results: ValsScraperResult = {
    'vals:vibe-code': [],
  };

  try {
    const response = await fetch('https://vals.ai/benchmarks/vibe-code', {
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Vals.ai Vibe Code: ${response.status}`);
    }

    const html = await response.text();
    results['vals:vibe-code'] = parseValsVibeCode(html);
  } catch (error) {
    console.error('Error fetching Vals.ai Vibe Code:', error);
  }

  return results;
}
