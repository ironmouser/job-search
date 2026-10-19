import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyUnsubscribeToken } from '@/lib/jobMatch/unsubscribe';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  if (!token) {
    return NextResponse.json({ error: 'Missing unsubscribe token' }, { status: 400 });
  }

  const userId = verifyUnsubscribeToken(token);
  if (!userId) {
    return NextResponse.json({ error: 'Invalid or expired unsubscribe token' }, { status: 403 });
  }

  try {
    await prisma.userPreferences.updateMany({
      where: { userId },
      data: { jobMatchEmailsEnabled: false },
    });

    const baseUrl = (process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://www.jobagenthq.com').replace(/\/+$/, '');
    return NextResponse.redirect(`${baseUrl}/unsubscribe?success=true`);
  } catch (err: any) {
    console.error('[Unsubscribe GET Error]:', err);
    return NextResponse.json({ error: 'Failed to process unsubscribe request' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let token = request.nextUrl.searchParams.get('token');

  if (!token) {
    try {
      const body = await request.json().catch(() => ({}));
      token = body.token;
    } catch {
      // Body parse fallback
    }
  }

  if (!token) {
    return NextResponse.json({ error: 'Missing unsubscribe token' }, { status: 400 });
  }

  const userId = verifyUnsubscribeToken(token);
  if (!userId) {
    return NextResponse.json({ error: 'Invalid or expired unsubscribe token' }, { status: 403 });
  }

  try {
    await prisma.userPreferences.updateMany({
      where: { userId },
      data: { jobMatchEmailsEnabled: false },
    });

    return NextResponse.json({ success: true, message: 'You have been successfully unsubscribed from Job Match emails.' });
  } catch (err: any) {
    console.error('[Unsubscribe POST Error]:', err);
    return NextResponse.json({ error: 'Failed to process unsubscribe request' }, { status: 500 });
  }
}
