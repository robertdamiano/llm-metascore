import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { fetchGeneralRankings, fetchCodingRankings } from '@/lib/rankings';

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

    return {
      rankings: data?.rankings,
      cached: true,
      fetchedAt: data?.fetchedAt?.toDate().toISOString(),
    };
  } catch (error) {
    console.error('Error reading from cache:', error);
    return null;
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
      let rankings;

      switch (mode) {
        case 'general':
          rankings = await fetchGeneralRankings();
          break;
        case 'coding':
          rankings = await fetchCodingRankings();
          break;
        default:
          return NextResponse.json(
            { error: 'Invalid mode. Must be: general or coding' },
            { status: 400 }
          );
      }

      result = {
        rankings,
        cached: false,
        fetchedAt: new Date().toISOString(),
      };
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
