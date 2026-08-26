import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { respondToIntroduction } from '@/lib/recruiter/attributionService';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireAuth();
  if (error || !user) return error;

  try {
    const { id } = await params;
    const body = await req.json();
    const { response, notes } = body;

    if (response !== 'ACCEPTED' && response !== 'DECLINED') {
      return NextResponse.json(
        { error: 'Invalid response. Must be ACCEPTED or DECLINED' },
        { status: 400 }
      );
    }

    const updated = await respondToIntroduction({
      introductionId: id,
      candidateId: user.id,
      response,
      notes,
    });

    return NextResponse.json({
      success: true,
      status: updated.currentStatus,
      acceptedAt: updated.acceptedAt,
      declinedAt: updated.declinedAt,
    });
  } catch (err: any) {
    console.error('Failed to respond to introduction:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to process introduction response' },
      { status: 400 }
    );
  }
}
