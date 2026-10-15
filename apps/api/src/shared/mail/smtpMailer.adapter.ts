import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '@/config/env.js';
import { AppError } from '@/shared/errors/AppError.js';
import type { MailMessage, MailerPort } from './mailer.port.js';

/** Gmail (or any SMTP) through nodemailer, configured lazily on first send, like Cloudinary: a server without it boots fine. */
export class SmtpMailer implements MailerPort {
  private transporter: Transporter | null = null;

  private client(): { transporter: Transporter; from: string } {
    if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD) throw AppError.internal('INTERNAL', { reason: 'MAIL_NOT_CONFIGURED' });
    if (!this.transporter) {
      const port = env.SMTP_PORT ?? 465;
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port,
        secure: port === 465,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
      });
    }
    return { transporter: this.transporter, from: env.MAIL_FROM ?? env.SMTP_USER };
  }

  async send(message: MailMessage): Promise<void> {
    const { transporter, from } = this.client();
    await transporter.sendMail({ from, to: message.to, subject: message.subject, text: message.text });
  }
}
