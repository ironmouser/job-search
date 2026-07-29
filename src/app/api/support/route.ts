import { NextResponse } from 'next/server';
import { sendSupportEmail } from '@/lib/mailer';
import { isRateLimited } from '@/lib/rateLimit';
import { logSuspiciousActivity } from '@/lib/security';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function sanitizeHeader(str: string): string {
  return str.replace(/[\r\n]/g, ' ').trim();
}

// Standard web email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  try {
    // 1. IP Extraction & Rate Limiting
    const forwardedFor = request.headers.get('x-forwarded-for');
    const realIp = request.headers.get('x-real-ip');
    const clientIp = (forwardedFor ? forwardedFor.split(',')[0] : realIp) || '127.0.0.1';

    const { limited, retryAfterSeconds } = isRateLimited(clientIp, 10, 15 * 60 * 1000);
    if (limited) {
      await logSuspiciousActivity({
        type: 'SUPPORT_FORM_RATE_LIMITED',
        message: `Support form rate limit hit for IP: ${clientIp}`,
        metadata: { clientIp, retryAfterSeconds },
      });

      return NextResponse.json(
        { error: `Too many support requests. Please wait ${retryAfterSeconds} seconds before trying again.` },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { name, email, subject, message, hp_website } = body;

    // 2. Honeypot check (Bot spam trap)
    if (hp_website && typeof hp_website === 'string' && hp_website.trim() !== '') {
      await logSuspiciousActivity({
        type: 'SUPPORT_FORM_HONEYPOT_TRIGGERED',
        message: `Honeypot triggered on support form by IP: ${clientIp}`,
        metadata: { clientIp, name, email, hp_website },
      });
      return NextResponse.json({ success: true, message: 'Support request received' });
    }

    // 3. Input Validation
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    if (!email || typeof email !== 'string' || !email.trim()) {
      return NextResponse.json({ error: 'Email address is required' }, { status: 400 });
    }

    const cleanEmail = sanitizeHeader(email);
    if (!EMAIL_REGEX.test(cleanEmail)) {
      return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 });
    }

    if (!subject || typeof subject !== 'string' || !subject.trim()) {
      return NextResponse.json({ error: 'Subject is required' }, { status: 400 });
    }

    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // 4. Length Limits
    if (name.trim().length > 100) {
      return NextResponse.json({ error: 'Name must not exceed 100 characters' }, { status: 400 });
    }

    if (cleanEmail.length > 254) {
      return NextResponse.json({ error: 'Email must not exceed 254 characters' }, { status: 400 });
    }

    if (subject.trim().length > 200) {
      return NextResponse.json({ error: 'Subject must not exceed 200 characters' }, { status: 400 });
    }

    if (message.trim().length > 5000) {
      return NextResponse.json({ error: 'Message must not exceed 5000 characters' }, { status: 400 });
    }

    // 5. Header Sanitization & HTML Escaping
    const cleanName = sanitizeHeader(name);
    const cleanSubject = sanitizeHeader(subject);
    const safeHtmlName = escapeHtml(cleanName);
    const safeHtmlEmail = escapeHtml(cleanEmail);
    const safeHtmlSubject = escapeHtml(cleanSubject);
    const safeHtmlMessage = escapeHtml(message.trim());

    await sendSupportEmail({
      name: safeHtmlName,
      email: safeHtmlEmail,
      subject: safeHtmlSubject,
      message: safeHtmlMessage,
    });

    return NextResponse.json({ success: true, message: 'Support request sent successfully' });
  } catch (error: any) {
    console.error('API /api/support Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to submit support request' },
      { status: 500 }
    );
  }
}
