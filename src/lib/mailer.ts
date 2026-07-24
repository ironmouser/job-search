import nodemailer from 'nodemailer';

export async function sendSystemAlertEmail(subject: string, htmlMessage: string) {
  try {
    const pass = process.env.EMAIL_SERVER_PASSWORD;
    const from = process.env.EMAIL_FROM || 'Job Agent <onboarding@resend.dev>';
    const to = 'kurt.charles@gmail.com';

    // 1. If using Resend API Key (starts with re_), use Resend HTTP API for maximum reliability
    if (pass && pass.startsWith('re_')) {
      console.log('Sending system alert email via Resend HTTP API...');
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${pass}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to,
          subject: `[System Alert] ${subject}`,
          html: htmlMessage,
        }),
      });

      if (response.ok) {
        console.log(`System alert email sent via Resend API to ${to}: ${subject}`);
        return;
      } else {
        const errText = await response.text();
        console.warn('Resend API HTTP error:', errText);
      }
    }

    // 2. Fallback to standard SMTP via Nodemailer
    const host = process.env.EMAIL_SERVER_HOST;
    const port = parseInt(process.env.EMAIL_SERVER_PORT || '587', 10);
    const user = process.env.EMAIL_SERVER_USER;

    if (!host || !user || !pass) {
      console.warn('System alert email skipped: Missing SMTP credentials in environment variables.');
      return;
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
    });

    await transporter.sendMail({
      from,
      to,
      subject: `[System Alert] ${subject}`,
      html: htmlMessage,
    });

    console.log(`System alert email sent via SMTP to ${to}: ${subject}`);
  } catch (err) {
    console.error('Failed to send system alert email:', err);
  }
}
