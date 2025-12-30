import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { RankingOverride, OverrideTarget } from '@/lib/types';

// Initialize Firebase Admin (if not already)
if (!getApps().length) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    initializeApp({
      credential: cert(serviceAccount),
    });
  } else {
    initializeApp({
      credential: applicationDefault(),
    });
  }
}

const db = getFirestore();

/**
 * Validates admin password from request headers.
 */
function validateAdminPassword(request: NextRequest): boolean {
  const password = request.headers.get('x-admin-password');
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    console.error('ADMIN_PASSWORD environment variable is not set');
    return false;
  }

  return password === adminPassword;
}

/**
 * GET /api/admin/overrides
 * Fetches all ranking overrides.
 */
export async function GET(request: NextRequest) {
  if (!validateAdminPassword(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const snapshot = await db.collection('rankings_overrides').get();
    const overrides: RankingOverride[] = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      overrides.push({
        id: doc.id,
        target: data.target as OverrideTarget,
        creatorName: data.creatorName,
        overrideRank: data.overrideRank,
        createdAt: data.createdAt?.toDate() ?? new Date(),
        updatedAt: data.updatedAt?.toDate() ?? new Date(),
        reason: data.reason,
      });
    });

    return NextResponse.json({ overrides });
  } catch (error) {
    console.error('Error fetching overrides:', error);
    return NextResponse.json(
      { error: 'Failed to fetch overrides' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/overrides
 * Creates a new ranking override.
 */
export async function POST(request: NextRequest) {
  if (!validateAdminPassword(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { target, creatorName, overrideRank, reason } = body;

    // Validate required fields
    if (!target || !creatorName || typeof overrideRank !== 'number') {
      return NextResponse.json(
        { error: 'Missing required fields: target, creatorName, overrideRank' },
        { status: 400 }
      );
    }

    // Validate overrideRank is positive
    if (overrideRank <= 0) {
      return NextResponse.json(
        { error: 'overrideRank must be a positive number' },
        { status: 400 }
      );
    }

    const now = Timestamp.now();

    // Check if override already exists for this target+creator combination
    const existing = await db
      .collection('rankings_overrides')
      .where('target', '==', target)
      .where('creatorName', '==', creatorName)
      .get();

    if (!existing.empty) {
      // Update existing override
      const docId = existing.docs[0].id;
      await db.collection('rankings_overrides').doc(docId).update({
        overrideRank,
        updatedAt: now,
        reason: reason || null,
      });

      const updatedDoc = await db.collection('rankings_overrides').doc(docId).get();
      const data = updatedDoc.data();

      return NextResponse.json({
        success: true,
        override: {
          id: updatedDoc.id,
          target: data?.target,
          creatorName: data?.creatorName,
          overrideRank: data?.overrideRank,
          createdAt: data?.createdAt?.toDate(),
          updatedAt: data?.updatedAt?.toDate(),
          reason: data?.reason,
        },
      });
    }

    // Create new override
    const docRef = await db.collection('rankings_overrides').add({
      target,
      creatorName,
      overrideRank,
      createdAt: now,
      updatedAt: now,
      reason: reason || null,
    });

    const newDoc = await docRef.get();
    const data = newDoc.data();

    return NextResponse.json({
      success: true,
      override: {
        id: newDoc.id,
        target: data?.target,
        creatorName: data?.creatorName,
        overrideRank: data?.overrideRank,
        createdAt: data?.createdAt?.toDate(),
        updatedAt: data?.updatedAt?.toDate(),
        reason: data?.reason,
      },
    });
  } catch (error) {
    console.error('Error creating override:', error);
    return NextResponse.json(
      { error: 'Failed to create override' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/overrides?id=xxx
 * Deletes a ranking override.
 */
export async function DELETE(request: NextRequest) {
  if (!validateAdminPassword(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Missing required parameter: id' },
        { status: 400 }
      );
    }

    await db.collection('rankings_overrides').doc(id).delete();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting override:', error);
    return NextResponse.json(
      { error: 'Failed to delete override' },
      { status: 500 }
    );
  }
}
