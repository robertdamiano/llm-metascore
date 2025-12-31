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
  | 'aa:longcontext'
  | 'aa:ifbench'
  | 'aa:livecodebench'
  | 'aa:scicode'
  | 'aa:terminalbench'
  | 'aa:tau2'
  | 'aa:gpqa'
  // LiveBench sources (from livebench.ai)
  | 'livebench:global'
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

// Source fetch status tracking
export type SourceStatus = 'success' | 'failed' | 'cached';

export interface SourceFetchResult {
  source: SourceKey;
  status: SourceStatus;
  entries: ModelEntry[];
  error?: string;
  timestamp?: string;
}

export interface FetchAllSourcesResult {
  sources: Record<string, ModelEntry[]>;
  sourceResults: SourceFetchResult[];
}

// Override target - can be per-source or aggregated
export type OverrideTarget = SourceKey | 'aggregated:general' | 'aggregated:coding';

// Ranking override stored in Firestore
export interface RankingOverride {
  id: string; // Firestore auto-generated document ID
  target: OverrideTarget; // Which source or aggregated ranking to override
  mode: RankingMode; // Which mode this override applies to (general or coding)
  creatorName: string; // 'OpenAI' | 'Google' | 'Anthropic' | 'xAI'
  overrideRank: number; // The rank to set
  createdAt: Date; // When the override was created
  updatedAt: Date; // When the override was last updated
  reason?: string; // Optional note explaining why the override was made
}
