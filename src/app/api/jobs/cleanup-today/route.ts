import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const dateParam = url.searchParams.get('date'); // optional date YYYY-MM-DD

    // Default "today" start: 2026-08-04T00:00:00-04:00 (or past 24h if unspecified)
    // Local time reported: 2026-08-04T21:44 EDT
    const todayStart = dateParam ? new Date(`${dateParam}T00:00:00-04:00`) : new Date('2026-08-04T00:00:00-04:00');

    const allJobs = await prisma.job.findMany({
      where: {
        createdAt: {
          gte: todayStart
        }
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        company: true,
        location: true,
        source: true,
        addedById: true,
        createdAt: true
      }
    });

    const scrapedJobs = allJobs.filter(j => !j.addedById);
    const userAddedJobs = allJobs.filter(j => j.addedById);

    const scrapedBySource: Record<string, number> = {};
    scrapedJobs.forEach(j => {
      const src = j.source || 'unknown';
      scrapedBySource[src] = (scrapedBySource[src] || 0) + 1;
    });

    return NextResponse.json({
      success: true,
      filterStart: todayStart.toISOString(),
      totalJobsAddedToday: allJobs.length,
      scrapedJobsCount: scrapedJobs.length,
      userAddedJobsCount: userAddedJobs.length,
      scrapedBySource,
      scrapedJobsSample: scrapedJobs.map(j => ({
        id: j.id,
        title: j.title,
        company: j.company,
        location: j.location,
        source: j.source,
        createdAt: j.createdAt
      })),
      userAddedJobsSample: userAddedJobs.map(j => ({
        id: j.id,
        title: j.title,
        company: j.company,
        createdAt: j.createdAt
      }))
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const confirm = url.searchParams.get('confirm') === 'true';
    const dateParam = url.searchParams.get('date');

    const todayStart = dateParam ? new Date(`${dateParam}T00:00:00-04:00`) : new Date('2026-08-04T00:00:00-04:00');

    if (!confirm) {
      return NextResponse.json({
        success: false,
        message: 'Must pass ?confirm=true to execute deletion.'
      }, { status: 400 });
    }

    // Find scraped jobs added today (addedById is null)
    const scrapedJobsToday = await prisma.job.findMany({
      where: {
        createdAt: { gte: todayStart },
        addedById: null
      },
      select: { id: true }
    });

    const jobIdsToDelete = scrapedJobsToday.map(j => j.id);

    if (jobIdsToDelete.length === 0) {
      return NextResponse.json({
        success: true,
        deletedCount: 0,
        message: 'No scraped jobs found to delete for today.'
      });
    }

    // Delete matching jobs (Cascading delete will remove associated UserJob, OpportunityScore, ApplicationAsset, JobFeedback)
    const deleteResult = await prisma.job.deleteMany({
      where: {
        id: { in: jobIdsToDelete }
      }
    });

    return NextResponse.json({
      success: true,
      deletedCount: deleteResult.count,
      deletedJobIds: jobIdsToDelete,
      message: `Successfully deleted ${deleteResult.count} scraped jobs added today.`
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
