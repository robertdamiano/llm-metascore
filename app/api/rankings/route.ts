import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import {
  fetchAllSources,
  buildGeneralRankings,
  buildCodingRankings,
  applyPerSourceOverrides,
} from '@/lib/rankings';
import { ModelEntry, SourceFetchResult, SourceKey, RankingOverride, RankingMode, OverrideTarget } from '@/lib/types';
import { applyAggregatedOverrides } from '@/lib/aggregation';

// Initialize Firebase Admin (if not already)
if (!getApps().length) {
  // In production (GCP), use Application Default Credentials
  // In local dev, use service account JSON from environment variable
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    initializeApp({
      credential: cert(serviceAccount),
    });
  } else {
    // Production: automatically uses GCP service account
    initializeApp({
      credential: applicationDefault(),
    });
  }
}

const db = getFirestore();

async function getRankingsFromCache(mode: string) {
  try {
    const cachedDoc = await db.collection('rankings_aggregated').doc(mode).get();

    if (!cachedDoc.exists) {
      return null;
    }

    const data = cachedDoc.data();
    const expiresAt = data?.expiresAt?.toDate();

    if (!expiresAt || new Date() > expiresAt) {
      return null; // Cache expired
    }

    // Fetch per-source timestamps from rankings_cache (only for this mode)
    const sourceTimestamps = await getSourceTimestamps(mode);

    return {
      rankings: data?.rankings,
      cached: true,
      fetchedAt: data?.fetchedAt?.toDate().toISOString(),
      sourceTimestamps,
    };
  } catch (error) {
    console.error('Error reading from cache:', error);
    return null;
  }
}

async function getSourceTimestamps(mode?: string): Promise<Record<string, string>> {
  try {
    const timestamps: Record<string, string> = {};

    // If mode is specified, only fetch timestamps for sources in that mode
    const sourcesToFetch = mode ? SOURCES_PER_MODE[mode] || [] : [];

    if (sourcesToFetch.length > 0) {
      // Batch get specific documents instead of scanning entire collection
      const refs = sourcesToFetch.map(source => db.collection('rankings_cache').doc(source));
      const docs = await db.getAll(...refs);

      docs.forEach(doc => {
        if (doc.exists) {
          const data = doc.data();
          if (data?.fetchedAt) {
            timestamps[doc.id] = data.fetchedAt.toDate().toISOString();
          }
        }
      });
    } else {
      // Fallback: scan entire collection (for backward compatibility)
      const snapshot = await db.collection('rankings_cache').get();
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data?.fetchedAt) {
          timestamps[doc.id] = data.fetchedAt.toDate().toISOString();
        }
      });
    }

    return timestamps;
  } catch (error) {
    console.error('Error fetching source timestamps:', error);
    return {};
  }
}

const SOURCES_PER_MODE: Record<string, string[]> = {
  general: [
    'lmarena:text',
    'lmarena:vision',
    'lmarena:search',
    'aa:omniscience',
    'aa:hallucination',
  ],
  coding: [
    'lmarena:webdev',
    'swebench:bash',
    'aa:coding',
    'aa:agentic',
  ],
};

async function mergeCachedSources(
  allSources: Record<string, ModelEntry[]>,
  mode: string,
  sourceResults: SourceFetchResult[]
): Promise<{ mergedSources: Record<string, ModelEntry[]>; sourceHealth: SourceFetchResult[] }> {
  const sources = SOURCES_PER_MODE[mode] || [];
  if (sources.length === 0) return { mergedSources: allSources, sourceHealth: sourceResults };

  const refs = sources.map(source => db.collection('rankings_cache').doc(source));
  const docs = await db.getAll(...refs);
  const cachedBySource = new Map<string, { entries: ModelEntry[], timestamp: string }>();

  docs.forEach(doc => {
    if (!doc.exists) return;
    const data = doc.data();
    const entries = (data?.entries ?? []) as ModelEntry[];
    const timestamp = data?.fetchedAt?.toDate().toISOString() ?? new Date().toISOString();
    if (entries.length > 0) {
      cachedBySource.set(doc.id, { entries, timestamp });
    }
  });

  const mergedSources = { ...allSources };
  const sourceHealth: SourceFetchResult[] = [];

  for (const source of sources) {
    const liveEntries = mergedSources[source] ?? [];
    const cached = cachedBySource.get(source);
    const cachedEntries = cached?.entries ?? [];
    const cachedTimestamp = cached?.timestamp;

    // Find the fetch result for this source
    const fetchResult = sourceResults.find(r => r.source === source);

    if (liveEntries.length > 0) {
      // Fresh data available
      sourceHealth.push({
        source: source as SourceKey,
        status: 'success',
        entries: liveEntries,
        timestamp: fetchResult?.timestamp ?? new Date().toISOString(),
      });
    } else if (cachedEntries.length > 0) {
      // No fresh data, using cache
      mergedSources[source] = cachedEntries;
      sourceHealth.push({
        source: source as SourceKey,
        status: 'cached',
        entries: cachedEntries,
        timestamp: cachedTimestamp,
      });
    } else {
      // No data at all (fresh fetch failed and no cache)
      sourceHealth.push({
        source: source as SourceKey,
        status: 'failed',
        entries: [],
        error: fetchResult?.error ?? 'No data available',
        timestamp: fetchResult?.timestamp ?? new Date().toISOString(),
      });
    }
  }

  return { mergedSources, sourceHealth };
}

