import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';
import { RecruiterOrgType, RecruiterRole, RecruiterVerificationStatus } from '@prisma/client';

export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth();
  if (error) return error;

  try {
    const body = await req.json();
    const {
      firstName,
      lastName,
      title,
      businessEmail,
      linkedinUrl,
      organizationName,
      organizationType,
      organizationWebsite,
    } = body;

    if (!firstName || !lastName || !title || !businessEmail || !organizationName) {
      return NextResponse.json(
        { error: 'Missing required fields: firstName, lastName, title, businessEmail, organizationName' },
        { status: 400 }
      );
    }

    // Check if user already has a recruiter profile
    const existing = await prisma.recruiterProfile.findUnique({
      where: { userId: user.id },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'User already has a recruiter profile registered' },
        { status: 400 }
      );
    }

    // 1. Create Organization (Pending Verification)
    const org = await prisma.recruiterOrganization.create({
      data: {
        name: organizationName,
        type: (organizationType as RecruiterOrgType) || RecruiterOrgType.RECRUITING_AGENCY,
        website: organizationWebsite || null,
        verificationStatus: RecruiterVerificationStatus.PENDING,
      },
    });

    // 2. Create RecruiterProfile (Pending Verification)
    const profile = await prisma.recruiterProfile.create({
      data: {
        userId: user.id,
        organizationId: org.id,
        firstName,
        lastName,
        title,
        businessEmail,
        linkedinUrl: linkedinUrl || null,
        role: RecruiterRole.OWNER,
        verificationStatus: RecruiterVerificationStatus.PENDING,
      },
      include: {
        organization: true,
      },
    });

    return NextResponse.json({
      success: true,
      profile: {
        id: profile.id,
        firstName: profile.firstName,
        lastName: profile.lastName,
        title: profile.title,
        businessEmail: profile.businessEmail,
        verificationStatus: profile.verificationStatus,
        organization: {
          id: org.id,
          name: org.name,
          verificationStatus: org.verificationStatus,
        },
      },
      message: 'Recruiter profile submitted for verification.',
    });
  } catch (err: any) {
    console.error('Failed to register recruiter profile:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to register recruiter profile' },
      { status: 500 }
    );
  }
}
