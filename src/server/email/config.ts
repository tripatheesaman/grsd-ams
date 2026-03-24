import { decryptSecret, encryptSecret } from "@/server/security/secrets";
import { getAppSettings, setAppSetting } from "@/server/settings/appSettings";

export const EMAIL_SETTING_KEYS = {
  smtpUsername: "smtp_username",
  smtpPasswordEnc: "smtp_password_enc",
  defaultSubject: "email_default_subject_template",
  defaultBody: "email_default_body_template",
} as const;

export const DEFAULT_SUBJECT_TEMPLATE = "Attendance Report - {{section_name}} ({{period}})";
export const DEFAULT_BODY_TEMPLATE =
  "Dear {{section_name}},\n\nPlease find attached the attendance report for {{period}}.\n\nRegards,\nAttendance Management System";

export type EmailConfig = {
  smtpUsername: string;
  smtpPassword: string;
  defaultSubject: string;
  defaultBody: string;
};

export async function readEmailConfigForUi() {
  const values = await getAppSettings(Object.values(EMAIL_SETTING_KEYS));
  return {
    smtpUsername: values[EMAIL_SETTING_KEYS.smtpUsername] ?? "",
    hasPassword: Boolean(values[EMAIL_SETTING_KEYS.smtpPasswordEnc]),
    defaultSubject: values[EMAIL_SETTING_KEYS.defaultSubject] ?? DEFAULT_SUBJECT_TEMPLATE,
    defaultBody: values[EMAIL_SETTING_KEYS.defaultBody] ?? DEFAULT_BODY_TEMPLATE,
  };
}

export async function readEmailConfigForSending(): Promise<EmailConfig> {
  const values = await getAppSettings(Object.values(EMAIL_SETTING_KEYS));
  const smtpUsername = (values[EMAIL_SETTING_KEYS.smtpUsername] ?? "").trim();
  const encrypted = values[EMAIL_SETTING_KEYS.smtpPasswordEnc];
  const defaultSubject = values[EMAIL_SETTING_KEYS.defaultSubject] ?? DEFAULT_SUBJECT_TEMPLATE;
  const defaultBody = values[EMAIL_SETTING_KEYS.defaultBody] ?? DEFAULT_BODY_TEMPLATE;

  if (!smtpUsername) {
    throw new Error("SMTP username is not configured.");
  }
  if (!encrypted) {
    throw new Error("SMTP password is not configured.");
  }

  return {
    smtpUsername,
    smtpPassword: decryptSecret(encrypted),
    defaultSubject,
    defaultBody,
  };
}

export async function saveEmailConfig(input: {
  smtpUsername: string;
  smtpPassword?: string;
  defaultSubject: string;
  defaultBody: string;
}) {
  await setAppSetting(EMAIL_SETTING_KEYS.smtpUsername, input.smtpUsername.trim());
  await setAppSetting(EMAIL_SETTING_KEYS.defaultSubject, input.defaultSubject);
  await setAppSetting(EMAIL_SETTING_KEYS.defaultBody, input.defaultBody);
  if (typeof input.smtpPassword === "string" && input.smtpPassword.length > 0) {
    await setAppSetting(EMAIL_SETTING_KEYS.smtpPasswordEnc, encryptSecret(input.smtpPassword));
  }
}

export function renderTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => values[key] ?? "");
}
