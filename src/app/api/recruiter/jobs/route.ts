import { NextRequest, NextResponse } from 'next/server';
import { requireVerifiedRecruiter } from '@/lib/recruiter/auth';
import { prisma } from '@/lib/prisma';
import { generatePublicId } from '@/lib/recruiter/config';
import { parseRecruiterJobDescription } from '@/lib/recruiter/jobParser';
import { runMatchingForJob } from '@/lib/recruiter/jobMatchingService';
import { RecruiterJobStatus } from '@prisma/client';

import { assertCanPublishJob, PaymentRequiredError } from '@/lib/recruiter/recruiterBillingService';

export async function GET(req: NextRequest) {
  try {
    const recruiter = await requireVerifiedRecruiter();
    const assignedTo = req.nextUrl?.searchParams?.get('assignedTo') || null;

    const where: any = { organizationId: recruiter.organizationId };
    if (assignedTo === 'me') {
      where.OR = [
        { createdByRecruiterId: recruiter.recruiterId },
        { assignedRecruiterId: recruiter.recruiterId },
      ];
    }

    let jobs: any[] = [];
    try {
      jobs = await prisma.recruiterJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          assignedRecruiter: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          _count: {
            select: {
              matches: true,
              introductions: true,
            },
          },
        },
      });
    } catch (queryErr: any) {
      console.warn('[API_RECRUITER_JOBS_GET] Query with relation failed, attempting base fallback:', queryErr?.message);
      // Resilient fallback in case running server has not reloaded assignedRecruiter relation
      jobs = await prisma.recruiterJob.findMany({
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
    }

    return NextResponse.json({
      jobs: jobs.map((job) => ({
        id: job.id,
        publicId: job.publicId,
        title: job.title,
        seniority: job.seniority,
        requiredSkills: job.requiredSkills || [],
        preferredSkills: job.preferredSkills || [],
        experienceMinYears: job.experienceMinYears,
        location: job.location,
        remoteType: job.remoteType,
        employmentType: job.employmentType,
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        salaryCurrency: job.salaryCurrency,
        status: job.status,
        createdAt: job.createdAt,
        assignedRecruiter: job.assignedRecruiter
          ? `${job.assignedRecruiter.firstName} ${job.assignedRecruiter.lastName}`
          : null,
        assignedRecruiterId: job.assignedRecruiterId || null,
        matchCount: job._count?.matches || 0,
        introductionCount: job._count?.introductions || 0,
      })),
    });
  } catch (err: any) {
    console.error('[API_RECRUITER_JOBS_GET_ERROR]', err);
    const status = err.message?.startsWith('UNAUTHORIZED') ? 401 : err.message?.startsWith('FORBIDDEN') ? 403 : 500;
    return NextResponse.json(
      {
        error: err.message || 'Failed to list recruiter jobs',
        details: process.env.NODE_ENV === 'development' ? err.stack : undefined,
      },
      { status }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const recruiter = await requireVerifiedRecruiter();

    // Verify organization job posting quota
    await assertCanPublishJob(recruiter.organizationId);

    const body = await req.json();
    const { title, description, assignedRecruiterId } = body;

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
        assignedRecruiterId: assignedRecruiterId || null,
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
    if (err instanceof PaymentRequiredError) {
      return NextResponse.json(
        {
          error: err.message,
          code: err.code,
          entitlements: err.details,
        },
        { status: 402 }
      );
    }
    const status = err.message?.startsWith('UNAUTHORIZED') ? 401 : err.message?.startsWith('FORBIDDEN') ? 403 : 500;
    return NextResponse.json({ error: err.message || 'Failed to create recruiter job' }, { status });
  }
}
