import { NextResponse } from 'next/server';
import { ImapFlow } from 'imapflow';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await request.json();
    const { emailAddress, emailAppPassword, imapHost, imapPort } = data;

    if (!emailAddress || !emailAppPassword || !imapHost || !imapPort) {
      return NextResponse.json({ success: false, error: 'All connection fields are required.' }, { status: 400 });
    }

    let passwordToUse = emailAppPassword;

    // If the password is masked, fetch the real one from the database and decrypt it
    if (passwordToUse === '********') {
      const prefs = await prisma.userPreferences.findUnique({
        where: { userId: session.user.id }
      });
      if (!prefs?.emailAppPassword) {
        return NextResponse.json({ success: false, error: 'No saved password found to test with.' }, { status: 400 });
      }
      passwordToUse = decrypt(prefs.emailAppPassword);
    }

    const client = new ImapFlow({
      host: imapHost,
      port: Number(imapPort),
      secure: Number(imapPort) === 993,
      auth: {
        user: emailAddress,
        pass: passwordToUse,
      },
      logger: false,
    });

    try {
      await client.connect();
      // Connection successful
      await client.logout();
      return NextResponse.json({ success: true });
    } catch (err: any) {
      console.error('IMAP Test Failed:', err);
      return NextResponse.json({ success: false, error: err.message || 'Failed to connect to IMAP server.' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('Test Connection API Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
