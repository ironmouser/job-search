import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;

  try {
    const introductions = await prisma.introduction.findMany({
      where: { candidateId: user.id },
      orderBy: { requestedAt: 'desc' },
      select: {
        id: true,
        publicId: true,
        requestedAt: true,
        currentStatus: true,
        acceptedAt: true,
        declinedAt: true,
        contactSharedAt: true,
        notes: true,
        jobFitScore: true,
        recruiterJob: {
          select: {
            title: true,
            location: true,
            remoteType: true,
            employmentType: true,
            salaryMin: true,
            salaryMax: true,
            salaryCurrency: true,
            normalizedDescription: true,
            requiredSkills: true,
            preferredSkills: true,
          },
        },
        organization: {
          select: {
            name: true,
            type: true,
            website: true,
            logoUrl: true,
          },
        },
        recruiter: {
          select: {
            firstName: true,
            lastName: true,
            title: true,
            profilePhotoUrl: true,
            linkedinUrl: true,
          },
        },
      },
    });

    return NextResponse.json({
      introductions: introductions.map((intro) => ({
        id: intro.id,
        publicId: intro.publicId,
        requestedAt: intro.requestedAt,
        status: intro.currentStatus,
        acceptedAt: intro.acceptedAt,
        declinedAt: intro.declinedAt,
        contactSharedAt: intro.contactSharedAt,
        jobFitScore: intro.jobFitScore,
        job: {
          title: intro.recruiterJob.title,
          location: intro.recruiterJob.location,
          remoteType: intro.recruiterJob.remoteType,
          employmentType: intro.recruiterJob.employmentType,
          salaryRange:
            intro.recruiterJob.salaryMin && intro.recruiterJob.salaryMax
              ? `$${intro.recruiterJob.salaryMin.toLocaleString()} - $${intro.recruiterJob.salaryMax.toLocaleString()} ${intro.recruiterJob.salaryCurrency}`
              : null,
          description: intro.recruiterJob.normalizedDescription,
          requiredSkills: intro.recruiterJob.requiredSkills,
          preferredSkills: intro.recruiterJob.preferredSkills,
        },
        organization: {
          name: intro.organization.name,
          website: intro.organization.website,
          logoUrl: intro.organization.logoUrl,
        },
        recruiter: {
          name: `${intro.recruiter.firstName} ${intro.recruiter.lastName}`,
          title: intro.recruiter.title,
          profilePhotoUrl: intro.recruiter.profilePhotoUrl,
          linkedinUrl: intro.recruiter.linkedinUrl,
        },
      })),
    });
  } catch (err: any) {
    console.error('Failed to fetch candidate introductions:', err);
    return NextResponse.json({ error: 'Failed to retrieve introductions' }, { status: 500 });
  }
}
