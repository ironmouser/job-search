import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { sendInitialJobSearchNotificationEmail } from "@/lib/mailer";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const authHeader = request.headers.get('authorization');
    const isValidSecret = process.env.WORKER_API_KEY && authHeader === `Bearer ${process.env.WORKER_API_KEY}`;
    const isAdmin = session?.user && (session.user as any).role === 'SYSTEM_ADMIN';

    if (!isAdmin && !isValidSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const targetEmails = [
      "teresachic@gmail.com",
      "ronamoe@gmail.com",
      "bigswoll38@gmail.com",
      "mikesims234@gmail.com",
      "sumit.khair@gmail.com",
      "mballa333@gmail.com",
      "totallyu428@gmail.com",
      "kurtcapple@gmail.com",
      "adl3ddesign@gmail.com",
      "dave.bohannan@gmail.com"
    ];

    const targetUsers = await prisma.user.findMany({
      where: { email: { in: targetEmails } },
      select: { id: true, email: true, name: true }
    });

    const results: any[] = [];

    for (const user of targetUsers) {
      try {
        const res = await sendInitialJobSearchNotificationEmail({
          to: user.email,
          name: user.name
        });
        results.push({ email: user.email, status: 'sent', result: res });
      } catch (err: any) {
        results.push({ email: user.email, status: 'error', error: err.message || err });
      }
    }

    return NextResponse.json({
      success: true,
      totalCount: targetUsers.length,
      results
    });
  } catch (e: any) {
    console.error('Error sending initial search notification emails:', e);
    return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 });
  }
}
