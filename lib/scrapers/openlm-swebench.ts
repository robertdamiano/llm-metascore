import * as cheerio from 'cheerio';
import { ModelEntry } from '../types';

interface SWEBenchEntry {
  name: string;
  sweBenchScore: number | null;
  ioiScore: number | null;
  organization: string;
  license: string;
  date: string;
  agent: string;
}

function parseNumber(text: string): number | null {
  const cleaned = text.replace(/[^0-9.-]/g, '');
  if (!cleaned || cleaned === '') return null;
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

export async function fetchOpenLMSWEBench(): Promise<Record<string, ModelEntry[]>> {
  try {
    const response = await fetch('https://openlm.ai/swe-bench/', {
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch OpenLM SWE-bench: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const entries: SWEBenchEntry[] = [];

    // Find the main leaderboard table
    $('table.sortable tbody tr').each((index, row) => {
      const $row = $(row);
      const cells = $row.find('td');

      if (cells.length < 7) return; // Skip incomplete rows

      // Column indices based on the HTML structure:
      // 0: Model, 1: SWE-bench, 2: IOI, 3: Organization, 4: License, 5: Date, 6: Agent
      const modelCell = $(cells[0]);
      const modelName = modelCell.find('a').text().trim() || modelCell.text().trim();

      if (!modelName) return;

      const sweBenchScore = parseNumber($(cells[1]).text());
      const ioiScore = parseNumber($(cells[2]).text());
      const organization = $(cells[3]).text().trim();
      const license = $(cells[4]).text().trim();
      const date = $(cells[5]).text().trim();
      const agent = $(cells[6]).text().trim();

      entries.push({
        name: modelName,
        sweBenchScore,
        ioiScore,
        organization,
        license,
        date,
        agent,
      });
    });

    // Create separate rankings for each metric
    const sources: Record<string, ModelEntry[]> = {};

    // SWE-bench rankings
    const sweBenchEntries = entries.filter(e => e.sweBenchScore !== null);
    if (sweBenchEntries.length > 0) {
      const sweBenchRankings = sweBenchEntries
        .sort((a, b) => (b.sweBenchScore || 0) - (a.sweBenchScore || 0))
        .map((entry, index) => ({
          name: entry.name,
          rank: index + 1,
          source: 'openlm:swebench',
        }));
      sources['openlm:swebench'] = sweBenchRankings;
    }

    // IOI rankings
    const ioiEntries = entries.filter(e => e.ioiScore !== null);
    if (ioiEntries.length > 0) {
      const ioiRankings = ioiEntries
        .sort((a, b) => (b.ioiScore || 0) - (a.ioiScore || 0))
        .map((entry, index) => ({
          name: entry.name,
          rank: index + 1,
          source: 'openlm:ioi',
        }));
      sources['openlm:ioi'] = ioiRankings;
    }

    return sources;
  } catch (error) {
    console.error('Error fetching OpenLM SWE-bench:', error);
    return {};
  }
}
