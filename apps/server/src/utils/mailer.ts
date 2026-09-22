import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import env from './env.js';

const transporter: Transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: Number(env.SMTP_PORT),
  secure: Number(env.SMTP_PORT) === 465,
  auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
});

interface OtpEmailParams {
  to: string;
  otp: string;
  verifyUrl?: string;
}

export function formatOtpEmail({ otp, verifyUrl }: Omit<OtpEmailParams, 'to'>): string {
  const escapeHtml = (value: string): string =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const safeUrl = verifyUrl ? escapeHtml(verifyUrl) : '';

  return `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #0f766e;">Crop AI - Your login code</h2>
      <p>Hi there,</p>
      <p>Use the following One-Time Password to log in / verify your email:</p>
      <p>This code expires in 10 minutes.</p>
      <div style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #0f766e; background: #ecfdf5; padding: 16px; text-align: center; border-radius: 8px;">
        ${otp}
      </div>
      ${
        safeUrl
          ? `<p style="text-align: center;">Or click this link to verify instantly:</p>
             <div style="text-align: center; margin: 16px 0;">
               <a href="${safeUrl}" style="display: inline-block; background: #0f766e; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Verify Email</a>
             </div>
             <p style="text-align: center; word-break: break-all; overflow-wrap: anywhere; font-size: 12px; color: #777; margin: 0;">
               <a href="${safeUrl}" style="color: #0f766e;">${safeUrl}</a>
             </p>`
          : ''
      }
      <p style="color: #777; font-size: 12px;">If you did not request this code, you can safely ignore this email.</p>
    </div>
  `;
}

export async function sendOtpEmail({ to, otp, verifyUrl }: OtpEmailParams): Promise<unknown> {
  try {
    const info = await transporter.sendMail({
      from: env.MAIL_FROM,
      to,
      subject: 'Crop AI - Your login code',
      text: `Your Crop AI login code is: ${otp}. It expires in 10 minutes.`,
      html: formatOtpEmail({ otp, verifyUrl }),
    });

    console.log('📧 OTP email sent, Message-ID:', info.messageId);
    console.log('📬 View it in Mailpit: http://localhost:8025');
    return info;
  } catch (error) {
    console.error('❌ Failed to send OTP email:', (error as Error).message);
    throw error;
  }
}
