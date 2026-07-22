import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { detectATSFromUrl } from '@/lib/auto-apply/ats-detector-lite';

/**
 * POST /api/auto-apply/detect
 *
 * Lightweight ATS detection from a job URL — no browser, no Playwright.
 * Used in the pre-flight modal to show the detected ATS before the user
 * clicks Auto Apply.
 *
 * Body: { jobUrl: string }
 * Response: ATSDetectionResult
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { jobUrl: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.jobUrl) {
    return NextResponse.json({ error: 'jobUrl is required' }, { status: 400 });
  }

  try {
    new URL(body.jobUrl); // validate URL
  } catch {
    return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
  }

  const result = detectATSFromUrl(body.jobUrl);
  return NextResponse.json(result);
}
