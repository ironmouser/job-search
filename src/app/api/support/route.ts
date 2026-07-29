import { NextResponse } from 'next/server';
import { sendSupportEmail } from '@/lib/mailer';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, subject, message } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    if (!email || typeof email !== 'string' || !email.trim() || !email.includes('@')) {
      return NextResponse.json({ error: 'A valid email address is required' }, { status: 400 });
    }

    if (!subject || typeof subject !== 'string' || !subject.trim()) {
      return NextResponse.json({ error: 'Subject is required' }, { status: 400 });
    }

    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    await sendSupportEmail({
      name: name.trim(),
      email: email.trim(),
      subject: subject.trim(),
      message: message.trim(),
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
