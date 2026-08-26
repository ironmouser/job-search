import { NextRequest, NextResponse } from 'next/server';
import { requireVerifiedRecruiter } from '@/lib/recruiter/auth';
import { advanceIntroductionStage } from '@/lib/recruiter/attributionService';
import { IntroductionStatus } from '@prisma/client';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const recruiter = await requireVerifiedRecruiter();
    const { id } = await params;
    const body = await req.json();
    const { stage, notes } = body;

    if (!stage || !Object.values(IntroductionStatus).includes(stage)) {
      return NextResponse.json(
        { error: `Invalid stage: ${stage}` },
        { status: 400 }
      );
    }

    const updated = await advanceIntroductionStage({
      introductionId: id,
      recruiterId: recruiter.recruiterId,
      stage: stage as IntroductionStatus,
      notes,
    });

    return NextResponse.json({
      success: true,
      status: updated.currentStatus,
      updatedAt: updated.updatedAt,
    });
  } catch (err: any) {
    const status = err.message?.startsWith('UNAUTHORIZED') ? 401 : err.message?.startsWith('FORBIDDEN') ? 403 : 400;
    return NextResponse.json({ error: err.message || 'Failed to advance pipeline stage' }, { status });
  }
}
