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
  // OpenLM Arena sources (from openlm.ai/chatbot-arena)
  | 'openlm:arena:overall'
  | 'openlm:arena:coding'
  | 'openlm:arena:vision'
  | 'openlm:arena:aaii'
  | 'openlm:arena:mmlu-pro'
  | 'openlm:arena:arc-agi'
  // OpenLM SWE-bench sources (from openlm.ai/swe-bench)
  | 'openlm:swebench'
  | 'openlm:ioi'
  // LMArena sources (from lmarena.ai/leaderboard)
  | 'lmarena:text'
  | 'lmarena:vision'
  | 'lmarena:webdev'
  | 'lmarena:search'
  // Vals.ai sources (partial data)
  | 'vals:vibe-code';

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
