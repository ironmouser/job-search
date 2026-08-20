import { NextResponse } from 'next/server';
import { fetchEmailsAndExtractJobs } from '@/lib/email';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

import { getEffectiveTier } from '@/lib/tier';

export const maxDuration = 120;

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const globalSettings = await prisma.globalSettings.findUnique({ where: { id: 'system' } });
    const emailsSyncIsPro = globalSettings?.emailsSyncIsPro ?? true;

    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { planTier: true, trialEndsAt: true, subscriptionType: true, orgAccessExpiresAt: true }
    });
    const isPro = dbUser ? getEffectiveTier(dbUser) === 'PRO' : getEffectiveTier(session.user as any) === 'PRO';

    if (emailsSyncIsPro && !isPro) {
      return NextResponse.json({ error: 'Email synchronization is a Pro feature. Please upgrade to Pro.' }, { status: 403 });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (data: any) => {
          try {
            controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
          } catch (e) {}
        };

        try {
          sendEvent({ type: 'progress', foundCount: 0, message: 'Scanning email inbox for job postings...' });

          const newJobsCount = await fetchEmailsAndExtractJobs(session.user.id, (foundCount, message) => {
            sendEvent({ type: 'progress', foundCount, message });
          });

          sendEvent({
            type: 'complete',
            success: true,
            count: newJobsCount,
            foundCount: newJobsCount,
            message: `Email sync complete! Found ${newJobsCount} new job opportunities.`
          });
        } catch (error: any) {
          console.error('Error syncing emails:', error);
          let clientMessage = error.message || 'Failed to sync emails';
          if (clientMessage.includes('AUTHENTICATIONFAILED') || clientMessage.includes('Invalid credentials')) {
            clientMessage = 'IMAP authentication failed. Please check your email address and App Password in Settings.';
          }
          sendEvent({ type: 'error', error: clientMessage, success: false });
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive'
      }
    });
  } catch (error: any) {
    console.error('Error syncing emails:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to sync emails' }, { status: 500 });
  }
}
