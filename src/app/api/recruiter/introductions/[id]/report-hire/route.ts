import { NextRequest, NextResponse } from 'next/server';
import { requireVerifiedRecruiter } from '@/lib/recruiter/auth';
import { reportHire } from '@/lib/recruiter/attributionService';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const recruiter = await requireVerifiedRecruiter();
    const { id } = await params;
    const body = await req.json();
    const { notes } = body;

    const placement = await reportHire({
      introductionId: id,
      recruiterId: recruiter.recruiterId,
      notes,
    });

    return NextResponse.json({
      success: true,
      placementId: placement.id,
      status: placement.status,
      reportedAt: placement.reportedAt,
    });
  } catch (err: any) {
    const status = err.message?.startsWith('UNAUTHORIZED') ? 401 : err.message?.startsWith('FORBIDDEN') ? 403 : 400;
    return NextResponse.json({ error: err.message || 'Failed to report hire' }, { status });
  }
}
