/**
 * Email Service
 *
 * Handles sending invitation emails via SendGrid.
 * Note: This module is used by the serverless function, not client-side.
 */

import sgMail from '@sendgrid/mail';

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

export async function sendInviteEmail(
  toEmail,
  inviterName,
  pageName,
  inviteLink
) {
  const msg = {
    to: toEmail,
    from: 'noreply@opsapp.co', // Verified domain in SendGrid
    subject: `${inviterName} invited you to collaborate on "${pageName}"`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Inter', sans-serif; background: #000; color: #fff; padding: 40px; }
          .container { max-width: 500px; margin: 0 auto; background: #0a0a0a; border: 1px solid #1a1a1a; padding: 32px; }
          h1 { color: #d1b18f; font-size: 24px; margin-bottom: 24px; }
          p { color: #888; font-size: 14px; line-height: 1.6; margin-bottom: 16px; }
          .button { display: inline-block; padding: 12px 24px; background: #d1b18f; color: #000; text-decoration: none; font-weight: 600; margin: 24px 0; }
          .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #1a1a1a; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>SLATE</h1>
          <p>Hi,</p>
          <p><strong>${inviterName}</strong> has invited you to collaborate on <strong>${pageName}</strong> in Slate.</p>
          <a href="${inviteLink}" class="button">Accept Invitation</a>
          <p>This invitation expires in 7 days.</p>
          <div class="footer">
            <p>If you didn't expect this invitation, you can safely ignore this email.</p>
            <p>Powered by Slate - https://slate.opsapp.co</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    await sgMail.send(msg);
    return { success: true };
  } catch (error) {
    console.error('SendGrid error:', error);
    throw error;
  }
}
