import { NextResponse } from 'next/server';
import { requireVerifiedRecruiter } from '@/lib/recruiter/auth';
import { getRecruiterAnalytics } from '@/lib/recruiter/analyticsService';

export async function GET() {
  try {
    const recruiter = await requireVerifiedRecruiter();
    const analytics = await getRecruiterAnalytics(recruiter.organizationId);

    return NextResponse.json({
      success: true,
      analytics,
    });
  } catch (error: any) {
    const status = error.message?.startsWith('UNAUTHORIZED') ? 401 : error.message?.startsWith('FORBIDDEN') ? 403 : 500;
    return NextResponse.json({ error: error.message || 'Failed to generate analytics' }, { status });
  }
}
