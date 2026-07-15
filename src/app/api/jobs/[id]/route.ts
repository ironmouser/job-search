import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        
        const userId = session.user.id;
        const { id } = await context.params;
        const { status, applied_at } = await request.json();

        if (!status) {
            return NextResponse.json({ error: 'Status is required' }, { status: 400 });
        }

        const updateData: any = { status };
        if (applied_at) {
            updateData.appliedAt = new Date(applied_at);
        }

        const data = await prisma.userJob.update({
            where: { userId_jobId: { userId, jobId: id } },
            data: updateData
        });

        return NextResponse.json(data);
    } catch (e: any) {
        console.error('Failed to update job status:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
