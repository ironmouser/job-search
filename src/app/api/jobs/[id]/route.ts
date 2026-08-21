import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { headers } from 'next/headers';
import { reformatJobDescriptionWithGemini, formatDescriptionMarkdown } from '@/lib/formatter';
import { scoreJob } from '@/lib/scoring';
import { logSuspiciousActivity } from '@/lib/security';
import { isDescriptionAdequate, extractUrlFromStubDescription } from '@/lib/jobFetcher';
import { getEffectiveTier } from '@/lib/tier';
import { calculateResumeSimilarity } from '@/lib/similarity';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        
        const userId = session.user.id;
        const resolvedParams = await params;
        const id = resolvedParams?.id;
        if (!id) {
          return NextResponse.json({ error: 'Missing job ID parameter' }, { status: 400 });
        }

        const user = await prisma.user.findUnique({
          where: { id: userId },
          include: { userPreferences: true }
        });
        const planTier = user ? getEffectiveTier(user) : 'FREE';
        const preferences = user?.userPreferences;

        let userName = 'My';
        if (user?.name) {
          userName = user.name;
        } else if (preferences?.resumeMarkdown) {
          const nameMatch = preferences.resumeMarkdown.match(/^#\s+([^\n]+)/);
          if (nameMatch && nameMatch[1]) {
            userName = nameMatch[1].trim();
          }
        }

        let userLocation: string | undefined;
        let userPhone: string | undefined;
        const resumeText = preferences?.resumeMarkdown || '';
        const phoneMatch = resumeText.match(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
        if (phoneMatch) userPhone = phoneMatch[0];
        const locationMatch = resumeText.match(/[A-Z][a-zA-Z\s]+,\s*[A-Z]{2}(?:\s+\d{5})?/);
        if (locationMatch) userLocation = locationMatch[0];

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const headerStore = await headers();
        const forwardedFor = headerStore.get('x-forwarded-for');
        const ipAddress = forwardedFor ? forwardedFor.split(',')[0] : 'unknown';

        let appliesThisWeek = await prisma.userJob.count({
          where: {
            userId,
            appliedAt: { gte: sevenDaysAgo }
          }
        });

        if (ipAddress !== 'unknown') {
          const otherUsersOnIp = await prisma.userJob.findMany({
            where: {
              ipAddress,
              appliedAt: { gte: sevenDaysAgo },
              userId: { not: userId }
            },
            select: { userId: true },
            distinct: ['userId']
          });

          if (otherUsersOnIp.length > 0) {
            const currentUserResume = preferences?.resumeMarkdown;
            for (const { userId: otherUserId } of otherUsersOnIp) {
              const otherPrefs = await prisma.userPreferences.findUnique({
                where: { userId: otherUserId },
                select: { resumeMarkdown: true }
              });
              const similarity = calculateResumeSimilarity(currentUserResume, otherPrefs?.resumeMarkdown);
              if (similarity > 0.8) {
                const aliasApplies = await prisma.userJob.count({
                  where: {
                    userId: otherUserId,
                    appliedAt: { gte: sevenDaysAgo }
                  }
                });
                appliesThisWeek += aliasApplies;
              }
            }
          }
        }

        const userJob = await prisma.userJob.findUnique({
          where: {
            userId_jobId: {
              userId,
              jobId: id
            }
          },
          include: {
            job: {
              include: {
                opportunityScores: { where: { userId } },
                applicationAssets: { where: { userId } },
                jobFeedbacks: { where: { userId } }
              }
            }
          }
        });

        if (!userJob) {
          return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        }

        const job = userJob.job;

        if (!job.isViewed) {
          await prisma.job.update({
            where: { id: job.id },
            data: { isViewed: true }
          }).catch(() => {});
        }

        const status = userJob.status;
        const appliedAt = userJob.appliedAt;
        const scores = job.opportunityScores?.[0] || null;
        const assets = job.applicationAssets?.[0] || null;
        const feedback = job.jobFeedbacks?.[0] || null;

        const hasBaseResume = Boolean(
          preferences?.resumeMarkdown && 
          preferences.resumeMarkdown.trim().length > 30 && 
          !preferences.resumeMarkdown.startsWith('# Candidate Profile')
        );

        let scoresExhausted = false;
        let assetGenerationsLeft = 1;
        if (planTier !== 'PRO') {
          const scoresThisWeek = await prisma.opportunityScore.count({
            where: {
              userId,
              createdAt: { gte: sevenDaysAgo }
            }
          });
          if (scoresThisWeek >= 10) {
            scoresExhausted = true;
          }

          const assetGenerationsThisWeek = await prisma.applicationAsset.count({
            where: {
              userId,
              createdAt: { gte: sevenDaysAgo }
            }
          });
          assetGenerationsLeft = Math.max(0, 1 - assetGenerationsThisWeek);
        }

        const formattedHtml = formatDescriptionMarkdown(job.description);

        return NextResponse.json({
          job: {
            id: job.id,
            title: job.title,
            company: job.company,
            location: job.location,
            salaryRange: job.salaryRange,
            url: job.url,
            applicationUrl: job.applicationUrl,
            description: job.description,
            formattedDescriptionHtml: formattedHtml,
            isEasyApply: job.isEasyApply,
            source: job.source,
            isViewed: true,
            unlockedBySubmission: userJob.unlockedBySubmission || job.addedById === userId,
            createdAt: job.createdAt
          },
          userJob: {
            status,
            appliedAt,
            isArchived: userJob.isArchived
          },
          scores,
          assets,
          feedback,
          planTier,
          preferences: preferences ? {
            resumeMarkdown: preferences.resumeMarkdown,
            networkingMessageTone: preferences.networkingMessageTone,
            coverLetterTone: preferences.coverLetterTone,
            coverLetterPdfTemplate: preferences.coverLetterPdfTemplate,
            coverLetterPdfFontFamily: preferences.coverLetterPdfFontFamily,
            coverLetterPdfFontSize: preferences.coverLetterPdfFontSize,
            coverLetterPdfLineHeight: preferences.coverLetterPdfLineHeight,
            coverLetterPdfPrimaryColor: preferences.coverLetterPdfPrimaryColor,
            coverLetterPdfTextColor: preferences.coverLetterPdfTextColor,
            coverLetterPdfMargin: preferences.coverLetterPdfMargin,
            coverLetterPdfHeaderLayout: preferences.coverLetterPdfHeaderLayout,
            resumePdfTemplate: preferences.resumePdfTemplate,
            resumePdfFontFamily: preferences.resumePdfFontFamily,
            resumePdfFontSize: preferences.resumePdfFontSize,
            resumePdfLineHeight: preferences.resumePdfLineHeight,
            resumePdfPrimaryColor: preferences.resumePdfPrimaryColor,
            resumePdfTextColor: preferences.resumePdfTextColor,
            resumePdfMargin: preferences.resumePdfMargin,
            resumePdfHeaderLayout: preferences.resumePdfHeaderLayout,
            resumeCustomizationMaxPercentage: preferences.resumeCustomizationMaxPercentage,
          } : null,
          userContact: {
            userName,
            userLocation,
            userPhone,
            userEmail: user?.email || undefined
          },
          appliesThisWeek,
          hasBaseResume,
          scoresExhausted,
          assetGenerationsLeft
        });
    } catch (e: any) {
        console.error('Failed to fetch job details:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}


export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        
        const userId = session.user.id;
        const resolvedParams = await params;
        const id = resolvedParams?.id;
        if (!id) {
          return NextResponse.json({ error: 'Missing job ID parameter' }, { status: 400 });
        }

        const body = await request.json().catch(() => ({}));
        const { status, applied_at, applicationUrl, description } = body;

        const job = await prisma.job.findUnique({
            where: { id }
        });
        if (!job) {
            return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        }
        
        const isAdmin = (session.user as any).role === 'SYSTEM_ADMIN';
        const isGlobalJob = job.addedById === null;

        if (description) {
            // Allow modifying job description if user owns job, is admin, or it's a shared/global job stub
            const isOwnerOrAdmin = isAdmin || job.addedById === userId;

            if (!isOwnerOrAdmin && !isGlobalJob) {
                await logSuspiciousActivity({ type: 'UNAUTHORIZED_MODIFICATION_ATTEMPT', message: 'Attempted to modify a private job not owned by user', userId, metadata: { jobId: id, requestedChanges: { description: !!description, applicationUrl: !!applicationUrl } } });
                return NextResponse.json(
                    { error: 'Unauthorized to modify shared job properties. Only the original creator can edit this job.' },
                    { status: 403 }
                );
            }
        }

        const updateJobData: any = {};

        if (applicationUrl) {
            updateJobData.applicationUrl = applicationUrl.trim();
            updateJobData.consecutiveAutoFailures = 0;
        }

        if (description) {
            let formattedDesc = description;
            if (formattedDesc.length > 50 && !formattedDesc.includes('## ')) {
                try {
                    formattedDesc = await reformatJobDescriptionWithGemini(description);
                } catch (e) {
                    console.warn('Formatting job description failed:', e);
                }
            }

            // If applicationUrl wasn't explicitly provided, check if description has an embedded URL
            if (!updateJobData.applicationUrl) {
                const embeddedUrl = extractUrlFromStubDescription(description);
                if (embeddedUrl && !embeddedUrl.includes('ziprecruiter.com') && !embeddedUrl.includes('linkedin.com')) {
                    updateJobData.applicationUrl = embeddedUrl;
                }
            }

            updateJobData.description = formattedDesc;

            const targetJobId = id;
            const updatedJob = await prisma.job.update({
                where: { id },
                data: updateJobData
            });

            await prisma.userJob.upsert({
                where: { userId_jobId: { userId, jobId: id } },
                update: { status: 'discovered' },
                create: { userId, jobId: id, status: 'discovered' }
            });

            // Trigger scoring in background so PATCH responds immediately without timing out
            scoreJob(userId, targetJobId, updatedJob.title, formattedDesc).catch((scoreErr: any) => {
                console.error("Error scoring job in background:", scoreErr);
            });

            return NextResponse.json({ success: true, newJobId: targetJobId });
        }

        if (Object.keys(updateJobData).length > 0) {
            await prisma.job.update({
                where: { id },
                data: updateJobData
            });
        }

        if (status) {
            const updateData: any = { status: String(status).toLowerCase() };
            if (applied_at) {
                const headerStore = await headers();
                const forwardedFor = headerStore.get('x-forwarded-for');
                const ipAddress = forwardedFor ? forwardedFor.split(',')[0] : 'unknown';
                
                updateData.appliedAt = new Date(applied_at);
                updateData.ipAddress = ipAddress;
            }

            const data = await prisma.userJob.upsert({
                where: { userId_jobId: { userId, jobId: id } },
                update: updateData,
                create: {
                    userId,
                    jobId: id,
                    ...updateData
                }
            });

            return NextResponse.json(data);
        }

        return NextResponse.json({ success: true });
    } catch (e: any) {
        console.error('Failed to update job status:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        
        const userId = session.user.id;
        const resolvedParams = await params;
        const id = resolvedParams?.id;
        if (!id) {
            return NextResponse.json({ error: 'Missing job ID parameter' }, { status: 400 });
        }

        const data = await prisma.userJob.update({
            where: { userId_jobId: { userId, jobId: id } },
            data: { status: 'deleted' }
        });

        return NextResponse.json({ success: true, data });
    } catch (e: any) {
        console.error('Failed to delete job:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
