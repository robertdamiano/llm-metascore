export interface ModelEntry {
  name: string;
  rank: number;
  score?: number;
  source: string;
}

export interface AggregatedEntry {
  name: string;
  ranks: Record<string, number>;
  aggregatedRank: number;
}

export type RankingMode = 'general' | 'coding' | 'apps';
