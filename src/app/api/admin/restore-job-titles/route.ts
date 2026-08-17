import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { restoreMissingJobTitles } from "@/lib/recovery";

export async function POST() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user || (session.user as any).role !== 'SYSTEM_ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const result = await restoreMissingJobTitles();
        const msg = result.cleanedCount > 0
            ? `Restored ${result.restoredCount} user job titles and cleaned ${result.cleanedCount} invalid entries.`
            : `Successfully restored job titles for ${result.restoredCount} user(s).`;
        return NextResponse.json({
            success: true,
            message: msg,
            data: result
        });
    } catch (e: any) {
        console.error("Failed to restore job titles:", e);
        return NextResponse.json({ error: e.message || 'Internal Server Error' }, { status: 500 });
    }
}
