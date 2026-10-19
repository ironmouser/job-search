import { NextRequest, NextResponse } from 'next/server';
import { authenticateInternalRequest } from '@/lib/auth-helpers';
import { runJobMatchCycle } from '@/lib/jobMatch/runJobMatchCycle';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

/**
 * GET /api/internal/job-match/run
 * Returns the status of the latest Job Match runs and system schedule stats.
 */
export async function GET(req: NextRequest) {
  // Allow internal auth key OR system admin session
  const authErr = authenticateInternalRequest(req);
  if (authErr) {
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role;
    if (role !== 'SYSTEM_ADMIN') {
      return authErr;
    }
  }

  try {
    const recentRuns = await prisma.jobMatchRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: 10,
    });

    const optedInCount = await prisma.userPreferences.count({
      where: {
        jobMatchEmailsEnabled: true,
        searchKeyword: { not: null },
      },
    });

    return NextResponse.json({
      success: true,
      optedInUsersCount: optedInCount,
      recentRuns,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to fetch job match status' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/internal/job-match/run
 * Triggers a Job Match cycle across all opted-in users.
 * Supports:
 *   - Bearer token authentication (CRON_SECRET, INTERNAL_API_KEY, WORKER_API_KEY)
 *   - Query params: ?force=true, ?dryRun=true, ?sync=true, ?userId=<id>
 */
export async function POST(req: NextRequest) {
  // Allow internal auth key OR system admin session
  const authErr = authenticateInternalRequest(req);
  if (authErr) {
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role;
    if (role !== 'SYSTEM_ADMIN') {
      return authErr;
    }
  }

  const { searchParams } = new URL(req.url);
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const force = searchParams.get('force') === 'true' || body.force === true;
  const dryRun = searchParams.get('dryRun') === 'true' || body.dryRun === true;
  const sync = searchParams.get('sync') === 'true' || body.sync === true;
  const userId = searchParams.get('userId') || body.userId || undefined;

  // If synchronous execution is requested (e.g. for testing)
  if (sync) {
    try {
      const result = await runJobMatchCycle({ force, dryRun, userId });
      return NextResponse.json(result);
    } catch (err: any) {
      return NextResponse.json(
        { success: false, error: err.message || 'Job match execution failed' },
        { status: 500 }
      );
    }
  }

  // Otherwise, kick off the cycle in background and return 202 Accepted immediately
  // to avoid Railway/reverse proxy HTTP timeout aborts.
  runJobMatchCycle({ force, dryRun, userId }).catch((err) => {
    console.error('[Internal Job Match Route] Background cycle unhandled error:', err);
  });

  return NextResponse.json(
    {
      status: 'accepted',
      message: 'Job Match cycle started in background',
      options: { force, dryRun, userId: userId || null },
    },
    { status: 202 }
  );
}
