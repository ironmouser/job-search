import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== 'SYSTEM_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch collision logs with target and primary user details
    const collisionLogs = await prisma.accountCollisionLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        targetUser: {
          select: {
            id: true,
            email: true,
            name: true,
            createdAt: true,
            isTrialDeferred: true,
            trialDeferralReason: true,
            unifiedQuotaGroupId: true,
          },
        },
        primaryUser: {
          select: {
            id: true,
            email: true,
            name: true,
            createdAt: true,
          },
        },
      },
    });

    // Group incidents by target user to find multi-flagged accounts (>1 incident)
    const incidenceCountMap = new Map<string, number>();
    collisionLogs.forEach((log) => {
      const count = incidenceCountMap.get(log.targetUserId) || 0;
      incidenceCountMap.set(log.targetUserId, count + 1);
    });

    const multiFlaggedUserIds = Array.from(incidenceCountMap.entries())
      .filter(([_, count]) => count > 1)
      .map(([userId]) => userId);

    const multiFlaggedUsers = await prisma.user.findMany({
      where: {
        id: { in: multiFlaggedUserIds },
      },
      select: {
        id: true,
        email: true,
        name: true,
        normalizedEmail: true,
        isTrialDeferred: true,
        trialDeferralReason: true,
        unifiedQuotaGroupId: true,
        createdAt: true,
        collisionLogsTarget: {
          include: {
            primaryUser: {
              select: { id: true, email: true, name: true },
            },
          },
        },
      },
    });

    return NextResponse.json({
      totalIncidents: collisionLogs.length,
      multiFlaggedCount: multiFlaggedUsers.length,
      recentIncidents: collisionLogs,
      multiFlaggedAccounts: multiFlaggedUsers,
    });
  } catch (error: any) {
    console.error('Error fetching anti-abuse logs:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
