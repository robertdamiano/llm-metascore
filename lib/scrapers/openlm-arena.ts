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
      const arenaRankings = entries
        .filter(e => e.arenaElo !== null)
        .sort((a, b) => (b.arenaElo || 0) - (a.arenaElo || 0))
        .map((entry, index) => ({
          name: entry.name,
          rank: index + 1,
          source: 'openlm:arena:overall',
        }));
      sources['openlm:arena:overall'] = arenaRankings;
    }

    // Coding rankings
    const codingEntries = entries.filter(e => e.coding !== null);
    if (codingEntries.length > 0) {
      const codingRankings = codingEntries
        .sort((a, b) => (b.coding || 0) - (a.coding || 0))
        .map((entry, index) => ({
          name: entry.name,
          rank: index + 1,
          source: 'openlm:arena:coding',
        }));
      sources['openlm:arena:coding'] = codingRankings;
    }

    // Vision rankings
    const visionEntries = entries.filter(e => e.vision !== null);
    if (visionEntries.length > 0) {
      const visionRankings = visionEntries
        .sort((a, b) => (b.vision || 0) - (a.vision || 0))
        .map((entry, index) => ({
          name: entry.name,
          rank: index + 1,
          source: 'openlm:arena:vision',
        }));
      sources['openlm:arena:vision'] = visionRankings;
    }

    // AAII rankings
    const aaiiEntries = entries.filter(e => e.aaii !== null);
    if (aaiiEntries.length > 0) {
      const aaiiRankings = aaiiEntries
        .sort((a, b) => (b.aaii || 0) - (a.aaii || 0))
        .map((entry, index) => ({
          name: entry.name,
          rank: index + 1,
          source: 'openlm:arena:aaii',
        }));
      sources['openlm:arena:aaii'] = aaiiRankings;
    }

    // MMLU-Pro rankings
    const mmluProEntries = entries.filter(e => e.mmluPro !== null);
    if (mmluProEntries.length > 0) {
      const mmluProRankings = mmluProEntries
        .sort((a, b) => (b.mmluPro || 0) - (a.mmluPro || 0))
        .map((entry, index) => ({
          name: entry.name,
          rank: index + 1,
          source: 'openlm:arena:mmlu-pro',
        }));
      sources['openlm:arena:mmlu-pro'] = mmluProRankings;
    }

    // ARC-AGI rankings
    const arcAgiEntries = entries.filter(e => e.arcAgi !== null);
    if (arcAgiEntries.length > 0) {
      const arcAgiRankings = arcAgiEntries
        .sort((a, b) => (b.arcAgi || 0) - (a.arcAgi || 0))
        .map((entry, index) => ({
          name: entry.name,
          rank: index + 1,
          source: 'openlm:arena:arc-agi',
        }));
      sources['openlm:arena:arc-agi'] = arcAgiRankings;
    }

    return sources;
  } catch (error) {
    console.error('Error fetching OpenLM Arena:', error);
    return {};
  }
}
