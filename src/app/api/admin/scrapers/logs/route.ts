import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
    const session = await getServerSession(authOptions);

    if (!session?.user || (session.user as any).role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    try {
        // Fetch recent logs
        const logs = await prisma.scraperLog.findMany({
            orderBy: { createdAt: 'desc' },
            take: 100,
        });

        // Calculate summary statistics over the last 24 hours
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentStats = await prisma.scraperLog.findMany({
            where: { createdAt: { gte: oneDayAgo } },
        });

        let totalJobsScraped = 0;
        let firecrawlUses = 0;
        let successfulRuns = 0;
        let totalRuns = recentStats.length;

        recentStats.forEach(log => {
            totalJobsScraped += log.resultsCount;
            if (log.usedFirecrawl) {
                firecrawlUses += log.firecrawlSites.length || 1;
            }
            if (log.status === 'SUCCESS') {
                successfulRuns++;
            }
        });

        const successRate = totalRuns > 0 ? ((successfulRuns / totalRuns) * 100).toFixed(1) : '0.0';

        return NextResponse.json({
            logs,
            stats: {
                totalJobsScraped24h: totalJobsScraped,
                successRate24h: successRate,
                firecrawlFallbacks24h: firecrawlUses,
                totalRuns24h: totalRuns
            }
        });
    } catch (error: any) {
        console.error('Error fetching scraper logs:', error);
        return NextResponse.json({ error: 'Internal Server Error', message: error.message, stack: error.stack }, { status: 500 });
    }
}
