import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const { user, error } = await requireAuth();
  if (error || !user) return error;

  try {
    const profile = await prisma.recruiterProfile.findUnique({
      where: { userId: user.id },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            type: true,
            website: true,
            description: true,
            logoUrl: true,
            verificationStatus: true,
            verifiedAt: true,
          },
        },
      },
    });

    if (!profile) {
      return NextResponse.json({ hasProfile: false, profile: null });
    }

    return NextResponse.json({
      hasProfile: true,
      profile: {
        id: profile.id,
        firstName: profile.firstName,
        lastName: profile.lastName,
        title: profile.title,
        businessEmail: profile.businessEmail,
        profilePhotoUrl: profile.profilePhotoUrl,
        bio: profile.bio,
        linkedinUrl: profile.linkedinUrl,
        role: profile.role,
        verificationStatus: profile.verificationStatus,
        verifiedAt: profile.verifiedAt,
        organization: profile.organization,
      },
    });
  } catch (err: any) {
    console.error('Failed to get recruiter profile:', err);
    return NextResponse.json({ error: 'Failed to retrieve profile' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const { user, error } = await requireAuth();
  if (error || !user) return error;

  try {
    const body = await req.json();
    const { firstName, lastName, title, bio, linkedinUrl, profilePhotoUrl } = body;

    const profile = await prisma.recruiterProfile.update({
      where: { userId: user.id },
      data: {
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        title: title || undefined,
        bio: bio !== undefined ? bio : undefined,
        linkedinUrl: linkedinUrl !== undefined ? linkedinUrl : undefined,
        profilePhotoUrl: profilePhotoUrl !== undefined ? profilePhotoUrl : undefined,
      },
    });

    return NextResponse.json({ success: true, profile });
  } catch (err: any) {
    console.error('Failed to update recruiter profile:', err);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
