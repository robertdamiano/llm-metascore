import * as cheerio from 'cheerio';
import { ModelEntry } from '../types';

interface ValsScraperResult {
  'vals:vibe-code': ModelEntry[];
}

type ValsEntry = Omit<ModelEntry, 'rank'> & { rank?: number };

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

function parseValsVibeCode(html: string): ModelEntry[] {
  const $ = cheerio.load(html);
  const entries: ValsEntry[] = [];

  // Look for text containing model names and percentages
  // Based on our WebFetch, the top 3 are in the static HTML
  const text = $('body').text();

  // Find GPT 5.2, GPT 5.1, Claude Sonnet with their scores
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

  // If pattern matching fails, try table parsing as fallback
  if (entries.length === 0) {
    $('table tbody tr').slice(0, 3).each((index, row) => {
      const $row = $(row);
      const cells = $row.find('td');

      if (cells.length >= 2) {
        const modelName = $(cells[0]).text().trim();
        const scoreText = $(cells[1]).text().trim();
        const scoreMatch = scoreText.match(/(\d+\.\d+)/);

        if (modelName && scoreMatch) {
          entries.push({
            name: modelName,
            score: parseFloat(scoreMatch[1]),
            source: 'vals:vibe-code',
          });
        }
      }
    });
  }

  return rankByScore(entries);
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
