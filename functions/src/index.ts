import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin with Application Default Credentials
// In Cloud Functions, this automatically uses the service account
admin.initializeApp();

const db = admin.firestore();

// Import scraper functions - we need to compile lib/ scrapers or duplicate them
// For now, we'll import the TypeScript files directly and handle compilation
import { fetchAllSources } from '../../lib/rankings';
import { fetchGeneralRankings, fetchCodingRankings } from '../../lib/rankings';

// Scheduled function: runs daily at midnight UTC
export const refreshRankingsCache = functions.pubsub
  .schedule('0 0 * * *')  // Daily at midnight
  .timeZone('UTC')
  .onRun(async (_context) => {
    console.log('Starting daily rankings cache refresh');

    try {
      // Fetch all raw sources
      const allSources = await fetchAllSources();
      const now = admin.firestore.Timestamp.now();
      const ttlSeconds = 24 * 60 * 60; // 24 hours
      const expiresAt = admin.firestore.Timestamp.fromMillis(
        now.toMillis() + ttlSeconds * 1000
      );

      const batch = db.batch();

      // Cache individual sources
      for (const [source, entries] of Object.entries(allSources)) {
        const docRef = db.collection('rankings_cache').doc(source);
        batch.set(docRef, {
          source,
          entries,
          fetchedAt: now,
          expiresAt,
        });
      }

      await batch.commit();
      console.log(`Successfully cached ${Object.keys(allSources).length} sources`);

      // Now compute and cache aggregated rankings
      const [generalRankings, codingRankings] = await Promise.all([
        fetchGeneralRankings(),
        fetchCodingRankings(),
      ]);

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
    const now = admin.firestore.Timestamp.now();
    const ttlSeconds = 24 * 60 * 60;
    const expiresAt = admin.firestore.Timestamp.fromMillis(
      now.toMillis() + ttlSeconds * 1000
    );

    const batch = db.batch();

    for (const [source, entries] of Object.entries(allSources)) {
      const docRef = db.collection('rankings_cache').doc(source);
      batch.set(docRef, {
        source,
        entries,
        fetchedAt: now,
        expiresAt,
      });
    }

    await batch.commit();

    // Compute and cache aggregated rankings
    const [generalRankings, codingRankings] = await Promise.all([
      fetchGeneralRankings(),
      fetchCodingRankings(),
    ]);

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
      sourceCount: Object.keys(allSources).length,
      timestamp: now.toDate().toISOString(),
    });
  } catch (error) {
    console.error('Error during force refresh:', error);
    res.status(500).json({ error: String(error) });
  }
});
