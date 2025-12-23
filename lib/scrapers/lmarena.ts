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

interface NextDataModel {
  id: string;
  name: string;
  rating: number;
  votes: number;
  organization: string;
  rank?: number;
}

interface NextDataArena {
  arena: string;
  models: NextDataModel[];
  cutoff?: string;
}

function normalizeArenaKey(arena: string): string | null {
  const normalized = arena.toLowerCase();
  if (normalized.includes('webdev')) return 'webdev';
  if (normalized.includes('search')) return 'search';
  return null;
}

function parseRankValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const match = value.match(/\d+/);
  if (!match) return null;
  const parsed = parseInt(match[0], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNextData(html: string): Record<string, ModelEntry[]> {
  const $ = cheerio.load(html);
  const script = $('#__NEXT_DATA__').text().trim();
  const sources: Record<string, ModelEntry[]> = {};

  if (!script) {
    return sources;
  }

  try {
    const data = JSON.parse(script);
    const arenas: NextDataArena[] = [];

    const visit = (value: unknown) => {
      if (!value) return;
      if (Array.isArray(value)) {
        for (const item of value) visit(item);
        return;
      }
      if (typeof value !== 'object') return;

      const record = value as Record<string, unknown>;
      if (typeof record.arena === 'string' && Array.isArray(record.models)) {
        arenas.push(record as unknown as NextDataArena);
      }

      for (const child of Object.values(record)) {
        visit(child);
      }
    };

    visit(data);

    for (const arena of arenas) {
      const key = normalizeArenaKey(arena.arena);
      if (!key) continue;

      const candidates = arena.models
        .map((model, index) => {
          // Prefer publicName when available for display.
          const name =
            (model as { publicName?: string }).publicName ||
            model.name ||
            (model as { model?: string }).model ||
            (model as { displayName?: string }).displayName ||
            '';

          const rankValue =
            parseRankValue(model.rank) ??
            parseRankValue((model as { ranking?: unknown }).ranking) ??
            null;

          return {
            name: name.trim(),
            rank: rankValue,
            rating: model.rating,
            index,
          };
        })
        .filter(candidate => candidate.name);

      if (candidates.length === 0) continue;

      const hasAnyRank = candidates.some(candidate => typeof candidate.rank === 'number');
      const hasRating = candidates.some(candidate => typeof candidate.rating === 'number');

      if (hasAnyRank) {
        candidates.sort(
          (a, b) =>
            (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER)
        );
      } else if (hasRating) {
        candidates.sort((a, b) => (b.rating ?? -Infinity) - (a.rating ?? -Infinity));
      } else {
        console.warn(`LMArena __NEXT_DATA__ missing rank/rating for arena: ${arena.arena}`);
      }

      const missingRankCount = candidates.filter(candidate => candidate.rank == null).length;
      if (hasAnyRank && missingRankCount > 0) {
        console.warn(
          `LMArena __NEXT_DATA__ missing ${missingRankCount} ranks for arena: ${arena.arena}`
        );
      }

      const entries: ModelEntry[] = candidates.map((candidate, idx) => {
        const rank =
          typeof candidate.rank === 'number'
            ? candidate.rank
            : hasAnyRank
              ? 999
              : idx + 1;

        return {
          name: candidate.name,
          rank,
          source: `lmarena:${key}`,
        };
      });

      sources[`lmarena:${key}`] = entries;
    }
  } catch (error) {
    console.warn('Failed to parse LMArena __NEXT_DATA__ payload:', error);
  }

  return sources;
}

interface StreamingModel {
  id: string;
  name: string;
  publicName: string;
  organization: string;
  rank?: number;
  rankByModality?: Record<string, number>;
  capabilities?: {
    outputCapabilities?: Record<string, boolean>;
  };
}

function parseStreamingData(html: string): Record<string, ModelEntry[]> {
  const sources: Record<string, ModelEntry[]> = {};

  try {
    // Extract all self.__next_f.push calls
    // Use a more robust pattern that handles escaped quotes properly
    const pushRegex = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
    const allChunks: string[] = [];
    let match;

    while ((match = pushRegex.exec(html)) !== null) {
      allChunks.push(match[1]);
    }

    if (allChunks.length === 0) {
      console.warn('No streaming chunks found in LMArena page');
      return sources;
    }

    // Join all chunks and unescape the JSON
    let combinedData = allChunks.join('');
    combinedData = combinedData
      .replace(/\\"/g, '"')
      .replace(/\\n/g, '\n')
      .replace(/\\\\/g, '\\');

    // Extract model objects
    // Pattern: "publicName":"...","name":"...".{up to 500 chars}..."rank":N,"rankByModality":{...}
    const modelRegex = /"publicName":"([^"]+)","name":"([^"]+)".{1,500}?"rank":(\d+),"rankByModality":\{([^}]+)\}/g;
    let modelMatch;

    const modelsByModality: Record<string, StreamingModel[]> = {};

    while ((modelMatch = modelRegex.exec(combinedData)) !== null) {
      const publicName = modelMatch[1];
      const name = modelMatch[2];
      const rank = parseInt(modelMatch[3], 10);
      const rankByModalityStr = modelMatch[4];

      // Parse rankByModality to get which arena this model belongs to
      const modalityRanks: Record<string, number> = {};
      const modalityRegex = /"([^"]+)":(\d+)/g;
      let modalityMatch;

      while ((modalityMatch = modalityRegex.exec(rankByModalityStr)) !== null) {
        const modality = modalityMatch[1];
        const modalityRank = parseInt(modalityMatch[2], 10);

        // Skip very large ranks (9007199254740991 = not applicable)
        if (modalityRank < 1000) {
          modalityRanks[modality] = modalityRank;
        }
      }

      const model: StreamingModel = {
        id: '',
        name,
        publicName,
        organization: '', // Not extracted in this pattern
        rank,
        rankByModality: modalityRanks,
      };

      // Add model to each modality it participates in
      for (const [modality, modalityRank] of Object.entries(modalityRanks)) {
        if (!modelsByModality[modality]) {
          modelsByModality[modality] = [];
        }
        modelsByModality[modality].push({
          ...model,
          rank: modalityRank,
        });
      }
    }

    // Filter to only the modalities we care about and convert to ModelEntry format
    const wantedModalities = ['webdev', 'search'];

    for (const [modality, models] of Object.entries(modelsByModality)) {
      // Skip modalities we don't need
      if (!wantedModalities.includes(modality)) {
        continue;
      }

      // Sort by rank
      models.sort((a, b) => (a.rank || 999) - (b.rank || 999));

      const entries: ModelEntry[] = models.map(model => ({
        name: model.publicName || model.name,
        rank: model.rank || 999,
        source: `lmarena:${modality}`,
      }));

      sources[`lmarena:${modality}`] = entries;
    }

    console.log(`Extracted ${Object.keys(sources).length} LMArena sources:`, Object.keys(sources));
  } catch (error) {
    console.error('Error parsing LMArena streaming data:', error);
  }

  return sources;
}

