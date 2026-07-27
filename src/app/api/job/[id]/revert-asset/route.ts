import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id: jobId } = await params;
        const body = await request.json();
        const { assetType } = body;

        if (!['resume', 'coverLetter', 'networking'].includes(assetType)) {
            return NextResponse.json({ error: 'Invalid assetType' }, { status: 400 });
        }

        const asset = await prisma.applicationAsset.findUnique({
            where: {
                userId_jobId: {
                    userId: session.user.id,
                    jobId,
                }
            }
        });

        if (!asset) {
            return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
        }

        let currentContent: string | null = null;
        let previousContent: string | null = null;
        let updateData: any = {};

        if (assetType === 'resume') {
            currentContent = asset.tailoredResumeMarkdown;
            previousContent = asset.previousTailoredResumeMarkdown;
            if (!previousContent) {
                return NextResponse.json({ error: 'No previous version available' }, { status: 400 });
            }
            updateData = {
                tailoredResumeMarkdown: previousContent,
                previousTailoredResumeMarkdown: currentContent,
            };
        } else if (assetType === 'coverLetter') {
            currentContent = asset.coverLetterMarkdown;
            previousContent = asset.previousCoverLetterMarkdown;
            if (!previousContent) {
                return NextResponse.json({ error: 'No previous version available' }, { status: 400 });
            }
            updateData = {
                coverLetterMarkdown: previousContent,
                previousCoverLetterMarkdown: currentContent,
            };
        } else if (assetType === 'networking') {
            currentContent = asset.networkingMessage;
            previousContent = asset.previousNetworkingMessage;
            if (!previousContent) {
                return NextResponse.json({ error: 'No previous version available' }, { status: 400 });
            }
            updateData = {
                networkingMessage: previousContent,
                previousNetworkingMessage: currentContent,
            };
        }

        const updatedAsset = await prisma.applicationAsset.update({
            where: { id: asset.id },
            data: updateData,
        });

        return NextResponse.json({
            success: true,
            currentContent: previousContent,
            previousContent: currentContent,
            asset: updatedAsset,
        });
    } catch (error: any) {
        console.error('Error reverting asset:', error);
        return NextResponse.json(
            { error: 'Failed to revert asset' },
            { status: 500 }
        );
    }
}
