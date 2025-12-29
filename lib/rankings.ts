import { ModelEntry, AggregatedEntry, SourceKey, LeaderboardConfig, FetchAllSourcesResult, SourceFetchResult } from './types';
import { identifyCreator, ALLOWED_CREATORS } from './vendors';
import { aggregateAverageRank } from './aggregation';
import { fetchLMArenaAllSources } from './scrapers/lmarena';
import { fetchArtificialAnalysis } from './scrapers/artificial-analysis';
import { fetchSWEBench } from './scrapers/swebench';

// Leaderboard definitions
const GENERAL_INTELLIGENCE: LeaderboardConfig = {
  name: 'General Intelligence',
  description: 'LMArena (Text/Vision/Search) + AA Omniscience + AA Hallucination',
  sources: [
    'lmarena:text',
    'lmarena:vision',
    'lmarena:search',
    'aa:omniscience',
    'aa:hallucination',
  ],
  minLabsRequired: 3,
};

const CODING: LeaderboardConfig = {
  name: 'Coding',
  description: 'LMArena WebDev + SWE-bench Bash + AA Coding + AA Agentic',
  sources: [
    'lmarena:webdev',
    'swebench:bash',
    'aa:coding',
    'aa:agentic',
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

export async function fetchAllSources(): Promise<FetchAllSourcesResult> {
  const sourceResults: SourceFetchResult[] = [];
  const sources: Record<string, ModelEntry[]> = {};

  // Fetch LMArena sources with individual error handling
  try {
    const lmarenaData = await fetchLMArenaAllSources();
    for (const [sourceKey, entries] of Object.entries(lmarenaData)) {
      sources[sourceKey] = entries;
      sourceResults.push({
        source: sourceKey as SourceKey,
        status: 'success',
        entries,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    const lmarenaSources: SourceKey[] = ['lmarena:text', 'lmarena:vision', 'lmarena:search', 'lmarena:webdev'];
    for (const source of lmarenaSources) {
      sourceResults.push({
        source,
        status: 'failed',
        entries: [],
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Fetch Artificial Analysis sources with individual error handling
  try {
    const aaData = await fetchArtificialAnalysis();
    for (const [sourceKey, entries] of Object.entries(aaData)) {
      sources[sourceKey] = entries;
      sourceResults.push({
        source: sourceKey as SourceKey,
        status: 'success',
        entries,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    const aaSources: SourceKey[] = ['aa:omniscience', 'aa:hallucination', 'aa:coding', 'aa:agentic'];
    for (const source of aaSources) {
      sourceResults.push({
        source,
        status: 'failed',
        entries: [],
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Fetch SWE-bench sources with individual error handling
  try {
    const swebenchData = await fetchSWEBench();
    for (const [sourceKey, entries] of Object.entries(swebenchData)) {
      sources[sourceKey] = entries;
      sourceResults.push({
        source: sourceKey as SourceKey,
        status: 'success',
        entries,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    const swebenchSources: SourceKey[] = ['swebench:bash'];
    for (const source of swebenchSources) {
      sourceResults.push({
        source,
        status: 'failed',
        entries: [],
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  }

  return { sources, sourceResults };
}

export async function fetchGeneralRankings(): Promise<AggregatedEntry[]> {
  const { sources } = await fetchAllSources();

  return buildGeneralRankings(sources);
}

export async function fetchCodingRankings(): Promise<AggregatedEntry[]> {
  const { sources } = await fetchAllSources();

  return buildCodingRankings(sources);
}

export function buildGeneralRankings(
  allSources: Record<string, ModelEntry[]>
): AggregatedEntry[] {
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

export function buildCodingRankings(
  allSources: Record<string, ModelEntry[]>
): AggregatedEntry[] {
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
