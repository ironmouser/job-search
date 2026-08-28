import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { cleanMismatchedJobs } from "@/lib/recovery";

export async function POST() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user || (session.user as any).role !== 'SYSTEM_ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const result = await cleanMismatchedJobs();
        return NextResponse.json({
            success: true,
            message: `Cleaned ${result.cleanedJobCount} mismatched job record(s).`,
            data: result
        });
    } catch (e: any) {
        console.error("Failed to clean mismatched jobs:", e);
        return NextResponse.json({ error: e.message || 'Internal Server Error' }, { status: 500 });
    }
}
