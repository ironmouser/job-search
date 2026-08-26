import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { confirmHire } from '@/lib/recruiter/attributionService';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireAuth();
  if (error) return error;

  try {
    const { id } = await params;
    const placement = await confirmHire(id, user.id);

    return NextResponse.json({
      success: true,
      placementId: placement.id,
      status: placement.status,
      confirmedAt: placement.confirmedAt,
    });
  } catch (err: any) {
    console.error('Failed to confirm placement:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to confirm placement' },
      { status: 400 }
    );
  }
}
