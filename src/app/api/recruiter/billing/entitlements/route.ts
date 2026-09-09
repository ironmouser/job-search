import { NextResponse } from 'next/server';
import { requireVerifiedRecruiter } from '@/lib/recruiter/auth';
import { getRecruiterOrgEntitlements } from '@/lib/recruiter/recruiterBillingService';

export async function GET() {
  try {
    const recruiter = await requireVerifiedRecruiter();
    const entitlements = await getRecruiterOrgEntitlements(recruiter.organizationId);

    return NextResponse.json({
      success: true,
      entitlements,
    });
  } catch (error: any) {
    console.error('[RECRUITER_ENTITLEMENTS]', error);
    const status = error.message?.startsWith('UNAUTHORIZED') ? 401 : error.message?.startsWith('FORBIDDEN') ? 403 : 500;
    return NextResponse.json({ error: error.message || 'Failed to fetch recruiter entitlements' }, { status });
  }
}
