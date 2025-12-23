import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import {
  fetchAllSources,
  buildGeneralRankings,
  buildCodingRankings,
} from '@/lib/rankings';
import { ModelEntry } from '@/lib/types';

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
    // Define which sources we need per mode to avoid full collection scan
    const sourcesPerMode: Record<string, string[]> = {
      general: [
        'openlm:arena:overall',
        'openlm:arena:vision',
        'lmarena:search',
        'openlm:arena:aaii',
        'openlm:arena:mmlu-pro',
        'openlm:arena:arc-agi',
      ],
      coding: [
        'lmarena:webdev',
        'openlm:arena:coding',
        'openlm:swebench',
        'openlm:ioi',
        'vals:vibe-code',
      ],
    };

    const timestamps: Record<string, string> = {};

    // If mode is specified, only fetch timestamps for sources in that mode
    const sourcesToFetch = mode ? sourcesPerMode[mode] || [] : [];

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

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('mode') || 'general';
  const forceRefresh = searchParams.get('refresh') === 'true';

  try {
    let result;

    if (!forceRefresh) {
      // Try to get from cache first
      result = await getRankingsFromCache(mode);
    }

    if (!result) {
      // Cache miss or expired - fetch fresh data
      const mergedSources = await mergeCachedVals(await fetchAllSources());
      let rankings;

      switch (mode) {
        case 'general':
          rankings = buildGeneralRankings(mergedSources);
          break;
        case 'coding':
          rankings = buildCodingRankings(mergedSources);
          break;
        default:
          return NextResponse.json(
            { error: 'Invalid mode. Must be: general or coding' },
            { status: 400 }
          );
      }

      // Get source timestamps even for fresh fetches (only for this mode)
      const sourceTimestamps = await getSourceTimestamps(mode);

      result = {
        rankings,
        cached: false,
        fetchedAt: new Date().toISOString(),
        sourceTimestamps,
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
