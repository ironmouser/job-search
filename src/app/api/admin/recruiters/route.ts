import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { RecruiterVerificationStatus } from '@prisma/client';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as { role?: string }).role !== 'SYSTEM_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizations = await prisma.recruiterOrganization.findMany({
      include: {
        recruiters: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                createdAt: true,
                lastLoginAt: true,
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
        _count: {
          select: {
            jobs: true,
            introductions: true,
            recruiters: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({ success: true, organizations });
  } catch (error: unknown) {
    console.error('Failed to fetch recruiters for admin:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as { role?: string }).role !== 'SYSTEM_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { orgId, action, rejectionReason } = body;

    if (!orgId) {
      return NextResponse.json({ error: 'Organization ID is required' }, { status: 400 });
    }

    if (!['VERIFY', 'REJECT', 'PENDING', 'SUSPEND'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action provided' }, { status: 400 });
    }

    const adminIdentifier = session.user.email || 'SYSTEM_ADMIN';
    const now = new Date();

    let updatedOrg;

    if (action === 'VERIFY') {
      const [, org] = await prisma.$transaction([
        prisma.recruiterProfile.updateMany({
          where: { organizationId: orgId },
          data: {
            verificationStatus: RecruiterVerificationStatus.VERIFIED,
            verifiedAt: now,
          },
        }),
        prisma.recruiterOrganization.update({
          where: { id: orgId },
          data: {
            verificationStatus: RecruiterVerificationStatus.VERIFIED,
            verifiedAt: now,
            verifiedBy: adminIdentifier,
            rejectionReason: null,
          },
          include: {
            recruiters: true,
          },
        }),
      ]);
      updatedOrg = org;
    } else if (action === 'REJECT') {
      const reason = rejectionReason?.trim() || 'Application declined by administration';
      const [, org] = await prisma.$transaction([
        prisma.recruiterProfile.updateMany({
          where: { organizationId: orgId },
          data: {
            verificationStatus: RecruiterVerificationStatus.REJECTED,
            verifiedAt: null,
          },
        }),
        prisma.recruiterOrganization.update({
          where: { id: orgId },
          data: {
            verificationStatus: RecruiterVerificationStatus.REJECTED,
            verifiedAt: null,
            verifiedBy: adminIdentifier,
            rejectionReason: reason,
          },
          include: {
            recruiters: true,
          },
        }),
      ]);
      updatedOrg = org;
    } else if (action === 'PENDING') {
      const [, org] = await prisma.$transaction([
        prisma.recruiterProfile.updateMany({
          where: { organizationId: orgId },
          data: {
            verificationStatus: RecruiterVerificationStatus.PENDING,
            verifiedAt: null,
          },
        }),
        prisma.recruiterOrganization.update({
          where: { id: orgId },
          data: {
            verificationStatus: RecruiterVerificationStatus.PENDING,
            verifiedAt: null,
            verifiedBy: null,
            rejectionReason: null,
          },
          include: {
            recruiters: true,
          },
        }),
      ]);
      updatedOrg = org;
    } else if (action === 'SUSPEND') {
      const [, org] = await prisma.$transaction([
        prisma.recruiterProfile.updateMany({
          where: { organizationId: orgId },
          data: {
            verificationStatus: RecruiterVerificationStatus.SUSPENDED,
          },
        }),
        prisma.recruiterOrganization.update({
          where: { id: orgId },
          data: {
            verificationStatus: RecruiterVerificationStatus.SUSPENDED,
          },
          include: {
            recruiters: true,
          },
        }),
      ]);
      updatedOrg = org;
    }

    return NextResponse.json({
      success: true,
      message: `Organization status updated to ${action}`,
      organization: updatedOrg,
    });
  } catch (error: unknown) {
    console.error('Failed to update recruiter organization status:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
