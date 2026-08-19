import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAutoApplyQuota } from '@/lib/auto-apply/quota';

export const dynamic = 'force-dynamic';

/**
 * GET /api/auto-apply/quota
 *
 * Returns the current auto-apply quota usage, limits, remaining allowance,
 * and reset timestamps for the authenticated user.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const quota = await getAutoApplyQuota(session.user.id);
    return NextResponse.json({ quota });
  } catch (error: any) {
    console.error('[api/auto-apply/quota] Failed to fetch quota:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch auto-apply quota' },
      { status: 500 }
    );
  }
}
