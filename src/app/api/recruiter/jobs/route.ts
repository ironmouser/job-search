import { NextRequest, NextResponse } from 'next/server';
import { requireVerifiedRecruiter } from '@/lib/recruiter/auth';
import { prisma } from '@/lib/prisma';
import { generatePublicId } from '@/lib/recruiter/config';
import { parseRecruiterJobDescription } from '@/lib/recruiter/jobParser';
import { runMatchingForJob } from '@/lib/recruiter/jobMatchingService';
import { RecruiterJobStatus } from '@prisma/client';

export async function GET() {
  try {
    const recruiter = await requireVerifiedRecruiter();

    const jobs = await prisma.recruiterJob.findMany({
      where: { organizationId: recruiter.organizationId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            matches: true,
            introductions: true,
          },
        },
      },
    });

    return NextResponse.json({
      jobs: jobs.map((job) => ({
        id: job.id,
        publicId: job.publicId,
        title: job.title,
        seniority: job.seniority,
        requiredSkills: job.requiredSkills,
        preferredSkills: job.preferredSkills,
        experienceMinYears: job.experienceMinYears,
        location: job.location,
        remoteType: job.remoteType,
        employmentType: job.employmentType,
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        salaryCurrency: job.salaryCurrency,
        status: job.status,
        createdAt: job.createdAt,
        matchCount: job._count.matches,
        introductionCount: job._count.introductions,
      })),
    });
  } catch (err: any) {
    const status = err.message?.startsWith('UNAUTHORIZED') ? 401 : err.message?.startsWith('FORBIDDEN') ? 403 : 500;
    return NextResponse.json({ error: err.message || 'Failed to list recruiter jobs' }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const recruiter = await requireVerifiedRecruiter();
    const body = await req.json();
    const { title, description } = body;

    if (!description || description.trim().length === 0) {
      return NextResponse.json(
        { error: 'Job description is required' },
        { status: 400 }
      );
    }

    // 1. Normalize description and extract structured fields using AI parser
    const parsed = await parseRecruiterJobDescription(description);

    const jobTitle = title || parsed.title || 'Untitled Position';
    const publicId = generatePublicId('JHQ-JOB');

    // 2. Persist RecruiterJob
    const job = await prisma.recruiterJob.create({
      data: {
        publicId,
        organizationId: recruiter.organizationId,
        createdByRecruiterId: recruiter.recruiterId,
        title: jobTitle,
        description,
        normalizedDescription: parsed.normalizedDescription,
        seniority: parsed.seniority || null,
        requiredSkills: parsed.requiredSkills,
        preferredSkills: parsed.preferredSkills,
        experienceMinYears: parsed.experienceMinYears || null,
        location: parsed.location || null,
        remoteType: parsed.remoteType || 'REMOTE',
        employmentType: parsed.employmentType || 'FULL_TIME',
        salaryMin: parsed.salaryMin || null,
        salaryMax: parsed.salaryMax || null,
        salaryCurrency: parsed.salaryCurrency || 'USD',
        status: RecruiterJobStatus.ACTIVE,
      },
    });

    // 3. Trigger initial candidate matching asynchronously (fail-safe)
    runMatchingForJob(job.id, recruiter.userId, 20).catch((matchErr) => {
      console.error(`Background matching failed for new job ${job.id}:`, matchErr);
    });

    return NextResponse.json({
      success: true,
      job: {
        id: job.id,
        publicId: job.publicId,
        title: job.title,
        seniority: job.seniority,
        location: job.location,
        remoteType: job.remoteType,
        requiredSkills: job.requiredSkills,
        status: job.status,
      },
    });
  } catch (err: any) {
    const status = err.message?.startsWith('UNAUTHORIZED') ? 401 : err.message?.startsWith('FORBIDDEN') ? 403 : 500;
    return NextResponse.json({ error: err.message || 'Failed to create job opening' }, { status });
  }
}
