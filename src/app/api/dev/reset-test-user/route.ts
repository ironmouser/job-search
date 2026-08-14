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
        const user = await prisma.user.findUnique({
            where: { email }
        });

        if (user) {
            // 1. Delete associated user preferences for a clean onboarding slate
            await prisma.userPreferences.deleteMany({
                where: { userId: user.id }
            });

            // 2. Set isOnboarded to false
            await prisma.user.update({
                where: { id: user.id },
                data: {
                    isOnboarded: false,
                    planTier: 'FREE',
                    trialEndsAt: null,
                }
            });

            return NextResponse.json({
                success: true,
                message: `Test account (${email}) has been reset. isOnboarded set to false and preferences cleared.`,
                user: { id: user.id, email: user.email, isOnboarded: false }
            });
        } else {
            // Create the test user fresh with isOnboarded = false
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
                message: `Test account (${email}) created with isOnboarded = false.`,
                user: { id: newUser.id, email: newUser.email, isOnboarded: false }
            });
        }
    } catch (e: any) {
        console.error('Error resetting test user:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
