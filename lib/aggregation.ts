import { AggregatedEntry } from './types';
import { ALLOWED_CREATORS } from './vendors';

export function aggregateAverageRank(
  sources: Record<string, Array<[string, number]>>
): AggregatedEntry[] {
  // Drop sources with no data to avoid biasing ranks
  const validSources = Object.fromEntries(
    Object.entries(sources).filter(([_, pairs]) => pairs.length > 0)
  );

  if (Object.keys(validSources).length === 0) {
    return [];
  }

  // Determine max rank per source
  const maxRanks: Record<string, number> = {};
  for (const [src, pairs] of Object.entries(validSources)) {
    maxRanks[src] = Math.max(...pairs.map(([_, rank]) => rank), 0);
  }

  // Collect all model names
  const modelNames = new Set<string>();
  for (const pairs of Object.values(validSources)) {
    for (const [name, _] of pairs) {
      modelNames.add(name);
    }
  }

  // Ensure we always include the allowed creators
  for (const creator of ALLOWED_CREATORS) {
    modelNames.add(creator);
  }

  // Build fast lookup per source
  const lookup: Record<string, Record<string, number>> = {};
  for (const [src, pairs] of Object.entries(validSources)) {
    lookup[src] = Object.fromEntries(pairs);
  }

  // Aggregate ranks
  const aggregated: AggregatedEntry[] = [];
  for (const name of modelNames) {
    const ranks: Record<string, number> = {};
    let total = 0;
    let count = 0;

    for (const src of Object.keys(validSources)) {
      let rank = lookup[src][name];
      if (rank === undefined) {
        rank = maxRanks[src] + 1;
      }
      ranks[src] = rank;
      total += rank;
      count += 1;
    }

    aggregated.push({
      name,
      ranks,
      aggregatedRank: count > 0 ? total / count : 0,
    });
  }

  // Sort by aggregated rank
  aggregated.sort((a, b) => a.aggregatedRank - b.aggregatedRank);

  return aggregated;
}
