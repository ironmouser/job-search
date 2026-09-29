import { NextRequest, NextResponse } from 'next/server';
import { processExpiredIntroductions } from '@/lib/recruiter/attributionService';

export async function POST(req: NextRequest) {
  // 1. Verify internal API key authorization
  const authHeader = req.headers.get('authorization');
  const expectedKey = process.env.WORKER_API_KEY || process.env.INTERNAL_API_KEY;

  if (expectedKey && authHeader !== `Bearer ${expectedKey}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
