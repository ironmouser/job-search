import { NextRequest, NextResponse } from 'next/server';
import { requireVerifiedRecruiter } from '@/lib/recruiter/auth';
import { prisma } from '@/lib/prisma';
import { runMatchingForJob, notifyRecruitersOfNewMatches } from '@/lib/recruiter/jobMatchingService';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const recruiter = await requireVerifiedRecruiter();
    const { id } = await params;

    const job = await prisma.recruiterJob.findFirst({
      where: { id, organizationId: recruiter.organizationId },
      include: {
        organization: true,
      },
    });

    if (!job) {
      return NextResponse.json({ error: 'Job opening not found' }, { status: 404 });
    }

    if (!job.organization.candidateAlertsEnabled) {
      return NextResponse.json(
        { error: 'Candidate alerts are not enabled for your organization subscription plan.' },
        { status: 403 }
      );
    }

    // Run matching for job to get latest scores
    const matches = await runMatchingForJob(id, recruiter.userId);

    // Notify recruiters
    const { sent } = await notifyRecruitersOfNewMatches({ jobId: id, matches });

    return NextResponse.json({
      success: true,
      jobId: id,
      matchesEvaluated: matches.length,
      alertsSent: sent,
    });
  } catch (err: any) {
    const status = err.message?.startsWith('UNAUTHORIZED') ? 401 : err.message?.startsWith('FORBIDDEN') ? 403 : 500;
    return NextResponse.json({ error: err.message || 'Failed to dispatch candidate alerts' }, { status });
  }
}
