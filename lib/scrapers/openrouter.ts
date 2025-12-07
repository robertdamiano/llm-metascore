import * as cheerio from 'cheerio';
import { ModelEntry } from '../types';

export async function fetchOpenRouterTopApps(): Promise<ModelEntry[]> {
  try {
    // Fetch the rankings page
    // The URL fragment #apps indicates we want the apps tab
    // "this week" should be the default or we might need to parse it differently
    const response = await fetch('https://openrouter.ai/rankings', {
      cache: 'no-store',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch OpenRouter: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const entries: ModelEntry[] = [];

    // The page structure might have multiple tables or sections
    // We need to find the "Apps" section with "This Week" data
    // This is a best-effort scraper and may need adjustment based on actual HTML

    // Look for tables in the page
    $('table').each((_tableIndex, table) => {
      const $table = $(table);

      // Parse all tables and we'll filter later
      $table.find('tbody tr, tr').each((index, row) => {
        const $row = $(row);
        const cells = $row.find('td, th');

        if (cells.length < 2) return;

        // Try to extract rank and model name
        // Common patterns: Rank | Model | Author | ...
        const firstCell = $(cells[0]).text().trim();
        const secondCell = $(cells[1]).text().trim();

        // Skip header rows
        if (firstCell.toLowerCase().includes('rank') ||
            secondCell.toLowerCase().includes('model')) {
          return;
        }

        // Try to determine which cell has the rank and model
        let rank: number;
        let modelName: string;

        const firstDigits = firstCell.replace(/\D/g, '');
        if (firstDigits && parseInt(firstDigits, 10) > 0) {
          // First cell looks like a rank
          rank = parseInt(firstDigits, 10);
          modelName = secondCell;
        } else {
          // Maybe second cell is rank?
          const secondDigits = secondCell.replace(/\D/g, '');
          if (secondDigits && parseInt(secondDigits, 10) > 0) {
            rank = parseInt(secondDigits, 10);
            modelName = firstCell;
          } else {
            // Fallback: use row index
            rank = index + 1;
            modelName = secondCell || firstCell;
          }
        }

        if (!modelName) return;

        entries.push({
          name: modelName,
          rank,
          source: 'openrouter:apps:this-week',
        });
      });
    });

    // Sort by rank
    entries.sort((a, b) => a.rank - b.rank);

    // Deduplicate
    const seen = new Set<string>();
    const dedup: ModelEntry[] = [];
    for (const entry of entries) {
      if (seen.has(entry.name)) continue;
      seen.add(entry.name);
      dedup.push(entry);
    }

    // Return top entries (there might be duplicates from multiple tables)
    return dedup.slice(0, 50); // Limit to top 50

  } catch (error) {
    console.error('Error fetching OpenRouter top apps:', error);
    return [];
  }
}
