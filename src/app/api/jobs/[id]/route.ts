import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { headers } from 'next/headers';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        
        const userId = session.user.id;
        const { id } = await context.params;
        const { status, applied_at, applicationUrl } = await request.json();

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
