import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { isInternationalLocation } from '@/lib/locationUtils';

export async function POST() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.id;

        const activeUserJobs = await prisma.userJob.findMany({
            where: { userId, status: { not: 'deleted' } },
            include: { job: { select: { id: true, location: true } } },
        });

        const intlJobIds = activeUserJobs
            .filter((uj) => isInternationalLocation(uj.job.location || ''))
            .map((uj) => uj.jobId);

        if (intlJobIds.length > 0) {
            await prisma.userJob.updateMany({
                where: { userId, jobId: { in: intlJobIds } },
                data: { status: 'deleted' },
            });
        }

        await prisma.userPreferences.upsert({
            where: { userId },
            update: { noInternational: true, hasSeenNonUsPrompt: true } as any,
            create: { userId, noInternational: true, hasSeenNonUsPrompt: true } as any,
        });

        return NextResponse.json({ success: true, deletedCount: intlJobIds.length, deletedJobIds: intlJobIds });
    } catch (e: any) {
        console.error('[delete-non-us] Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
