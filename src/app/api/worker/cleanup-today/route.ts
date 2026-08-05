import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const execute = url.searchParams.get('execute') === 'true';
    const dateParam = url.searchParams.get('date');

    const todayStart = dateParam ? new Date(`${dateParam}T00:00:00-04:00`) : new Date('2026-08-04T00:00:00-04:00');

    if (execute) {
      // Find all jobs added today
      const jobsToday = await prisma.job.findMany({
        where: {
          createdAt: { gte: todayStart }
        },
        select: { id: true, source: true, title: true }
      });

      const jobIdsToDelete = jobsToday.map(j => j.id);

      if (jobIdsToDelete.length === 0) {
        return NextResponse.json({
          success: true,
          deletedCount: 0,
          message: 'No jobs found to delete for today.'
        });
      }

      // Delete matching jobs (Cascading delete removes UserJob, OpportunityScore, ApplicationAsset, JobFeedback)
      const deleteResult = await prisma.job.deleteMany({
        where: {
          id: { in: jobIdsToDelete }
        }
      });

      return NextResponse.json({
        success: true,
        deletedCount: deleteResult.count,
        deletedJobIdsCount: jobIdsToDelete.length,
        message: `Successfully deleted ${deleteResult.count} jobs added today.`
      });
    }

    const allJobs = await prisma.job.findMany({
      where: {
        createdAt: {
          gte: todayStart
        }
      },
      select: {
        id: true,
        source: true,
        addedById: true,
        createdAt: true
      }
    });

    return NextResponse.json({
      success: true,
      filterStart: todayStart.toISOString(),
      totalJobsAddedToday: allJobs.length,
      scrapedJobsCount: allJobs.filter(j => !j.addedById).length
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
