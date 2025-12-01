import { ModelEntry, AggregatedEntry } from './types';
import { identifyCreator, ALLOWED_CREATORS } from './vendors';
import { aggregateAverageRank } from './aggregation';
import { fetchOpenLMArena } from './scrapers/openlm-arena';
import { fetchOpenLMSWEBench } from './scrapers/openlm-swebench';

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
  const sourcesRaw = await fetchOpenLMArena();

  const sources: Record<string, Array<[string, number]>> = {};

  // Arena Elo overall ranking
  const arenaEloEntries = sourcesRaw['openlm:arena:overall'];
  if (arenaEloEntries && arenaEloEntries.length > 0) {
    sources['openlm:arena:overall'] = bestByCreatorEntries(arenaEloEntries);
  }

  const aggregated = aggregateAverageRank(sources);
  return aggregated.filter(e => ALLOWED_CREATORS.has(e.name));
}

export async function fetchCodingRankings(): Promise<AggregatedEntry[]> {
  const [arenaSourcesRaw, sweBenchSourcesRaw] = await Promise.all([
    fetchOpenLMArena(),
    fetchOpenLMSWEBench(),
  ]);

  const sources: Record<string, Array<[string, number]>> = {};

  // Arena Coding score
  const codingEntries = arenaSourcesRaw['openlm:arena:coding'];
  if (codingEntries && codingEntries.length > 0) {
    sources['openlm:arena:coding'] = bestByCreatorEntries(codingEntries);
  }

  // SWE-bench verified score
  const sweBenchEntries = sweBenchSourcesRaw['openlm:swebench'];
  if (sweBenchEntries && sweBenchEntries.length > 0) {
    sources['openlm:swebench'] = bestByCreatorEntries(sweBenchEntries);
  }

  const aggregated = aggregateAverageRank(sources);

  return aggregated.filter(e => ALLOWED_CREATORS.has(e.name));
}