async function writeRankingsToCache(mode: string, rankings: unknown) {
  try {
    const now = Timestamp.now();
    const ttlSeconds = 24 * 60 * 60;
    const expiresAt = Timestamp.fromMillis(now.toMillis() + ttlSeconds * 1000);

    await db.collection('rankings_aggregated').doc(mode).set({
      mode,
      rankings,
      fetchedAt: now,
      expiresAt,
    });
  } catch (error) {
    console.error('Error writing to cache:', error);
  }
}

async function fetchOverrides(): Promise<RankingOverride[]> {
  try {
    const snapshot = await db.collection('rankings_overrides').get();
    const overrides: RankingOverride[] = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      overrides.push({
        id: doc.id,
        target: data.target as OverrideTarget,
        mode: (data.mode as RankingMode) || 'general', // Default to general for backward compatibility
        creatorName: data.creatorName,
        overrideRank: data.overrideRank,
        createdAt: data.createdAt?.toDate() ?? new Date(),
        updatedAt: data.updatedAt?.toDate() ?? new Date(),
        reason: data.reason,
      });
    });

    return overrides;
  } catch (error) {
    console.error('Error fetching overrides:', error);
    return [];
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('mode') || 'general';
  const forceRefresh = searchParams.get('refresh') === 'true';

  try {
    let result;

    // Fetch overrides FIRST - we always need these
    const allOverrides = await fetchOverrides();

    // Filter overrides for the current mode
    const overrides = allOverrides.filter(override => override.mode === mode);

    // Check if there are any per-source overrides for this mode
    const relevantSources = mode === 'general'
      ? ['aa:omniscience', 'aa:hallucination', 'aa:gpqa', 'aa:ifbench', 'aa:longcontext', 'lmarena:text', 'lmarena:vision', 'lmarena:search', 'livebench:global']
      : ['aa:livecodebench', 'aa:scicode', 'aa:terminalbench', 'aa:tau2', 'aa:longcontext', 'aa:ifbench', 'lmarena:webdev', 'swebench:bash'];

    const hasPerSourceOverrides = overrides.some(override =>
      relevantSources.includes(override.target as string)
    );

    // If there are per-source overrides, we must rebuild from source data (can't use aggregated cache)
    const mustRebuild = hasPerSourceOverrides;

    if (!forceRefresh && !mustRebuild) {
      // Try to get from cache first (only if no per-source overrides)
      result = await getRankingsFromCache(mode);

      // If we got cached data, apply current aggregated overrides to it
      if (result && result.rankings) {
        result.rankings = applyAggregatedOverrides(
          result.rankings,
          mode as RankingMode,
          overrides
        );
      }
    }

    if (!result) {
      // Cache miss or expired - fetch fresh data
      const fetchResult = await fetchAllSources();
      const { mergedSources, sourceHealth } = await mergeCachedSources(
        fetchResult.sources,
        mode,
        fetchResult.sourceResults
      );

      // Apply per-source overrides BEFORE aggregation
      const { sources: overriddenSources, overridesBySource } = applyPerSourceOverrides(
        mergedSources,
        mode as RankingMode,
        overrides
      );

      // Build aggregated rankings
      let rankings;
      switch (mode) {
        case 'general': {
          rankings = buildGeneralRankings(overriddenSources, overridesBySource);
          break;
        }
        case 'coding': {
          rankings = buildCodingRankings(overriddenSources, overridesBySource);
          break;
        }
        default:
          return NextResponse.json(
            { error: 'Invalid mode. Must be: general or coding' },
            { status: 400 }
          );
      }

      // Apply aggregated overrides AFTER aggregation
      rankings = applyAggregatedOverrides(rankings, mode as RankingMode, overrides);

      // Build sourceTimestamps for backwards compatibility
      const sourceTimestamps: Record<string, string> = {};
      const staleSources: string[] = [];

      for (const health of sourceHealth) {
        if (health.timestamp) {
          sourceTimestamps[health.source] = health.timestamp;
        }
        if (health.status === 'cached' || health.status === 'failed') {
          staleSources.push(health.source);
        }
      }

      result = {
        rankings,
        cached: false,
        fetchedAt: new Date().toISOString(),
        sourceTimestamps,
        staleSources,
        sourceHealth, // New field with detailed status
      };

      await writeRankingsToCache(mode, rankings);
    }

    return NextResponse.json({
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching rankings:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
