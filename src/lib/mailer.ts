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

export async function sendOrganizationInvitation(
  recipientEmail: string,
  organizationName: string,
  inviteUrl: string,
  expiresAt: Date
) {
  try {
    const pass = process.env.EMAIL_SERVER_PASSWORD;
    const from = process.env.EMAIL_FROM || 'Job Agent <onboarding@resend.dev>';
    const expiryStr = expiresAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const htmlMessage = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <h2 style="color: #4f46e5;">You've been invited to join ${organizationName}</h2>
        <p>You've been invited to access Job Agent HQ as a member of <strong>${organizationName}</strong>.</p>
        <p>This invitation will expire and the pass will be returned to the organization if not used in <strong>7 days</strong> (on ${expiryStr}).</p>
        <div style="margin: 32px 0;">
          <a href="${inviteUrl}" style="background: #4f46e5; color: #fff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
            Accept Invitation
          </a>
        </div>
        <p style="font-size: 13px; color: #6b7280;">If you weren't expecting this invitation, you can safely ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="font-size: 12px; color: #9ca3af;">Job Agent HQ &mdash; AI-Powered Job Search</p>
      </div>
    `;

    if (pass && pass.startsWith('re_')) {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${pass}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: recipientEmail,
          subject: `You've been invited to join ${organizationName} on Job Agent HQ`,
          html: htmlMessage,
        }),
      });

      if (response.ok) {
        console.log(`Organization invitation sent via Resend to ${recipientEmail}`);
        return;
      }
      console.warn('Resend API error for org invite:', await response.text());
    }

    // Fallback to SMTP
    const host = process.env.EMAIL_SERVER_HOST;
    const port = parseInt(process.env.EMAIL_SERVER_PORT || '587', 10);
    const user = process.env.EMAIL_SERVER_USER;

    if (!host || !user || !pass) {
      console.warn(`[DEV] Org invitation email skipped (no SMTP). URL: ${inviteUrl}`);
      return;
    }

    const nodemailer = (await import('nodemailer')).default;
    const transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
    await transporter.sendMail({
      from,
      to: recipientEmail,
      subject: `You've been invited to join ${organizationName} on Job Agent HQ`,
      html: htmlMessage,
    });

    console.log(`Organization invitation sent via SMTP to ${recipientEmail}`);
  } catch (err) {
    console.error('Failed to send organization invitation email:', err);
  }
}

