import { ModelEntry, AggregatedEntry, SourceKey, LeaderboardConfig } from './types';
import { identifyCreator, ALLOWED_CREATORS } from './vendors';
import { aggregateAverageRank } from './aggregation';
import { fetchOpenLMArena } from './scrapers/openlm-arena';
import { fetchOpenLMSWEBench } from './scrapers/openlm-swebench';
import { fetchLMArenaAllSources } from './scrapers/lmarena';
import { fetchValsAI } from './scrapers/vals';

// Leaderboard definitions
const GENERAL_INTELLIGENCE: LeaderboardConfig = {
  name: 'General Intelligence',
  description: 'Arena Elo (overall/vision) + LMArena Search + MMLU-Pro + ARC-AGI + AAII',
  sources: [
    'openlm:arena:overall',
    'openlm:arena:vision',
    'lmarena:search',
    'openlm:arena:aaii',
    'openlm:arena:mmlu-pro',
    'openlm:arena:arc-agi',
  ],
  minLabsRequired: 3,
};

const CODING: LeaderboardConfig = {
  name: 'Coding',
  description: 'WebDev + Arena Coding + SWE-bench + IOI + Vibe Code',
  sources: [
    'lmarena:webdev',
    'openlm:arena:coding',
    'openlm:swebench',
    'openlm:ioi',
    'vals:vibe-code',
  ],
  minLabsRequired: 3,
};

function bestByCreatorEntries(entries: ModelEntry[]): Array<[string, number]> {
  const creatorRanks = new Map<string, number>();

  for (const entry of entries) {
    const creator = identifyCreator(entry.name);
    if (!ALLOWED_CREATORS.has(creator)) {
      continue;
    }

    const currentBest = creatorRanks.get(creator) ?? 1_000_000;
    creatorRanks.set(creator, Math.min(currentBest, entry.rank));
  }

  if (creatorRanks.size === 0) {
    return [];
  }

  // Dense, tie-preserving re-ranking
  const uniqueRanks = Array.from(new Set(creatorRanks.values())).sort((a, b) => a - b);
  const denseMap = new Map(uniqueRanks.map((rank, index) => [rank, index + 1]));

  return Array.from(creatorRanks.entries())
    .map(([name, rank]): [string, number] => [name, denseMap.get(rank)!])
    .sort((a, b) => {
      if (a[1] !== b[1]) return a[1] - b[1];
      return a[0].localeCompare(b[0]);
    });
}

// Filter sources that have representation from at least N of the 4 labs
function filterSourcesByLabCoverage(
  allSources: Record<string, ModelEntry[]>,
  requiredSources: SourceKey[],
  minLabs: number
): Record<string, ModelEntry[]> {
  const filtered: Record<string, ModelEntry[]> = {};

  for (const sourceKey of requiredSources) {
    const entries = allSources[sourceKey];
    if (!entries || entries.length === 0) continue;

    // Count how many of the 4 labs are represented
    const labsPresent = new Set<string>();
    for (const entry of entries) {
      const creator = identifyCreator(entry.name);
      if (ALLOWED_CREATORS.has(creator)) {
        labsPresent.add(creator);
      }
    }

    if (labsPresent.size >= minLabs) {
      filtered[sourceKey] = entries;
    }
  }

  return filtered;
}

export async function fetchAllSources(): Promise<Record<string, ModelEntry[]>> {
  const [openlmArena, openlmSWE, lmarena, vals] = await Promise.all([
    fetchOpenLMArena(),
    fetchOpenLMSWEBench(),
    fetchLMArenaAllSources(),
    fetchValsAI(),
  ]);

  return {
    ...openlmArena,
    ...openlmSWE,
    ...lmarena,
    ...vals,
  };
}

export async function fetchGeneralRankings(): Promise<AggregatedEntry[]> {
  const allSources = await fetchAllSources();

  const validSources = filterSourcesByLabCoverage(
    allSources,
    GENERAL_INTELLIGENCE.sources,
    GENERAL_INTELLIGENCE.minLabsRequired
  );

  const rankedSources: Record<string, Array<[string, number]>> = {};
  for (const [key, entries] of Object.entries(validSources)) {
    rankedSources[key] = bestByCreatorEntries(entries);
  }

  const aggregated = aggregateAverageRank(rankedSources);
  return aggregated.filter(e => ALLOWED_CREATORS.has(e.name));
}

export async function fetchCodingRankings(): Promise<AggregatedEntry[]> {
  const allSources = await fetchAllSources();

  const validSources = filterSourcesByLabCoverage(
    allSources,
    CODING.sources,
    CODING.minLabsRequired
  );

  const rankedSources: Record<string, Array<[string, number]>> = {};
  for (const [key, entries] of Object.entries(validSources)) {
    rankedSources[key] = bestByCreatorEntries(entries);
  }

  const aggregated = aggregateAverageRank(rankedSources);
  return aggregated.filter(e => ALLOWED_CREATORS.has(e.name));
}
