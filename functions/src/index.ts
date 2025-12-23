import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin with Application Default Credentials
// In Cloud Functions, this automatically uses the service account
admin.initializeApp();

const db = admin.firestore();

// Import scraper functions - we need to compile lib/ scrapers or duplicate them
// For now, we'll import the TypeScript files directly and handle compilation
import { fetchAllSources, buildGeneralRankings, buildCodingRankings } from '../../lib/rankings';
import { ModelEntry } from '../../lib/types';

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

async function mergeCachedVals(
  allSources: Record<string, ModelEntry[]>
): Promise<Record<string, ModelEntry[]>> {
  const liveVals = allSources['vals:vibe-code'] ?? [];
  const doc = await db.collection('rankings_cache').doc('vals:vibe-code').get();
  const cachedVals = doc.exists ? ((doc.data()?.entries ?? []) as ModelEntry[]) : [];

  if (cachedVals.length === 0 && liveVals.length === 0) {
    return allSources;
  }

  const mergedVals =
    cachedVals.length === 0 ? liveVals : mergeByName(cachedVals, liveVals);

  return {
    ...allSources,
    'vals:vibe-code': mergedVals,
  };
}

// Scheduled function: runs daily at midnight UTC
export const refreshRankingsCache = functions.pubsub
  .schedule('0 0 * * *')  // Daily at midnight
  .timeZone('UTC')
  .onRun(async (_context) => {
    console.log('Starting daily rankings cache refresh');

    try {
      // Fetch all raw sources - returns a Record with sources and errors
      const allSources = await fetchAllSources();
      const mergedSources = await mergeCachedVals(allSources);
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

      // Now compute and cache aggregated rankings
      const generalRankings = buildGeneralRankings(mergedSources);
      const codingRankings = buildCodingRankings(mergedSources);

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
    const allSources = await fetchAllSources();
    const mergedSources = await mergeCachedVals(allSources);
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

    // Compute and cache aggregated rankings
    const generalRankings = buildGeneralRankings(mergedSources);
    const codingRankings = buildCodingRankings(mergedSources);

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
