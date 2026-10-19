import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { refreshCandidateIntentBatch } from '@/lib/recruiter/intentService';
import { CandidateConsentType, ConsentStatus } from '@prisma/client';
import { authenticateInternalRequest } from '@/lib/auth-helpers';

export async function POST(req: NextRequest) {
  // 1. Verify internal API key authorization
  const authError = authenticateInternalRequest(req);
  if (authError) return authError;

  try {
    // 2. Fetch candidates whose intent snapshot is missing or expires in the next hour
    const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);

    const candidatesNeedingRefresh = await prisma.user.findMany({
      where: {
        isDisabled: false,
        candidateConsents: {
          some: {
            consentType: CandidateConsentType.RECRUITER_DISCOVERY,
            status: ConsentStatus.GRANTED,
          },
        },
        OR: [
          { intentSnapshots: { none: {} } },
          {
            intentSnapshots: {
              every: {
                expiresAt: { lte: oneHourFromNow },
              },
            },
          },
        ],
      },
      take: 100,
      select: { id: true },
    });

    const candidateIds = candidatesNeedingRefresh.map((c) => c.id);
    const updatedCount = await refreshCandidateIntentBatch(candidateIds);

    return NextResponse.json({
      success: true,
      candidatesEvaluated: candidateIds.length,
      updatedCount,
    });
  } catch (err: any) {
    console.error('Failed to batch refresh candidate intent:', err);
    return NextResponse.json({ error: err.message || 'Internal batch refresh failed' }, { status: 500 });
  }
}
