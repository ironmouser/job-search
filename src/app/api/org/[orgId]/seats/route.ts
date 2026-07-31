import { NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getRemainingSeats } from "@/lib/organizations";

type RouteParams = { params: Promise<{ orgId: string }> };

/**
 * GET /api/org/[orgId]/seats
 * Returns current seat usage for the organization.
 */
export async function GET(_req: Request, { params }: RouteParams) {
  const { orgId } = await params;
  const { error } = await requireOrgAdmin(orgId);
  if (error) return error;

  try {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        id: true,
        seatCount: true,
        consumedSeats: true,
      },
    });

    if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

    const remainingSeats = await getRemainingSeats(org);
    
    // Seats in use and not expired
    const activeUnexpiredSeats = await prisma.user.count({
      where: {
        organizationId: orgId,
        isDisabled: false,
        orgAccessExpiresAt: { gt: new Date() }
      }
    });

    // Purchase history via ActivityLog
    const now = new Date();
    
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const purchaseLogs = await prisma.organizationActivityLog.findMany({
      where: {
        organizationId: orgId,
        action: "SEAT_PURCHASED",
        createdAt: { gte: yearAgo }
      },
      select: { createdAt: true, metadata: true }
    });

    let purchased30Days = 0;
    let purchased6Months = 0;
    let purchasedThisYear = 0;
    let purchased365Days = 0;

    for (const log of purchaseLogs) {
      const q = (log.metadata as any)?.quantity || 0;
      purchased365Days += q;
      if (log.createdAt >= thirtyDaysAgo) purchased30Days += q;
      if (log.createdAt >= sixMonthsAgo) purchased6Months += q;
      if (log.createdAt >= startOfYear) purchasedThisYear += q;
    }

    return NextResponse.json({
      seatCount: org.seatCount,
      consumedSeats: org.consumedSeats,
      remainingSeats,
      activeUnexpiredSeats,
      stats: {
        purchased30Days,
        purchased6Months,
        purchasedThisYear,
        purchased365Days
      }
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
