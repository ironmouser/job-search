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

export async function sendSupportEmail({
  name,
  email,
  subject,
  message,
}: {
  name: string;
  email: string;
  subject: string;
  message: string;
}) {
  try {
    const pass = process.env.EMAIL_SERVER_PASSWORD;
    const from = process.env.EMAIL_FROM || 'Job Agent <onboarding@resend.dev>';
    const to = 'Support@jobagenthq.com';

    const htmlMessage = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <h2 style="color: #4f46e5;">New Support Request</h2>
        <p><strong>From:</strong> ${name} (&lt;${email}&gt;)</p>
        <p><strong>Subject:</strong> ${subject}</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
        <h3>Message:</h3>
        <p style="white-space: pre-wrap; background: #f9fafb; padding: 16px; border-radius: 8px; border: 1px solid #e5e7eb;">${message}</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
        <p style="font-size: 12px; color: #6b7280;">Submitted via Job Agent HQ Support Form at ${new Date().toISOString()}</p>
      </div>
    `;

    if (pass && pass.startsWith('re_')) {
      console.log('Sending support request email via Resend HTTP API...');
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${pass}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to,
          reply_to: email,
          subject: `[Support Request] ${subject}`,
          html: htmlMessage,
        }),
      });

      if (response.ok) {
        console.log(`Support email sent via Resend API to ${to}`);
        return { success: true };
      } else {
        const errText = await response.text();
        console.warn('Resend API HTTP error:', errText);
        throw new Error(`Failed to send email: ${errText}`);
      }
    }

    const host = process.env.EMAIL_SERVER_HOST;
    const port = parseInt(process.env.EMAIL_SERVER_PORT || '587', 10);
    const user = process.env.EMAIL_SERVER_USER;

    if (!host || !user || !pass) {
      console.warn('Support email: Missing SMTP credentials in environment variables. Simulating success in development.');
      console.log('DEV FALLBACK - Support Email Details:', { name, email, subject, message, to });
      return { success: true, devMode: true };
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
      replyTo: email,
      subject: `[Support Request] ${subject}`,
      html: htmlMessage,
    });

    console.log(`Support email sent via SMTP to ${to}`);
    return { success: true };
  } catch (err: any) {
    console.error('Failed to send support email:', err);
    throw new Error(err.message || 'Failed to send support email');
  }
}
