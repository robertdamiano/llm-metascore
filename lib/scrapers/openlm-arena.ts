import * as cheerio from 'cheerio';
import { ModelEntry } from '../types';

interface ArenaEntry {
  name: string;
  arenaElo: number;
  coding: number | null;
  vision: number | null;
  aaii: number | null;
  mmluPro: number | null;
  arcAgi: number | null;
  organization: string;
  license: string;
}

function buildRankings(
  entries: ArenaEntry[],
  getValue: (entry: ArenaEntry) => number | null,
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

export async function fetchOpenLMArena(): Promise<Record<string, ModelEntry[]>> {
  try {
    const response = await fetch('https://openlm.ai/chatbot-arena/', {
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch OpenLM Arena: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const entries: ArenaEntry[] = [];

    // Find the main leaderboard table
    $('table.sortable tbody tr').each((index, row) => {
      const $row = $(row);
      const cells = $row.find('td');

      if (cells.length < 10) return; // Skip incomplete rows

      // Column indices based on the HTML structure:
      // 0: medal/trophy, 1: Model, 2: Arena Elo, 3: Coding, 4: Vision, 5: AAII, 6: MMLU-Pro, 7: ARC-AGI, 8: Organization, 9: License
      const modelLink = $(cells[1]).find('a');
      const modelName = modelLink.text().trim() || $(cells[1]).text().trim();

      if (!modelName) return;

      const arenaElo = parseNumber($(cells[2]).text());
      const coding = parseNumber($(cells[3]).text());
      const vision = parseNumber($(cells[4]).text());
      const aaii = parseNumber($(cells[5]).text());
      const mmluPro = parseNumber($(cells[6]).text());
      const arcAgi = parseNumber($(cells[7]).text());
      const organization = $(cells[8]).text().trim();
      const license = $(cells[9]).text().trim();

      if (arenaElo === null) return; // Skip if no arena score

      entries.push({
        name: modelName,
        arenaElo,
        coding,
        vision,
        aaii,
        mmluPro,
        arcAgi,
        organization,
        license,
      });
    });

    // Create separate rankings for each metric
    const sources: Record<string, ModelEntry[]> = {};

    // Arena Elo Overall
    if (entries.length > 0) {
      const arenaRankings = buildRankings(
        entries,
        entry => entry.arenaElo,
        'openlm:arena:overall'
      );
      if (arenaRankings.length > 0) {
        sources['openlm:arena:overall'] = arenaRankings;
      }
    }

    // Coding rankings
    const codingRankings = buildRankings(
      entries,
      entry => entry.coding,
      'openlm:arena:coding'
    );
    if (codingRankings.length > 0) {
      sources['openlm:arena:coding'] = codingRankings;
    }

    // Vision rankings
    const visionRankings = buildRankings(
      entries,
      entry => entry.vision,
      'openlm:arena:vision'
    );
    if (visionRankings.length > 0) {
      sources['openlm:arena:vision'] = visionRankings;
    }

    // AAII rankings
    const aaiiRankings = buildRankings(
      entries,
      entry => entry.aaii,
      'openlm:arena:aaii'
    );
    if (aaiiRankings.length > 0) {
      sources['openlm:arena:aaii'] = aaiiRankings;
    }

    // MMLU-Pro rankings
    const mmluProRankings = buildRankings(
      entries,
      entry => entry.mmluPro,
      'openlm:arena:mmlu-pro'
    );
    if (mmluProRankings.length > 0) {
      sources['openlm:arena:mmlu-pro'] = mmluProRankings;
    }

    // ARC-AGI rankings
    const arcAgiRankings = buildRankings(
      entries,
      entry => entry.arcAgi,
      'openlm:arena:arc-agi'
    );
    if (arcAgiRankings.length > 0) {
      sources['openlm:arena:arc-agi'] = arcAgiRankings;
    }

    return sources;
  } catch (error) {
    console.error('Error fetching OpenLM Arena:', error);
    return {};
  }
}