export async function sendEnterpriseInquiryEmail({
  orgName,
  orgId,
  contactName,
  contactEmail,
  phone,
  requestedSeats,
  notes,
}: {
  orgName: string;
  orgId: string;
  contactName: string;
  contactEmail: string;
  phone?: string;
  requestedSeats: number;
  notes?: string;
}) {
  try {
    const pass = process.env.EMAIL_SERVER_PASSWORD;
    const from = process.env.EMAIL_FROM || 'Job Agent <onboarding@resend.dev>';
    const to = 'support@jobagenthq.com';

    const htmlMessage = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
        <h2 style="color: #4f46e5; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">
          🏢 Enterprise Pass Inquiry (5,000+ Seats)
        </h2>
        <p>A new enterprise seat pass purchase inquiry was submitted via Job Agent HQ.</p>

        <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 4px 0;"><strong>Organization Name:</strong> ${orgName}</p>
          <p style="margin: 4px 0;"><strong>Organization ID:</strong> <code>${orgId}</code></p>
          <p style="margin: 4px 0;"><strong>Contact Name:</strong> ${contactName}</p>
          <p style="margin: 4px 0;"><strong>Contact Email:</strong> <a href="mailto:${contactEmail}">${contactEmail}</a></p>
          ${phone ? `<p style="margin: 4px 0;"><strong>Phone:</strong> ${phone}</p>` : ''}
          <p style="margin: 4px 0;"><strong>Requested Passes:</strong> <strong style="color: #4f46e5; font-size: 1.1em;">${requestedSeats.toLocaleString()} seats</strong></p>
        </div>

        ${notes ? `
          <h3>Additional Notes:</h3>
          <p style="white-space: pre-wrap; background: #fff; padding: 12px; border: 1px solid #e5e7eb; border-radius: 6px;">${notes}</p>
        ` : ''}

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="font-size: 12px; color: #6b7280;">Submitted on ${new Date().toLocaleString('en-US')}</p>
      </div>
    `;

    if (pass && pass.startsWith('re_')) {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${pass}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to,
          reply_to: contactEmail,
          subject: `[Enterprise Inquiry] ${orgName} - ${requestedSeats.toLocaleString()} Seats`,
          html: htmlMessage,
        }),
      });

      if (response.ok) {
        console.log(`Enterprise inquiry sent via Resend API to ${to}`);
        return { success: true };
      }
      const errText = await response.text();
      console.warn('Resend API HTTP error:', errText);
    }

    const host = process.env.EMAIL_SERVER_HOST;
    const port = parseInt(process.env.EMAIL_SERVER_PORT || '587', 10);
    const user = process.env.EMAIL_SERVER_USER;

    if (!host || !user || !pass) {
      console.log('DEV FALLBACK - Enterprise Inquiry Details:', { orgName, contactEmail, requestedSeats, notes, to });
      return { success: true, devMode: true };
    }

    const transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
    await transporter.sendMail({
      from,
      to,
      replyTo: contactEmail,
      subject: `[Enterprise Inquiry] ${orgName} - ${requestedSeats.toLocaleString()} Seats`,
      html: htmlMessage,
    });

    return { success: true };
  } catch (err: any) {
    console.error('Failed to send enterprise inquiry email:', err);
    throw new Error(err.message || 'Failed to send enterprise inquiry email');
  }
}

export async function sendInitialJobSearchNotificationEmail({
  to,
  name,
}: {
  to: string;
  name?: string | null;
}) {
  try {
    const pass = process.env.EMAIL_SERVER_PASSWORD;
    const from = process.env.EMAIL_FROM || 'Job Agent HQ <support@contact.jobagenthq.com>';

    // Formatting greeting: If name is missing, null, "No name", or "User" (case-insensitive), use "Hi,"
    let greeting = 'Hi,';
    if (name && typeof name === 'string' && name.trim().length > 0) {
      const trimmed = name.trim();
      const lower = trimmed.toLowerCase();
      if (lower !== 'user' && lower !== 'no name') {
        const firstName = trimmed.split(' ')[0];
        greeting = `Hi ${firstName},`;
      }
    }

    const subject = 'We found your first batch of jobs on Job Agent HQ!';

    const htmlMessage = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; line-height: 1.6; padding: 24px; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0;">
        <div style="margin-bottom: 24px; text-align: center;">
          <h1 style="color: #2563eb; font-size: 24px; font-weight: 700; margin: 0;">Job Agent HQ</h1>
        </div>

        <p style="font-size: 16px; margin-bottom: 16px; color: #0f172a; font-weight: 600;">${greeting}</p>

        <p style="font-size: 15px; margin-bottom: 16px;">
          Thank you for registering for Job Agent HQ.. We noticed you haven’t had a chance to search for jobs yet, so we took the liberty of running an initial search to help get you started.
        </p>

        <p style="font-size: 15px; margin-bottom: 16px;">
          The next time you visit Job Agent HQ your search results will be visible.
        </p>

        <p style="font-size: 15px; margin-bottom: 24px;">
          Whenever you're ready to run a new search, just click the <strong>"Search for Jobs"</strong> button on your main dashboard.
        </p>

        <div style="background: #f8fafc; border-left: 4px solid #2563eb; padding: 16px 20px; border-radius: 8px; margin: 24px 0;">
          <p style="font-size: 15px; font-weight: 700; color: #0f172a; margin: 0 0 8px 0;">
            Want even better matches?
          </p>
          <p style="font-size: 14px; color: #475569; margin: 0;">
            Take 2 minutes to upload your resume and complete your profile. The more details you share, the better our system gets at surfacing roles tailored to your exact experience and goals.
          </p>
        </div>

        <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 15px; color: #334155;">
          <p style="margin: 0;">Best,</p>
          <p style="margin: 4px 0 0 0; font-weight: 600; color: #0f172a;">The Job Agent HQ Team</p>
        </div>
      </div>
    `;

    if (pass && pass.startsWith('re_')) {
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${pass}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from,
            to,
            subject,
            html: htmlMessage,
          }),
        });

        if (response.ok) {
          console.log(`Initial job search notification email sent via Resend API to ${to}`);
          return { success: true };
        }
        const errText = await response.text();
        console.warn('Resend API HTTP error, falling back to SMTP transport:', errText);
      } catch (resendErr: any) {
        console.warn('Resend API fetch failed, falling back to SMTP transport:', resendErr?.message || resendErr);
      }
    }

    const host = process.env.EMAIL_SERVER_HOST;
    const port = parseInt(process.env.EMAIL_SERVER_PORT || '587', 10);
    const user = process.env.EMAIL_SERVER_USER;

    if (!host || !user || !pass) {
      console.log('DEV FALLBACK - Initial Job Search Email Details:', { to, greeting, subject });
      return { success: true, devMode: true };
    }

    const transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
    await transporter.sendMail({
      from,
      to,
      subject,
      html: htmlMessage,
    });

    console.log(`Initial job search notification email sent via SMTP to ${to}`);
    return { success: true };
  } catch (err: any) {
    console.error('Failed to send initial job search notification email:', err);
    throw new Error(err.message || 'Failed to send initial job search notification email');
  }
}


