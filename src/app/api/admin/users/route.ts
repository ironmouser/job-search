import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { handleUserUpgradeToPro } from "@/lib/settings";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== 'SYSTEM_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let rawUsers: any[];
    try {
      rawUsers = await prisma.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          planTier: true,
          stripeCustomerId: true,
          stripeSubscriptionId: true,
          createdAt: true,
          lastLoginAt: true,
          userPreferences: {
            select: {
              createdAt: true,
            }
          },
          userJobs: {
            select: {
              status: true,
              appliedAt: true,
              isArchived: true,
            }
          }
        },
        orderBy: {
          id: 'asc'
        }
      });
    } catch (dbErr) {
      console.warn("DB query with createdAt/lastLoginAt failed, falling back to basic query:", dbErr);
      rawUsers = await prisma.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          planTier: true,
          stripeCustomerId: true,
          stripeSubscriptionId: true,
          userPreferences: {
            select: {
              createdAt: true,
            }
          },
          userJobs: {
            select: {
              status: true,
              appliedAt: true,
              isArchived: true,
            }
          }
        },
        orderBy: {
          id: 'asc'
        }
      });
    }

    const users = rawUsers.map(u => {
      const createdAt = u.createdAt || u.userPreferences?.createdAt || null;
      const lastLoginAt = u.lastLoginAt || createdAt;
      const userJobs: Array<{ status?: string; appliedAt?: Date | null; isArchived?: boolean }> = u.userJobs || [];
      const jobsFoundCount = userJobs.length;
      const jobsAppliedCount = userJobs.filter(uj => uj.status === 'applied' || uj.appliedAt != null).length;
      const jobsSavedCount = userJobs.filter(uj => uj.isArchived || uj.status === 'saved' || uj.status === 'bookmarked' || uj.status === 'shortlisted').length;

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        planTier: u.planTier,
        stripeCustomerId: u.stripeCustomerId,
        stripeSubscriptionId: u.stripeSubscriptionId,
        createdAt,
        lastLoginAt,
        jobsFoundCount,
        jobsAppliedCount,
        jobsSavedCount,
      };
    });

    return NextResponse.json(users);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== 'SYSTEM_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await request.json();
    const { userId, role, planTier } = data;

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    if (planTier === 'PRO' || planTier === 'BUSINESS') {
      await handleUserUpgradeToPro(userId);
    }

    let updatedUser: any;
    try {
      updatedUser = await prisma.user.update({
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
          planTier: true,
          createdAt: true,
          lastLoginAt: true,
        }
      });
    } catch {
      updatedUser = await prisma.user.update({
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
          planTier: true,
        }
      });
    }

    return NextResponse.json(updatedUser);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== 'SYSTEM_ADMIN') {
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
          role: { not: 'SYSTEM_ADMIN' },
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

    if (targetUser.role === 'SYSTEM_ADMIN') {
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

