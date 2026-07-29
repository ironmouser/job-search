import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { headers } from 'next/headers';
import { reformatJobDescriptionWithGemini } from '@/lib/formatter';
import { scoreJob } from '@/lib/scoring';
import { logSuspiciousActivity } from '@/lib/security';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        
        const userId = session.user.id;
        const { id } = await context.params;
        const { status, applied_at, applicationUrl, description } = await request.json();

        if (description || applicationUrl) {
            const job = await prisma.job.findUnique({
                where: { id },
                select: { addedById: true }
            });
            if (!job) {
                return NextResponse.json({ error: 'Job not found' }, { status: 404 });
            }
            
            const isAdmin = (session.user as any).role === 'ADMIN';
            if (!isAdmin && job.addedById !== userId) {
                await logSuspiciousActivity({ type: 'UNAUTHORIZED_MODIFICATION_ATTEMPT', message: 'Attempted to modify a global job not owned by user', userId, metadata: { jobId: id, requestedChanges: { description: !!description, applicationUrl: !!applicationUrl } } });
                return NextResponse.json(
                    { error: 'Unauthorized to modify shared job properties. Only the original creator can edit this job.' },
                    { status: 403 }
                );
            }
        }

        if (description) {
            let formattedDesc = description;
            if (formattedDesc.length > 50 && !formattedDesc.includes('## ')) {
                try {
                    formattedDesc = await reformatJobDescriptionWithGemini(description);
                } catch (e) {}
            }

            const updatedJob = await prisma.job.update({
                where: { id },
                data: { description: formattedDesc }
            });

            await prisma.userJob.update({
                where: { userId_jobId: { userId, jobId: id } },
                data: { status: 'discovered' }
            });

            try {
                await scoreJob(userId, id, updatedJob.title, formattedDesc);
            } catch (scoreErr: any) {
                console.warn(`Failed to auto-score job ${id} after description update:`, scoreErr.message);
            }
        }

        if (applicationUrl) {
            await prisma.job.update({
                where: { id },
                data: { applicationUrl }
            });
        }

        if (status) {
            const updateData: any = { status };
            if (applied_at) {
                const headerStore = await headers();
                const forwardedFor = headerStore.get('x-forwarded-for');
                const ipAddress = forwardedFor ? forwardedFor.split(',')[0] : 'unknown';
                
                updateData.appliedAt = new Date(applied_at);
                updateData.ipAddress = ipAddress;
            }

            const data = await prisma.userJob.update({
                where: { userId_jobId: { userId, jobId: id } },
                data: updateData
            });

            return NextResponse.json(data);
        }

        return NextResponse.json({ success: true });
    } catch (e: any) {
        console.error('Failed to update job status:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        
        const userId = session.user.id;
        const { id } = await context.params;

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
