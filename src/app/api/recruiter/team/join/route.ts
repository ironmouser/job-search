import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { RecruiterVerificationStatus } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json({ error: 'Invitation token is required' }, { status: 400 });
    }

    const invite = await prisma.recruiterInvitation.findUnique({
      where: { token },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
            verificationStatus: true,
          },
        },
        invitedBy: {
          select: {
            firstName: true,
            lastName: true,
            businessEmail: true,
          },
        },
      },
    });

    if (!invite) {
      return NextResponse.json({ error: 'Invitation not found or invalid' }, { status: 404 });
    }

    if (invite.status !== 'PENDING') {
      return NextResponse.json(
        { error: `This invitation has already been ${invite.status.toLowerCase()}` },
        { status: 400 }
      );
    }

    if (new Date() > invite.expiresAt) {
      return NextResponse.json({ error: 'This invitation has expired' }, { status: 410 });
    }

    return NextResponse.json({
      success: true,
      invitation: {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        organizationName: invite.organization.name,
        organizationId: invite.organization.id,
        inviterName: `${invite.invitedBy.firstName} ${invite.invitedBy.lastName}`,
        expiresAt: invite.expiresAt,
      },
    });
  } catch (error: any) {
    console.error('Error validating team invitation:', error);
    return NextResponse.json({ error: 'Failed to validate invitation' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await req.json();
    const { token, firstName, lastName, title } = body;

    if (!token) {
      return NextResponse.json({ error: 'Invitation token is required' }, { status: 400 });
    }

    const invite = await prisma.recruiterInvitation.findUnique({
      where: { token },
      include: {
        organization: true,
      },
    });

    if (!invite || invite.status !== 'PENDING' || new Date() > invite.expiresAt) {
      return NextResponse.json({ error: 'Invalid or expired invitation' }, { status: 400 });
    }

    // Check if current user already has a recruiter profile
    const existingProfile = await prisma.recruiterProfile.findUnique({
      where: { userId: session.user.id },
    });

    if (existingProfile) {
      if (existingProfile.organizationId === invite.organizationId) {
        return NextResponse.json({
          success: true,
          message: 'You are already a member of this organization',
        });
      }
      return NextResponse.json(
        { error: 'You are already registered with another organization. Please use a separate account.' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });

    // Accept invite and create profile in transaction
    await prisma.$transaction([
      prisma.recruiterProfile.create({
        data: {
          userId: session.user.id,
          organizationId: invite.organizationId,
          firstName: firstName || user?.name?.split(' ')[0] || 'Team',
          lastName: lastName || user?.name?.split(' ').slice(1).join(' ') || 'Member',
          title: title || 'Recruiter',
          businessEmail: invite.email,
          role: invite.role,
          // Inherit the organization's verification status
          verificationStatus: invite.organization.verificationStatus,
          verifiedAt: invite.organization.verificationStatus === 'VERIFIED' ? new Date() : null,
        },
      }),
      prisma.recruiterInvitation.update({
        where: { id: invite.id },
        data: {
          status: 'ACCEPTED',
          acceptedAt: new Date(),
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      message: 'Successfully joined organization',
    });
  } catch (error: any) {
    console.error('Error accepting team invitation:', error);
    return NextResponse.json({ error: error.message || 'Failed to accept invitation' }, { status: 500 });
  }
}
