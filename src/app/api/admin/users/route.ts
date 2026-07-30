import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { handleUserUpgradeToPro } from "@/lib/settings";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        planTier: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
      },
      orderBy: {
        id: 'asc'
      }
    });

    return NextResponse.json(users);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await request.json();
    const { userId, role, planTier } = data;

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    if (planTier === 'PRO') {
      await handleUserUpgradeToPro(userId);
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        role: role,
        planTier: planTier
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        planTier: true
      }
    });

    return NextResponse.json(updatedUser);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const userIdParam = searchParams.get('userId');
    const deleteFreeOnly = searchParams.get('deleteFree') === 'true';

    let bodyData: any = {};
    try {
      bodyData = await request.json();
    } catch {
      // Body may be empty if using query params
    }

    const userId = userIdParam || bodyData.userId;
    const isDeleteFree = deleteFreeOnly || bodyData.deleteFree === true;

    if (isDeleteFree) {
      const freeUsers = await prisma.user.findMany({
        where: {
          planTier: 'FREE',
          role: { not: 'ADMIN' },
        },
        select: { id: true },
      });

      const freeUserIds = freeUsers.map(u => u.id);

      if (freeUserIds.length > 0) {
        // Clean up unlinked records
        await prisma.syncLog.deleteMany({ where: { userId: { in: freeUserIds } } });
        await prisma.aICostLog.deleteMany({ where: { userId: { in: freeUserIds } } });
        await prisma.appFeedback.deleteMany({ where: { userId: { in: freeUserIds } } });
        await prisma.job.deleteMany({ where: { addedById: { in: freeUserIds } } });

        const result = await prisma.user.deleteMany({
          where: {
            id: { in: freeUserIds },
          },
        });

        return NextResponse.json({
          success: true,
          count: result.count,
          message: `Successfully removed ${result.count} free tier user(s).`,
        });
      }

      return NextResponse.json({
        success: true,
        count: 0,
        message: 'No free tier non-admin users found to delete.',
      });
    }

    if (!userId) {
      return NextResponse.json({ error: 'User ID or deleteFree flag is required' }, { status: 400 });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, email: true },
    });

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (targetUser.role === 'ADMIN') {
      return NextResponse.json({ error: 'Cannot delete an administrator account' }, { status: 403 });
    }

    // Clean up unlinked records
    await prisma.syncLog.deleteMany({ where: { userId } });
    await prisma.aICostLog.deleteMany({ where: { userId } });
    await prisma.appFeedback.deleteMany({ where: { userId } });
    await prisma.job.deleteMany({ where: { addedById: userId } });

    await prisma.user.delete({
      where: { id: userId },
    });

    return NextResponse.json({
      success: true,
      message: `User ${targetUser.email || targetUser.id} removed successfully`,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

