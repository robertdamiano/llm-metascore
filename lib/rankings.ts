import { ModelEntry, AggregatedEntry } from './types';
import { identifyCreator, ALLOWED_CREATORS } from './vendors';
import { aggregateAverageRank } from './aggregation';
import { fetchLMArenaGeneralSources, fetchLMArenaCodingSources } from './scrapers/lmarena';
import { fetchSWEBenchBashOnly } from './scrapers/swebench';
import { fetchOpenRouterTopApps } from './scrapers/openrouter';

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

export async function fetchGeneralRankings(): Promise<AggregatedEntry[]> {
  const sourcesRaw = await fetchLMArenaGeneralSources();

  const sources: Record<string, Array<[string, number]>> = {};
  for (const [src, entries] of Object.entries(sourcesRaw)) {
    if (entries.length > 0) {
      sources[src] = bestByCreatorEntries(entries);
    }
  }

  const aggregated = aggregateAverageRank(sources);

  // Filter to only allowed creators
  return aggregated.filter(e => ALLOWED_CREATORS.has(e.name));
}

export async function fetchCodingRankings(): Promise<AggregatedEntry[]> {
  const [arenaSources, sweBenchEntries] = await Promise.all([
    fetchLMArenaCodingSources(),
    fetchSWEBenchBashOnly(),
  ]);

  const sources: Record<string, Array<[string, number]>> = {};

  // Add LMArena coding sources
  for (const [src, entries] of Object.entries(arenaSources)) {
    sources[src] = bestByCreatorEntries(entries);
  }

  // Add SWE Bench
  if (sweBenchEntries.length > 0) {
    sources['swebench:bash-only'] = bestByCreatorEntries(sweBenchEntries);
  }

  const aggregated = aggregateAverageRank(sources);

  return aggregated.filter(e => ALLOWED_CREATORS.has(e.name));
}

export async function fetchTopAppsRankings(): Promise<AggregatedEntry[]> {
  const entries = await fetchOpenRouterTopApps();

  if (entries.length === 0) {
    return [];
  }

  const sources: Record<string, Array<[string, number]>> = {
    'openrouter:apps:this-week': bestByCreatorEntries(entries),
  };

  const aggregated = aggregateAverageRank(sources);

  return aggregated.filter(e => ALLOWED_CREATORS.has(e.name));
}
