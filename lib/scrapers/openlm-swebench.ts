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

function buildRankings(
  entries: SWEBenchEntry[],
  getValue: (entry: SWEBenchEntry) => number | null,
  source: ModelEntry['source']
): ModelEntry[] {
  const scored = entries
    .map(entry => ({ entry, value: getValue(entry) }))
    .filter(item => item.value !== null);

  if (scored.length === 0) return [];

  scored.sort((a, b) => {
    const aVal = a.value ?? 0;
    const bVal = b.value ?? 0;
    if (bVal !== aVal) return bVal - aVal;
    return a.entry.name.localeCompare(b.entry.name);
  });

  let lastValue: number | null = null;
  let lastRank = 0;

  return scored.map((item, index) => {
    const value = item.value as number;
    if (lastValue === null || value !== lastValue) {
      lastRank = index + 1;
      lastValue = value;
    }

    return {
      name: item.entry.name,
      rank: lastRank,
      source,
    };
  });
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
    const sweBenchRankings = buildRankings(
      entries,
      entry => entry.sweBenchScore,
      'openlm:swebench'
    );
    if (sweBenchRankings.length > 0) {
      sources['openlm:swebench'] = sweBenchRankings;
    }

    // IOI rankings
    const ioiRankings = buildRankings(
      entries,
      entry => entry.ioiScore,
      'openlm:ioi'
    );
    if (ioiRankings.length > 0) {
      sources['openlm:ioi'] = ioiRankings;
    }

    return sources;
  } catch (error) {
    console.error('Error fetching OpenLM SWE-bench:', error);
    return {};
  }
}
