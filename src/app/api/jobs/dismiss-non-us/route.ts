import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

export async function POST() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.id;

        await prisma.userPreferences.upsert({
            where: { userId },
            update: { hasSeenNonUsPrompt: true } as any,
            create: { userId, hasSeenNonUsPrompt: true } as any,
        });

        return NextResponse.json({ success: true });
    } catch (e: any) {
        console.error('[dismiss-non-us] Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
