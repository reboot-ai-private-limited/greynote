export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/** Sends one email. Throws when the mail server is not configured or refuses the message; callers decide what a failure means. */
export interface MailerPort {
  send(message: MailMessage): Promise<void>;
}
