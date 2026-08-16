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

  let result = detectATSFromUrl(body.jobUrl);

  // If initial URL is unknown or an aggregator (LinkedIn/Indeed), attempt lightweight HTTP redirect resolution
  const isAggregator = body.jobUrl.includes('linkedin.com') || body.jobUrl.includes('indeed.com') || body.jobUrl.includes('ziprecruiter.com') || body.jobUrl.includes('glassdoor.com');
  if (result.confidence < 50 || isAggregator) {
    try {
      const res = await fetch(body.jobUrl, { method: 'HEAD', redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' } });
      if (res.url && res.url !== body.jobUrl) {
        const resolvedResult = detectATSFromUrl(res.url);
        if (resolvedResult.confidence > result.confidence) {
          return NextResponse.json({ ...resolvedResult, resolvedUrl: res.url });
        }
      }
    } catch {
      // Ignore fetch redirect errors and fallback to original URL detection
    }
  }

  return NextResponse.json(result);
}
