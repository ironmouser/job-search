import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    return handleReset();
}

export async function POST() {
    return handleReset();
}

async function handleReset() {
    if (process.env.NODE_ENV !== 'development') {
        return NextResponse.json({ error: 'Endpoint only available in development mode' }, { status: 403 });
    }

    try {
        const email = 'test@example.com';
        const existingUser = await prisma.user.findUnique({
            where: { email }
        });

        if (existingUser) {
            // Delete all explicitly associated data (and let cascade delete any related records)
            await prisma.$transaction([
                prisma.userPreferences.deleteMany({ where: { userId: existingUser.id } }),
                prisma.userJob.deleteMany({ where: { userId: existingUser.id } }),
                prisma.opportunityScore.deleteMany({ where: { userId: existingUser.id } }),
                prisma.applicationAsset.deleteMany({ where: { userId: existingUser.id } }),
                prisma.jobFeedback.deleteMany({ where: { userId: existingUser.id } }),
                prisma.appFeedback.deleteMany({ where: { userId: existingUser.id } }),
                prisma.autoApplySession.deleteMany({ where: { userId: existingUser.id } }),
                prisma.interventionRequest.deleteMany({ where: { userId: existingUser.id } }),
                prisma.deviceVerification.deleteMany({ where: { userId: existingUser.id } }),
                prisma.accountCollisionLog.deleteMany({ where: { targetUserId: existingUser.id } }),
                prisma.account.deleteMany({ where: { userId: existingUser.id } }),
                prisma.session.deleteMany({ where: { userId: existingUser.id } }),
                prisma.user.delete({ where: { id: existingUser.id } }),
            ]);
        }

        // Create a completely clean test user record with isOnboarded = false
        const newUser = await prisma.user.create({
            data: {
                email,
                name: 'Test User',
                isOnboarded: false,
                planTier: 'FREE',
            }
        });

        return NextResponse.json({
            success: true,
            message: `Test account (${email}) and all associated database records have been completely deleted and re-created with isOnboarded = false.`,
            user: { id: newUser.id, email: newUser.email, isOnboarded: false }
        });
    } catch (e: any) {
        console.error('Error resetting test user:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
