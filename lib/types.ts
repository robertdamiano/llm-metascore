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

export type RankingMode = 'general' | 'coding';

// Source identifiers for all data sources
export type SourceKey =
  // LMArena sources (from lmarena.ai/leaderboard)
  | 'lmarena:text'
  | 'lmarena:vision'
  | 'lmarena:webdev'
  | 'lmarena:search'
  // Artificial Analysis sources (from artificialanalysis.ai)
  | 'aa:omniscience'
  | 'aa:hallucination'
  | 'aa:coding'
  | 'aa:agentic'
  // SWE-bench sources (from swebench.com)
  | 'swebench:bash';

// Leaderboard category definitions
export interface LeaderboardConfig {
  name: string;
  description: string;
  sources: SourceKey[];
  minLabsRequired: number; // Default: 3 out of 4
}

// Cache entry structure for Firestore
export interface CachedRankingData {
  source: SourceKey;
  entries: ModelEntry[];
  fetchedAt: Date;
  expiresAt: Date;
}
