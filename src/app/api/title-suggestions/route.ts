import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { expandSearchKeywordsWithAI } from '@/lib/keywordExpansion';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.trim() || '';

    if (!query || query.length < 2) {
      return NextResponse.json({ suggestions: [] });
    }

    const session = await getServerSession(authOptions);
    const suggestions = await expandSearchKeywordsWithAI(query, session?.user?.id);

    return NextResponse.json({ suggestions });
  } catch (error: any) {
    console.error('[Title Suggestions API Error]:', error);
    return NextResponse.json({ suggestions: [] }, { status: 500 });
  }
}
