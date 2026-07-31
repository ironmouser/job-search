import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if ((session?.user as any)?.role !== 'SYSTEM_ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const alerts = await prisma.systemAlert.findMany({
            where: { isResolved: false },
            orderBy: { createdAt: 'desc' }
        });

        // Also get total cost for today to show on dashboard
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const costResult = await prisma.aICostLog.aggregate({
            _sum: { costUsd: true },
            where: { createdAt: { gte: startOfDay } }
        });

        return NextResponse.json({ 
            alerts, 
            dailyCost: costResult._sum.costUsd || 0 
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if ((session?.user as any)?.role !== 'SYSTEM_ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { alertId } = await request.json();
        
        await prisma.systemAlert.update({
            where: { id: alertId },
            data: { isResolved: true }
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
