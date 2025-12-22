import * as cheerio from 'cheerio';
import { ModelEntry } from '../types';

interface ParsedTable {
  section: string;
  headers: string[];
  rows: string[][];
}

function parseMarkdownTables(html: string): ParsedTable[] {
  const $ = cheerio.load(html);
  const tables: ParsedTable[] = [];

  // Find all tables and associate them with their nearest preceding heading
  $('table').each((_, tableEl) => {
    const $table = $(tableEl);

    // Find nearest preceding heading
    let section = '';
    let $prev = $table.prev();
    for (let i = 0; i < 10 && $prev.length > 0; i++) {
      const tagName = $prev.prop('tagName')?.toLowerCase();
      if (tagName && ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
        section = $prev.text().trim();
        break;
      }
      $prev = $prev.prev();
    }

    // Parse headers
    const headers: string[] = [];
    $table.find('thead th, thead td').each((_, th) => {
      headers.push($(th).text().trim());
    });

    // Parse rows
    const rows: string[][] = [];
    $table.find('tbody tr').each((_, tr) => {
      const row: string[] = [];
      $(tr).find('td, th').each((_, td) => {
        row.push($(td).text().trim());
      });
      if (row.length > 0) {
        rows.push(row);
      }
    });

    if (headers.length > 0 && rows.length > 0) {
      tables.push({ section, headers, rows });
    }
  });

  return tables;
}

// Unused - kept for potential future use
// function parseOverviewColumn(tables: ParsedTable[], columnName: string): ModelEntry[] {
//   // Find "Arena Overview" or similar table
//   const overviewTable = tables.find(t =>
//     t.section.toLowerCase().includes('arena') &&
//     t.section.toLowerCase().includes('overview')
//   );
//
//   if (!overviewTable) {
//     return [];
//   }
//
//   const headersLower = overviewTable.headers.map(h => h.toLowerCase());
//   const nameIdx = headersLower.findIndex(h => h.includes('model'));
//   const colIdx = headersLower.findIndex(h => h === columnName.toLowerCase());
//
//   if (nameIdx === -1 || colIdx === -1) {
//     return [];
//   }
//
//   const entries: ModelEntry[] = [];
//   for (const row of overviewTable.rows) {
//     if (row.length <= Math.max(nameIdx, colIdx)) continue;
//
//     const name = row[nameIdx].trim();
//     const val = row[colIdx].trim();
//
//     if (!name) continue;
//
//     const digits = val.replace(/\D/g, '');
//     if (!digits) continue;
//
//     const rank = parseInt(digits, 10);
//     entries.push({
//       name,
//       rank,
//       source: `lmarena:overview:${columnName}`,
//     });
//   }
//
//   entries.sort((a, b) => a.rank - b.rank);
//   return entries;
// }

function parseCategoryLeaderboard(tables: ParsedTable[], category: string): ModelEntry[] {
  const table = tables.find(t =>
    t.section.toLowerCase().includes(category.toLowerCase())
  );

  if (!table) {
    return [];
  }

  const headersLower = table.headers.map(h => h.toLowerCase());
  const nameIdx = headersLower.findIndex(h => h.includes('model'));
  const rankIdx = headersLower.findIndex(h => h.includes('rank'));

  const actualNameIdx = nameIdx !== -1 ? nameIdx : 1;
  const actualRankIdx = rankIdx !== -1 ? rankIdx : 0;

  const entries: ModelEntry[] = [];
  for (const row of table.rows) {
    if (row.length <= Math.max(actualNameIdx, actualRankIdx)) continue;

    const name = row[actualNameIdx].trim();
    if (!name) continue;

    const rankVal = row[actualRankIdx].replace(/[#\s]/g, '');
    const digits = rankVal.replace(/\D/g, '');
    const rank = digits ? parseInt(digits, 10) : entries.length + 1;

    entries.push({
      name,
      rank,
      source: `lmarena:${category}`,
    });
  }

  entries.sort((a, b) => a.rank - b.rank);
  return entries;
}

export async function fetchLMArenaAllSources(): Promise<Record<string, ModelEntry[]>> {
  try {
    const response = await fetch('https://lmarena.ai/leaderboard', {
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch LMArena: ${response.status}`);
    }

    const html = await response.text();
    const tables = parseMarkdownTables(html);

    const sources: Record<string, ModelEntry[]> = {};

    // Category leaderboards for general intelligence
    const textEntries = parseCategoryLeaderboard(tables, 'Text');
    if (textEntries.length > 0) {
      sources['lmarena:text'] = textEntries.map(e => ({ ...e, source: 'lmarena:text' }));
    }

    const visionEntries = parseCategoryLeaderboard(tables, 'Vision');
    if (visionEntries.length > 0) {
      sources['lmarena:vision'] = visionEntries.map(e => ({ ...e, source: 'lmarena:vision' }));
    }

    const searchEntries = parseCategoryLeaderboard(tables, 'Search');
    if (searchEntries.length > 0) {
      sources['lmarena:search'] = searchEntries.map(e => ({ ...e, source: 'lmarena:search' }));
    }

    // WebDev category for coding
    const webdevEntries = parseCategoryLeaderboard(tables, 'WebDev');
    if (webdevEntries.length > 0) {
      sources['lmarena:webdev'] = webdevEntries.map(e => ({ ...e, source: 'lmarena:webdev' }));
    }

    return sources;
  } catch (error) {
    console.error('Error fetching LMArena sources:', error);
    return {};
  }
}
