import { NextResponse } from 'next/server';
import { fetchEmailsAndExtractJobs } from '@/lib/email';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const globalSettings = await prisma.globalSettings.findUnique({ where: { id: 'system' } });
    const emailsSyncIsPro = globalSettings?.emailsSyncIsPro ?? true;

    if (emailsSyncIsPro && (session.user as any).planTier !== 'PRO') {
      return NextResponse.json({ error: 'Email synchronization is a Pro feature. Please upgrade to Pro.' }, { status: 403 });
    }
    const newJobsCount = await fetchEmailsAndExtractJobs(session.user.id);
    return NextResponse.json({ success: true, count: newJobsCount });
  } catch (error: any) {
    console.error('Error syncing emails:', error);

    let clientMessage = error.message || 'Failed to sync emails';
    if (clientMessage.includes('AUTHENTICATIONFAILED') || clientMessage.includes('Invalid credentials')) {
      clientMessage = 'IMAP authentication failed. Please check your email address and App Password in Settings.';
    }

    const isUserError = clientMessage.includes('credentials') || 
                        clientMessage.includes('authentication') || 
                        clientMessage.includes('configured') || 
                        clientMessage.includes('IMAP') ||
                        clientMessage.includes('Settings');

    return NextResponse.json(
      { success: false, error: clientMessage },
      { status: isUserError ? 400 : 500 }
    );
  }
}
