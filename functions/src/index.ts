import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin with Application Default Credentials
// In Cloud Functions, this automatically uses the service account
admin.initializeApp();

const db = admin.firestore();

// Import scraper functions - we need to compile lib/ scrapers or duplicate them
// For now, we'll import the TypeScript files directly and handle compilation
import { fetchAllSources, buildGeneralRankings, buildCodingRankings, applyPerSourceOverrides } from '../../lib/rankings';
import { ModelEntry, RankingOverride, OverrideTarget, RankingMode } from '../../lib/types';
import { applyAggregatedOverrides } from '../../lib/aggregation';

function mergeByName(existing: ModelEntry[], incoming: ModelEntry[]): ModelEntry[] {
  const merged = new Map<string, ModelEntry>();
  const normalize = (name: string) => name.trim().toLowerCase();

  for (const entry of existing) {
    if (!entry?.name) continue;
    merged.set(normalize(entry.name), entry);
  }

  for (const entry of incoming) {
    if (!entry?.name) continue;
    merged.set(normalize(entry.name), entry);
  }

  return Array.from(merged.values());
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

const ALL_SOURCES = Array.from(
  new Set([...SOURCES_PER_MODE.general, ...SOURCES_PER_MODE.coding])
);

async function mergeCachedSources(
  allSources: Record<string, ModelEntry[]>
): Promise<Record<string, ModelEntry[]>> {
  if (ALL_SOURCES.length === 0) return allSources;

  const refs = ALL_SOURCES.map(source => db.collection('rankings_cache').doc(source));
  const docs = await db.getAll(...refs);
  const cachedBySource = new Map<string, ModelEntry[]>();

  docs.forEach(doc => {
    if (!doc.exists) return;
    const entries = (doc.data()?.entries ?? []) as ModelEntry[];
    if (entries.length > 0) {
      cachedBySource.set(doc.id, entries);
    }
  });

  const mergedSources = { ...allSources };

  for (const source of ALL_SOURCES) {
    const liveEntries = mergedSources[source] ?? [];
    const cachedEntries = cachedBySource.get(source) ?? [];

    if (cachedEntries.length === 0) continue;

    // Always merge by name (cached first, fresh overwrites)
    mergedSources[source] = mergeByName(cachedEntries, liveEntries);
  }

  return mergedSources;
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

// Scheduled function: runs daily at midnight UTC
export const refreshRankingsCache = functions.pubsub
  .schedule('0 0 * * *')  // Daily at midnight
  .timeZone('UTC')
  .onRun(async (_context) => {
    console.log('Starting daily rankings cache refresh');

    try {
      // Fetch all raw sources - returns FetchAllSourcesResult with sources and sourceResults
      const fetchResult = await fetchAllSources();
      const mergedSources = await mergeCachedSources(fetchResult.sources);
      const now = admin.firestore.Timestamp.now();
      const ttlSeconds = 24 * 60 * 60; // 24 hours
      const expiresAt = admin.firestore.Timestamp.fromMillis(
        now.toMillis() + ttlSeconds * 1000
      );

      const batch = db.batch();
      let successCount = 0;

      // Cache individual sources - only update successful fetches
      for (const [source, entries] of Object.entries(mergedSources)) {
        // Skip if entries is empty or null (failed fetch)
        if (!entries || entries.length === 0) {
          console.warn(`Skipping empty source: ${source}`);
          continue;
        }

        const docRef = db.collection('rankings_cache').doc(source);
        batch.set(docRef, {
          source,
          entries,
          fetchedAt: now,
          expiresAt,
        });
        successCount++;
      }

      await batch.commit();
      console.log(`Successfully cached ${successCount}/${Object.keys(mergedSources).length} sources`);

      // Fetch overrides from Firestore
      const overrides = await fetchOverrides();
      console.log(`Fetched ${overrides.length} ranking overrides`);

      // Apply per-source overrides for general mode
      const generalSourcesWithOverrides = applyPerSourceOverrides(mergedSources, 'general', overrides);
      // Build and apply aggregated overrides for general mode
      let generalRankings = buildGeneralRankings(generalSourcesWithOverrides);
      generalRankings = applyAggregatedOverrides(generalRankings, 'general', overrides);

      // Apply per-source overrides for coding mode
      const codingSourcesWithOverrides = applyPerSourceOverrides(mergedSources, 'coding', overrides);
      // Build and apply aggregated overrides for coding mode
      let codingRankings = buildCodingRankings(codingSourcesWithOverrides);
      codingRankings = applyAggregatedOverrides(codingRankings, 'coding', overrides);

      const aggregatedBatch = db.batch();

      aggregatedBatch.set(db.collection('rankings_aggregated').doc('general'), {
        mode: 'general',
        rankings: generalRankings,
        fetchedAt: now,
        expiresAt,
      });

      aggregatedBatch.set(db.collection('rankings_aggregated').doc('coding'), {
        mode: 'coding',
        rankings: codingRankings,
        fetchedAt: now,
        expiresAt,
      });

      await aggregatedBatch.commit();
      console.log('Successfully cached aggregated rankings');
    } catch (error) {
      console.error('Failed to refresh rankings cache:', error);
      throw error;
    }
  });

// HTTP function: force refresh (for manual triggers)
export const forceRefreshCache = functions.https.onRequest(async (req, res) => {
  // Add authentication check
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.REFRESH_API_KEY) {
    res.status(401).send('Unauthorized');
    return;
  }

  try {
    // Fetch all raw sources
      const fetchResult = await fetchAllSources();
      const mergedSources = await mergeCachedSources(fetchResult.sources);
    const now = admin.firestore.Timestamp.now();
    const ttlSeconds = 24 * 60 * 60;
    const expiresAt = admin.firestore.Timestamp.fromMillis(
      now.toMillis() + ttlSeconds * 1000
    );

    const batch = db.batch();
    let successCount = 0;
    const failedSources: string[] = [];

    // Only update successful fetches
    for (const [source, entries] of Object.entries(mergedSources)) {
      if (!entries || entries.length === 0) {
        console.warn(`Skipping empty source: ${source}`);
        failedSources.push(source);
        continue;
      }

      const docRef = db.collection('rankings_cache').doc(source);
      batch.set(docRef, {
        source,
        entries,
        fetchedAt: now,
        expiresAt,
      });
      successCount++;
    }

    await batch.commit();

    // Fetch overrides from Firestore
    const overrides = await fetchOverrides();
    console.log(`Fetched ${overrides.length} ranking overrides`);

    // Apply per-source overrides for general mode
    const generalSourcesWithOverrides = applyPerSourceOverrides(mergedSources, 'general', overrides);
    // Build and apply aggregated overrides for general mode
    let generalRankings = buildGeneralRankings(generalSourcesWithOverrides);
    generalRankings = applyAggregatedOverrides(generalRankings, 'general', overrides);

    // Apply per-source overrides for coding mode
    const codingSourcesWithOverrides = applyPerSourceOverrides(mergedSources, 'coding', overrides);
    // Build and apply aggregated overrides for coding mode
    let codingRankings = buildCodingRankings(codingSourcesWithOverrides);
    codingRankings = applyAggregatedOverrides(codingRankings, 'coding', overrides);

    const aggregatedBatch = db.batch();

    aggregatedBatch.set(db.collection('rankings_aggregated').doc('general'), {
      mode: 'general',
      rankings: generalRankings,
      fetchedAt: now,
      expiresAt,
    });

    aggregatedBatch.set(db.collection('rankings_aggregated').doc('coding'), {
      mode: 'coding',
      rankings: codingRankings,
      fetchedAt: now,
      expiresAt,
    });

    await aggregatedBatch.commit();

    res.status(200).json({
      success: true,
      sourceCount: successCount,
      totalSources: Object.keys(mergedSources).length,
      failedSources,
      timestamp: now.toDate().toISOString(),
    });
  } catch (error) {
    console.error('Error during force refresh:', error);
    res.status(500).json({ error: String(error) });
  }
});
