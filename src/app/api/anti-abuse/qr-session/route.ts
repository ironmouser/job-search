import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min validity

    await prisma.qRSessionToken.create({
      data: {
        token,
        userId: session.user.id,
        expiresAt,
      },
    });

    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const verifyUrl = `${baseUrl}/verify-mobile?token=${token}`;

    return NextResponse.json({
      token,
      verifyUrl,
      expiresAt,
    });
  } catch (error: any) {
    console.error('Error generating QR session token:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
