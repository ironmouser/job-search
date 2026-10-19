import { NextRequest, NextResponse } from 'next/server';
import { processExpiredIntroductions } from '@/lib/recruiter/attributionService';
import { authenticateInternalRequest } from '@/lib/auth-helpers';

export async function POST(req: NextRequest) {
  // 1. Verify internal API key authorization
  const authError = authenticateInternalRequest(req);
  if (authError) return authError;

  try {
    const result = await processExpiredIntroductions();
    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    console.error('Failed to process expired introductions:', err);
    return NextResponse.json(
      { error: err.message || 'Internal process expired introductions failed' },
      { status: 500 }
    );
  }
}
