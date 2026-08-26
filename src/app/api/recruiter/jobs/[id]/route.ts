import { NextRequest, NextResponse } from 'next/server';
import { requireVerifiedRecruiter } from '@/lib/recruiter/auth';
import { prisma } from '@/lib/prisma';
import { sanitizeCandidateForDiscovery } from '@/lib/recruiter/sanitizer';
import { getOrComputeCandidateIntent } from '@/lib/recruiter/intentService';
import { RecruiterJobStatus } from '@prisma/client';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const recruiter = await requireVerifiedRecruiter();
    const { id } = await params;

    const job = await prisma.recruiterJob.findFirst({
      where: {
        id,
        organizationId: recruiter.organizationId,
      },
      include: {
        matches: {
          orderBy: { jobFitScore: 'desc' },
          take: 50,
          include: {
            candidate: {
              select: {
                id: true,
                name: true,
                isDisabled: true,
                userPreferences: {
                  select: {
                    profile: true,
                    resumeMarkdown: true,
                    city: true,
                    state: true,
                    location: true,
                    remoteOnly: true,
                    searchKeyword: true,
                    jobLevel: true,
                    expectedSalary: true,
                  },
                },
              },
            },
          },
        },
        introductions: {
          select: {
            id: true,
            publicId: true,
            candidateId: true,
            currentStatus: true,
            requestedAt: true,
            acceptedAt: true,
          },
        },
      },
    });

    if (!job) {
      return NextResponse.json({ error: 'Job opening not found' }, { status: 404 });
    }

    // Build candidate DTOs with intent snapshots and introduction statuses
    const introMap = new Map(job.introductions.map((i) => [i.candidateId, i]));

    const scoredCandidates = await Promise.all(
      job.matches
        .filter((m) => !m.candidate.isDisabled && m.candidate.id !== recruiter.userId)
        .map(async (match) => {
          const intent = await getOrComputeCandidateIntent(match.candidateId);
          const sanitized = sanitizeCandidateForDiscovery({
            user: match.candidate,
            preferences: match.candidate.userPreferences,
            match: {
              jobFitScore: match.jobFitScore,
              matchReasons: match.matchReasons,
            },
            intent,
          });

          const existingIntro = introMap.get(match.candidateId);

          return {
            ...sanitized,
            matchId: match.id,
            matchVersion: match.matchVersion,
            scoredAt: match.scoredAt,
            introductionStatus: existingIntro?.currentStatus || null,
            introductionId: existingIntro?.id || null,
          };
        })
    );

    return NextResponse.json({
      job: {
        id: job.id,
        publicId: job.publicId,
        title: job.title,
        description: job.normalizedDescription || job.description,
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
      },
      matches: scoredCandidates,
    });
  } catch (err: any) {
    const status = err.message?.startsWith('UNAUTHORIZED') ? 401 : err.message?.startsWith('FORBIDDEN') ? 403 : 500;
    return NextResponse.json({ error: err.message || 'Failed to get recruiter job' }, { status });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const recruiter = await requireVerifiedRecruiter();
    const { id } = await params;
    const body = await req.json();
    const { title, status, location, remoteType, salaryMin, salaryMax } = body;

    const job = await prisma.recruiterJob.findFirst({
      where: { id, organizationId: recruiter.organizationId },
    });

    if (!job) {
      return NextResponse.json({ error: 'Job opening not found' }, { status: 404 });
    }

    const updated = await prisma.recruiterJob.update({
      where: { id },
      data: {
        title: title || undefined,
        status: status ? (status as RecruiterJobStatus) : undefined,
        location: location !== undefined ? location : undefined,
        remoteType: remoteType || undefined,
        salaryMin: typeof salaryMin === 'number' ? salaryMin : undefined,
        salaryMax: typeof salaryMax === 'number' ? salaryMax : undefined,
      },
    });

    return NextResponse.json({ success: true, job: updated });
  } catch (err: any) {
    const status = err.message?.startsWith('UNAUTHORIZED') ? 401 : err.message?.startsWith('FORBIDDEN') ? 403 : 500;
    return NextResponse.json({ error: err.message || 'Failed to update job opening' }, { status });
  }
}
