import nodemailer, { type Transporter } from "nodemailer";
import { renderEmailHtml } from "./markdown.js";
import type { IssueData } from "../types.js";

export type EmailOpts = {
  to: string;
  from: string;
  transport?: Pick<Transporter, "sendMail">;
};

export type SmtpOpts = {
  host: string;
  port: number;
  user: string;
  pass: string;
};

export function buildTransport(s: SmtpOpts): Transporter {
  return nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.port === 465,
    auth: { user: s.user, pass: s.pass },
  });
}

export async function pushEmail(issue: IssueData, opts: EmailOpts): Promise<void> {
  if (!opts.transport) {
    throw new Error("pushEmail: no transport provided (call buildTransport from SMTP env vars)");
  }
  await opts.transport.sendMail({
    from: opts.from,
    to: opts.to,
    subject: `Octozine · ${issue.slug} · ${issue.hero.owner}/${issue.hero.repo}`,
    html: renderEmailHtml(issue),
  });
}
