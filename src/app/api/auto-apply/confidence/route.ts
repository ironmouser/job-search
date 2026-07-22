import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { scoreConfidence } from '@/lib/auto-apply/confidence-scorer';
import { ConfidenceInput } from '@/lib/auto-apply/types';

/**
 * POST /api/auto-apply/confidence
 *
 * Score the automation confidence for a given application.
 * Accepts known risk factors and returns a score + recommendation.
 *
 * Body: ConfidenceInput
 * Response: ConfidenceResult
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: ConfidenceInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.platform) {
    return NextResponse.json({ error: 'platform is required' }, { status: 400 });
  }

  const result = scoreConfidence(body);
  return NextResponse.json(result);
}
