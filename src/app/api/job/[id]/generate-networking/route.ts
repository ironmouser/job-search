import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { regenerateNetworkingMessage } from '@/lib/generator';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const user = await prisma.user.findUnique({ where: { id: session.user.id } });
        if (!user || user.planTier !== 'PRO') {
            return NextResponse.json({ error: 'Pro account required.' }, { status: 403 });
        }

        const { id: jobId } = await context.params;
        const body = await request.json();
        const { instruction, tone } = body;

        const userJob = await prisma.userJob.findUnique({
            where: { userId_jobId: { userId: session.user.id, jobId } },
            include: { job: { include: { applicationAssets: { where: { userId: session.user.id } } } } }
        });

        if (!userJob) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

        let asset = userJob.job.applicationAssets[0];
        if (!asset) return NextResponse.json({ error: 'Assets not generated yet' }, { status: 400 });

        if (asset.networkingMessageRegensUsed >= 3) {
            return NextResponse.json({ error: 'Regeneration limit reached (3/3).' }, { status: 403 });
        }

        const newNetworkingMessage = await regenerateNetworkingMessage(session.user.id, jobId, userJob.job.title, userJob.job.description || '', userJob.job.company, instruction, tone);

        asset = await prisma.applicationAsset.update({
            where: { id: asset.id },
            data: {
                networkingMessage: newNetworkingMessage,
                networkingMessageRegensUsed: asset.networkingMessageRegensUsed + 1
            }
        });

        return NextResponse.json({ success: true, newNetworkingMessage, regensUsed: asset.networkingMessageRegensUsed });
    } catch (e: any) {
        console.error(e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
