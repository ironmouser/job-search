import { NextRequest, NextResponse } from 'next/server';
import { requireVerifiedRecruiter } from '@/lib/recruiter/auth';
import { prisma } from '@/lib/prisma';
import {
  assertCanInviteTeammate,
  getRecruiterOrgEntitlements,
  PaymentRequiredError,
} from '@/lib/recruiter/recruiterBillingService';
import { sendRecruiterTeamInvitation } from '@/lib/mailer';
import { RecruiterRole } from '@prisma/client';

export async function GET() {
  try {
    const recruiter = await requireVerifiedRecruiter();

    const [organization, entitlements] = await Promise.all([
      prisma.recruiterOrganization.findUnique({
        where: { id: recruiter.organizationId },
        include: {
          recruiters: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  image: true,
                  lastLoginAt: true,
                },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
          invitations: {
            where: { status: 'PENDING' },
            orderBy: { createdAt: 'desc' },
          },
        },
      }),
      getRecruiterOrgEntitlements(recruiter.organizationId),
    ]);

    if (!organization) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      currentRecruiterRole: recruiter.role,
      entitlements,
      members: organization.recruiters.map((r) => ({
        id: r.id,
        userId: r.userId,
        firstName: r.firstName,
        lastName: r.lastName,
        name: `${r.firstName} ${r.lastName}`,
        title: r.title,
        businessEmail: r.businessEmail,
        role: r.role,
        profilePhotoUrl: r.profilePhotoUrl || r.user.image,
        verificationStatus: r.verificationStatus,
        createdAt: r.createdAt,
        lastLoginAt: r.user.lastLoginAt,
      })),
      pendingInvitations: organization.invitations.map((inv) => ({
        id: inv.id,
        email: inv.email,
        role: inv.role,
        status: inv.status,
        expiresAt: inv.expiresAt,
        createdAt: inv.createdAt,
      })),
    });
  } catch (error: any) {
    const status = error.message?.startsWith('UNAUTHORIZED') ? 401 : error.message?.startsWith('FORBIDDEN') ? 403 : 500;
    return NextResponse.json({ error: error.message || 'Failed to fetch team members' }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const recruiter = await requireVerifiedRecruiter();

    // Only OWNER or ADMIN can invite team members
    if (recruiter.role !== 'OWNER' && recruiter.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Only organization Owners and Admins can invite team members' },
        { status: 403 }
      );
    }

    // Verify seat capacity & collaboration entitlement
    await assertCanInviteTeammate(recruiter.organizationId);

    const body = await req.json();
    const { email, role = 'RECRUITER' } = body;

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email address is required' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if user is already a member of this organization
    const existingMember = await prisma.recruiterProfile.findFirst({
      where: {
        organizationId: recruiter.organizationId,
        businessEmail: { equals: normalizedEmail, mode: 'insensitive' },
      },
    });

    if (existingMember) {
      return NextResponse.json(
        { error: 'A user with this email is already a member of your organization' },
        { status: 400 }
      );
    }

    // Check if there is already a pending invitation for this email
    const existingInvite = await prisma.recruiterInvitation.findFirst({
      where: {
        organizationId: recruiter.organizationId,
        email: normalizedEmail,
        status: 'PENDING',
      },
    });

    if (existingInvite) {
      return NextResponse.json(
        { error: 'An invitation has already been sent to this email address' },
        { status: 400 }
      );
    }

    const org = await prisma.recruiterOrganization.findUnique({
      where: { id: recruiter.organizationId },
    });
    const currentRecruiter = await prisma.recruiterProfile.findUnique({
      where: { id: recruiter.recruiterId },
    });

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invitation = await prisma.recruiterInvitation.create({
      data: {
        organizationId: recruiter.organizationId,
        email: normalizedEmail,
        role: (role as RecruiterRole) || 'RECRUITER',
        invitedByRecruiterId: recruiter.recruiterId,
        expiresAt,
      },
    });

    const appUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const inviteUrl = `${appUrl}/recruiter/team/join?token=${invitation.token}`;

    await sendRecruiterTeamInvitation({
      recipientEmail: normalizedEmail,
      inviterName: `${currentRecruiter?.firstName || 'A team member'} ${currentRecruiter?.lastName || ''}`.trim(),
      organizationName: org?.name || 'Recruiter Portal',
      role: invitation.role,
      inviteUrl,
      expiresAt,
    });

    return NextResponse.json({
      success: true,
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
      },
    });
  } catch (error: any) {
    if (error instanceof PaymentRequiredError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          entitlements: error.details,
        },
        { status: 402 }
      );
    }
    const status = error.message?.startsWith('UNAUTHORIZED') ? 401 : error.message?.startsWith('FORBIDDEN') ? 403 : 500;
    return NextResponse.json({ error: error.message || 'Failed to send team invitation' }, { status });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const recruiter = await requireVerifiedRecruiter();

    if (recruiter.role !== 'OWNER' && recruiter.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Only organization Owners and Admins can manage team members' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const invitationId = searchParams.get('invitationId');
    const memberId = searchParams.get('memberId');

    if (invitationId) {
      const invite = await prisma.recruiterInvitation.findFirst({
        where: { id: invitationId, organizationId: recruiter.organizationId },
      });
      if (!invite) {
        return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
      }
      await prisma.recruiterInvitation.delete({ where: { id: invitationId } });
      return NextResponse.json({ success: true, message: 'Invitation revoked' });
    }

    if (memberId) {
      const targetMember = await prisma.recruiterProfile.findFirst({
        where: { id: memberId, organizationId: recruiter.organizationId },
      });

      if (!targetMember) {
        return NextResponse.json({ error: 'Team member not found' }, { status: 404 });
      }

      if (targetMember.role === 'OWNER') {
        return NextResponse.json({ error: 'Cannot remove organization owner' }, { status: 400 });
      }

      if (targetMember.id === recruiter.recruiterId) {
        return NextResponse.json({ error: 'Cannot remove yourself' }, { status: 400 });
      }

      await prisma.recruiterProfile.delete({ where: { id: memberId } });
      return NextResponse.json({ success: true, message: 'Team member removed' });
    }

    return NextResponse.json({ error: 'invitationId or memberId is required' }, { status: 400 });
  } catch (error: any) {
    const status = error.message?.startsWith('UNAUTHORIZED') ? 401 : error.message?.startsWith('FORBIDDEN') ? 403 : 500;
    return NextResponse.json({ error: error.message || 'Failed to remove team member' }, { status });
  }
}