function mergeSources(
  primary: Record<string, ModelEntry[]>,
  secondary: Record<string, ModelEntry[]>
): Record<string, ModelEntry[]> {
  const merged: Record<string, ModelEntry[]> = { ...primary };

  for (const [key, entries] of Object.entries(secondary)) {
    // Prefer the more complete list when fallbacks return more entries.
    if (!merged[key] || merged[key].length < entries.length) {
      merged[key] = entries;
    }
  }

  return merged;
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

    // Try __NEXT_DATA__ parsing first, then streaming data extraction
    const nextDataSources = parseNextData(html);
    const streamingSources = parseStreamingData(html);
    const sources = mergeSources(nextDataSources, streamingSources);

    // Only return streaming data if we got BOTH expected sources
    // Otherwise fall back to table parsing to avoid partial coverage
    const expectedSources = ['lmarena:search', 'lmarena:webdev'];
    const hasAllSources = expectedSources.every(src => sources[src]?.length > 0);

    if (hasAllSources) {
      return sources;
    }

    if (Object.keys(sources).length > 0) {
      console.warn('Streaming parsing returned partial data, falling back to table parsing');
    }

    // Fallback to table parsing (for backward compatibility)
    console.warn('Falling back to table parsing for LMArena');
    const tables = parseMarkdownTables(html);
    const fallbackSources: Record<string, ModelEntry[]> = {};

    // Only extract search and webdev (the ones we need)
    const searchEntries = parseCategoryLeaderboard(tables, 'Search');
    if (searchEntries.length > 0) {
      fallbackSources['lmarena:search'] = searchEntries.map(e => ({ ...e, source: 'lmarena:search' }));
    }

    const webdevEntries = parseCategoryLeaderboard(tables, 'WebDev');
    if (webdevEntries.length > 0) {
      fallbackSources['lmarena:webdev'] = webdevEntries.map(e => ({ ...e, source: 'lmarena:webdev' }));
    }

    return mergeSources(sources, fallbackSources);
  } catch (error) {
    console.error('Error fetching LMArena sources:', error);
    return {};
  }
}
