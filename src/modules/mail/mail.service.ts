import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

// Email body content to render into text/html.
type EmailContent = {
  title: string;
  intro: string;
  note: string;
  buttonLabel: string;
  link: string;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  // Created lazily on the first send and only when SMTP_HOST is set.
  private transporter?: Transporter;

  constructor(private readonly config: ConfigService) {}

  async sendEmailConfirmation(to: string, token: string) {
    const link = this.buildLink('/confirm-email', token);
    const intro = "You're linking this email address to your LimeBalance account.";
    const note = 'This link expires in 24 hours.';
    await this.send(to, 'Confirm your email', {
      title: 'Confirm your email address',
      intro,
      note,
      buttonLabel: 'Confirm email',
      link,
    });
  }

  async sendPasswordReset(to: string, token: string) {
    const link = this.buildLink('/reset-password', token);
    const intro = 'We received a request to reset the password for your LimeBalance account.';
    const note = 'This link expires in 15 minutes.';
    await this.send(to, 'Reset your password', {
      title: 'Reset your password',
      intro,
      note,
      buttonLabel: 'Reset password',
      link,
    });
  }

  // Builds a frontend link like {FRONTEND_URL}/path?token=...
  private buildLink(path: string, token: string): string {
    const base = this.config.get<string>('FRONTEND_URL') ?? '';
    return `${base.replace(/\/$/, '')}${path}?token=${token}`;
  }

  private async send(to: string, subject: string, content: EmailContent) {
    const text = this.renderText(content);
    const transporter = this.getTransporter();
    // SMTP not configured — in dev just log the content so the link can still be used.
    if (!transporter) {
      this.logger.warn(`SMTP not configured, email not sent. To: ${to}\n${text}`);
      return;
    }

    const from = this.config.get<string>('MAIL_FROM') ?? this.config.get<string>('SMTP_USER');
    try {
      await transporter.sendMail({ from, to, subject, text, html: this.renderHtml(content) });
    } catch (err) {
      // A send failure must not bring down the main request — log and continue.
      this.logger.error(`Failed to send email to ${to}`, err as Error);
    }
  }

  // Plain-text version (fallback for clients without HTML).
  private renderText({ title, intro, note, link }: EmailContent): string {
    return (
      `${title}\n\n${intro}\n${note}\n\n${link}\n\n` +
      "If you didn't request this, you can safely ignore this email.\n\n— LimeBalance"
    );
  }

  // HTML version with a button. Styles are inline — that's what email clients understand.
  private renderHtml({ title, intro, note, buttonLabel, link }: EmailContent): string {
    return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;padding:40px;">
            <tr><td style="font-size:20px;font-weight:700;color:#65a30d;padding-bottom:24px;">LimeBalance</td></tr>
            <tr><td style="font-size:18px;font-weight:600;padding-bottom:12px;">${title}</td></tr>
            <tr><td style="font-size:14px;line-height:22px;color:#444;padding-bottom:4px;">${intro}</td></tr>
            <tr><td style="font-size:13px;line-height:20px;color:#777;padding-bottom:28px;">${note}</td></tr>
            <tr><td style="padding-bottom:28px;">
              <a href="${link}" style="display:inline-block;background:#65a30d;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:8px;">${buttonLabel}</a>
            </td></tr>
            <tr><td style="font-size:12px;line-height:18px;color:#999;">If the button doesn't work, copy and paste this link into your browser:<br><a href="${link}" style="color:#65a30d;word-break:break-all;">${link}</a></td></tr>
            <tr><td style="font-size:12px;line-height:18px;color:#999;padding-top:24px;border-top:1px solid #eee;margin-top:24px;">If you didn't request this, you can safely ignore this email.</td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  }

  private getTransporter(): Transporter | undefined {
    if (this.transporter) return this.transporter;

    const host = this.config.get<string>('SMTP_HOST');
    if (!host) return undefined;

    this.transporter = createTransport({
      host,
      port: this.config.get<number>('SMTP_PORT') ?? 587,
      secure: this.config.get<boolean>('SMTP_SECURE') ?? false,
      auth: {
        user: this.config.get<string>('SMTP_USER'),
        pass: this.config.get<string>('SMTP_PASS'),
      },
    });
    return this.transporter;
  }
}
