import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { RecruiterVerificationStatus } from '@prisma/client';

export interface RecruiterContext {
  userId: string;
  recruiterId: string;
  organizationId: string;
  role: string;
  verificationStatus: RecruiterVerificationStatus;
}

/**
 * Checks if the Recruiter Network feature is enabled globally.
 */
export async function isRecruiterNetworkEnabled(): Promise<boolean> {
  const settings = await prisma.globalSettings.findUnique({
    where: { id: 'system' },
    select: { recruiterNetworkEnabled: true, recruiterPortalEnabled: true },
  });

  return Boolean(settings?.recruiterNetworkEnabled ?? settings?.recruiterPortalEnabled ?? true);
}

/**
 * Retrieves the RecruiterProfile for a given user ID with organization data.
 */
export async function getRecruiterProfile(userId: string) {
  return prisma.recruiterProfile.findUnique({
    where: { userId },
    include: {
      organization: true,
    },
  });
}

/**
 * Server-side guard that verifies the session user has a verified RecruiterProfile.
 * Throws an Error with 401 or 403 semantics if unauthorized.
 */
export async function requireVerifiedRecruiter(customSession?: any): Promise<RecruiterContext> {
  const session = customSession || (await getServerSession(authOptions));

  if (!session?.user?.id) {
    throw new Error('UNAUTHORIZED: Authentication required');
  }

  const profile = await prisma.recruiterProfile.findUnique({
    where: { userId: session.user.id },
    select: {
      id: true,
      userId: true,
      organizationId: true,
      role: true,
      verificationStatus: true,
      organization: {
        select: {
          id: true,
          verificationStatus: true,
        },
      },
    },
  });

  if (!profile) {
    throw new Error('FORBIDDEN: Recruiter profile not found');
  }

  if (profile.verificationStatus !== 'VERIFIED') {
    throw new Error(`FORBIDDEN: Recruiter account status is ${profile.verificationStatus}`);
  }

  if (profile.organization.verificationStatus !== 'VERIFIED') {
    throw new Error(`FORBIDDEN: Recruiter organization status is ${profile.organization.verificationStatus}`);
  }

  return {
    userId: session.user.id,
    recruiterId: profile.id,
    organizationId: profile.organizationId,
    role: profile.role,
    verificationStatus: profile.verificationStatus,
  };
}

/**
 * Ensures the recruiter has access to the target organization.
 */
export async function requireRecruiterOrgAccess(
  organizationId: string,
  customSession?: any
): Promise<RecruiterContext> {
  const context = await requireVerifiedRecruiter(customSession);

  if (context.organizationId !== organizationId) {
    throw new Error('FORBIDDEN: Access to organization denied');
  }

  return context;
}
