import * as cheerio from 'cheerio';
import { ModelEntry } from '../types';

export async function fetchSWEBenchBashOnly(): Promise<ModelEntry[]> {
  try {
    const response = await fetch('https://www.swebench.com/', {
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch SWE Bench: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const entries: ModelEntry[] = [];

    // Find the leaderboard table
    // The default view shows "bash only" by default
    $('table tbody tr').each((index, row) => {
      const $row = $(row);
      const cells = $row.find('td, th');

      if (cells.length < 2) return;

      // Typically: Rank | Model | ... other columns
      const rankCell = $(cells[0]).text().trim();
      const modelCell = $(cells[1]).text().trim();

      if (!modelCell) return;

      // Extract rank number
      const rankDigits = rankCell.replace(/\D/g, '');
      const rank = rankDigits ? parseInt(rankDigits, 10) : index + 1;

      entries.push({
        name: modelCell,
        rank,
        source: 'swebench:bash-only',
      });
    });

    // If we didn't find entries in tbody, try looking for them differently
    if (entries.length === 0) {
      $('table tr').each((index, row) => {
        const $row = $(row);
        const cells = $row.find('td');

        if (cells.length < 2) return;

        const rankCell = $(cells[0]).text().trim();
        const modelCell = $(cells[1]).text().trim();

        if (!modelCell || modelCell.toLowerCase().includes('model')) return;

        const rankDigits = rankCell.replace(/\D/g, '');
        const rank = rankDigits ? parseInt(rankDigits, 10) : index + 1;

        entries.push({
          name: modelCell,
          rank,
          source: 'swebench:bash-only',
        });
      });
    }

    entries.sort((a, b) => a.rank - b.rank);

    // Deduplicate by name, keep first occurrence
    const seen = new Set<string>();
    const dedup: ModelEntry[] = [];
    for (const entry of entries) {
      if (seen.has(entry.name)) continue;
      seen.add(entry.name);
      dedup.push(entry);
    }

    return dedup;
  } catch (error) {
    console.error('Error fetching SWE Bench:', error);
    return [];
  }
}
