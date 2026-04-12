import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

export function buildSmtpTransport(options: { username: string; password: string }) {
  const host = process.env.SMTP_HOST?.trim();
  const portRaw = process.env.SMTP_PORT?.trim();
  const secureRaw = process.env.SMTP_SECURE?.trim().toLowerCase();
  const secure = secureRaw === "1" || secureRaw === "true";

  if (!host) throw new Error("SMTP_HOST is not set.");
  const port = Number.parseInt(portRaw || "587", 10);
  if (!Number.isFinite(port) || port <= 0) throw new Error("SMTP_PORT is invalid.");

  const transportOptions: SMTPTransport.Options = {
    host,
    port,
    secure,
    auth: { user: options.username, pass: options.password },
  };

  return nodemailer.createTransport(transportOptions);
}
