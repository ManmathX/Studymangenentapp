import { createTransport } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/** Sends email. Only used for password reset codes. */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** Sends through any SMTP server (Gmail, Zoho, Brevo, Amazon SES…) given as a connection URL. */
export class SmtpMailer implements Mailer {
  private readonly transport;

  constructor(url: string, from: string) {
    this.transport = createTransport(url, { from });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail(message);
  }
}
