import { NextRequest, NextResponse } from 'next/server';
import { fetchGeneralRankings, fetchCodingRankings, fetchTopAppsRankings } from '@/lib/rankings';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('mode') || 'general';

  try {
    let rankings;

    switch (mode) {
      case 'general':
        rankings = await fetchGeneralRankings();
        break;
      case 'coding':
        rankings = await fetchCodingRankings();
        break;
      case 'apps':
        rankings = await fetchTopAppsRankings();
        break;
      default:
        return NextResponse.json(
          { error: 'Invalid mode. Must be: general, coding, or apps' },
          { status: 400 }
        );
    }

    return NextResponse.json({ rankings });
  } catch (error) {
    console.error('Error fetching rankings:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
