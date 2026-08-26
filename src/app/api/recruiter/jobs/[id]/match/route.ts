import { NextRequest, NextResponse } from 'next/server';
import { requireVerifiedRecruiter } from '@/lib/recruiter/auth';
import { prisma } from '@/lib/prisma';
import { runMatchingForJob } from '@/lib/recruiter/jobMatchingService';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const recruiter = await requireVerifiedRecruiter();
    const { id } = await params;

    const job = await prisma.recruiterJob.findFirst({
      where: { id, organizationId: recruiter.organizationId },
    });

    if (!job) {
      return NextResponse.json({ error: 'Job opening not found' }, { status: 404 });
    }

    const results = await runMatchingForJob(job.id, recruiter.userId, 25);

    return NextResponse.json({
      success: true,
      jobId: job.id,
      candidatesScored: results.length,
      topScores: results.slice(0, 5).map((r) => ({
        candidateId: r.candidateId,
        score: r.jobFitScore,
      })),
    });
  } catch (err: any) {
    const status = err.message?.startsWith('UNAUTHORIZED') ? 401 : err.message?.startsWith('FORBIDDEN') ? 403 : 500;
    return NextResponse.json({ error: err.message || 'Failed to run matching' }, { status });
  }
}
