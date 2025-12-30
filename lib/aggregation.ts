import { AggregatedEntry, RankingOverride, RankingMode } from './types';
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

/**
 * Applies aggregated ranking overrides to final aggregated rankings.
 * Overrides directly set the aggregatedRank for specific creators.
 */
export function applyAggregatedOverrides(
  aggregated: AggregatedEntry[],
  mode: RankingMode,
  overrides: RankingOverride[]
): AggregatedEntry[] {
  const target = `aggregated:${mode}`;

  // Filter overrides for this aggregated target
  const aggregatedOverrides = overrides.filter(
    override => override.target === target
  );

  if (aggregatedOverrides.length === 0) {
    return aggregated;
  }

  // Build override map: creator name -> override rank
  const overrideMap = new Map<string, number>();
  for (const override of aggregatedOverrides) {
    overrideMap.set(override.creatorName, override.overrideRank);
  }

  // Apply overrides to aggregated rankings
  const modified = aggregated.map(entry => {
    const overrideRank = overrideMap.get(entry.name);
    if (overrideRank !== undefined) {
      return {
        ...entry,
        aggregatedRank: overrideRank,
      };
    }
    return entry;
  });

  // Re-sort by aggregated rank after applying overrides
  modified.sort((a, b) => a.aggregatedRank - b.aggregatedRank);

  return modified;
}
