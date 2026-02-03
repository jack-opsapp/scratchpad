/**
 * Send Invite API
 *
 * Vercel serverless function to send invitation emails via SendGrid.
 */

import sgMail from '@sendgrid/mail';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { toEmail, inviterName, pageName } = req.body;

  if (!toEmail || !inviterName || !pageName) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Check if SendGrid is configured
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    console.warn('SendGrid API key not configured, skipping email send');
    return res.status(200).json({ success: true, skipped: true });
  }

  sgMail.setApiKey(apiKey);

  const inviteLink = `https://slate.opsapp.co/?invite=true`;

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
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Send invite error:', error);
    return res.status(500).json({ error: 'Failed to send email' });
  }
}
