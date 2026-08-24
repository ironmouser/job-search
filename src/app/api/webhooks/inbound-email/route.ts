import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseVerificationEmail } from '@/lib/email/verification-parser';

/**
 * POST /api/webhooks/inbound-email
 *
 * Inbound webhook for receiving forwarded or direct verification emails
 * from ATS portals (Workday, Taleo, SuccessFactors, etc.).
 *
 * Supports standard JSON payloads, SendGrid Inbound Parse, Postmark, Resend,
 * and Cloudflare Email Worker webhook payloads.
 */
export async function POST(request: NextRequest) {
  try {
    let toAddress = '';
    let fromAddress = '';
    let subject = '';
    let textBody = '';
    let htmlBody = '';

    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const body = await request.json();
      toAddress = body.to || body.recipient || body.To || '';
      fromAddress = body.from || body.sender || body.From || '';
      subject = body.subject || body.Subject || '';
      textBody = body.text || body.textBody || body.body || body.TextBody || '';
      htmlBody = body.html || body.htmlBody || body.HtmlBody || '';
    } else if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData();
      toAddress = (formData.get('to') || formData.get('recipient') || '') as string;
      fromAddress = (formData.get('from') || formData.get('sender') || '') as string;
      subject = (formData.get('subject') || '') as string;
      textBody = (formData.get('text') || formData.get('body-plain') || '') as string;
      htmlBody = (formData.get('html') || formData.get('body-html') || '') as string;
    } else {
      const rawText = await request.text();
      textBody = rawText;
    }

    const parsed = parseVerificationEmail({
      subject,
      text: textBody,
      html: htmlBody,
    });

    if (!parsed.primaryUrl && !parsed.otp) {
      return NextResponse.json(
        { message: 'Email received but no verification link or OTP detected', parsed },
        { status: 200 }
      );
    }

    // Attempt to correlate to an active session
    let matchedSessionId: string | null = null;

    // 1. Check if recipient contains sessionId e.g. apply+<uuid>@domain or <uuid>@domain
    const uuidMatch = toAddress.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if (uuidMatch) {
      matchedSessionId = uuidMatch[0];
    }

    // 2. If no sessionId in address, find the latest active session for the user
    let session = matchedSessionId
      ? await prisma.autoApplySession.findUnique({
          where: { id: matchedSessionId },
          include: { user: true },
        })
      : null;

    if (!session) {
      // Look for any active session created in the last 15 minutes
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
      session = await prisma.autoApplySession.findFirst({
        where: {
          createdAt: { gte: fifteenMinutesAgo },
          status: { in: ['processing', 'needs_intervention', 'preparing', 'applying'] },
        },
        orderBy: { createdAt: 'desc' },
        include: { user: true },
      });
    }

    if (!session) {
      return NextResponse.json({
        message: 'Parsed verification email but no active session found to attach',
        parsed,
      });
    }

    const existingMetadata = (session.browserMetadata as Record<string, any>) || {};
    const updatedMetadata = {
      ...existingMetadata,
      emailVerification: {
        receivedAt: new Date().toISOString(),
        from: fromAddress,
        subject,
        primaryUrl: parsed.primaryUrl,
        urls: parsed.urls,
        otp: parsed.otp,
        token: parsed.token,
        atsPlatformGuess: parsed.atsPlatformGuess,
      },
    };

    await prisma.autoApplySession.update({
      where: { id: session.id },
      data: {
        browserMetadata: updatedMetadata,
      },
    });

    // Record execution log
    await prisma.executionLog.create({
      data: {
        sessionId: session.id,
        level: 'info',
        step: 'email_verification_received',
        message: `Inbound verification email parsed: ${parsed.primaryUrl ? 'Link detected' : ''} ${parsed.otp ? `OTP: ${parsed.otp}` : ''}`,
        metadata: {
          hasLink: !!parsed.primaryUrl,
          hasOtp: !!parsed.otp,
          platformGuess: parsed.atsPlatformGuess,
        },
      },
    });

    return NextResponse.json({
      success: true,
      sessionId: session.id,
      verificationData: {
        primaryUrl: parsed.primaryUrl,
        otp: parsed.otp,
      },
    });
  } catch (error: any) {
    console.error('Error processing inbound verification email webhook:', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
