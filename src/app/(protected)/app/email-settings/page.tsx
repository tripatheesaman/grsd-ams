import { notFound } from "next/navigation";
import { requireSessionUser } from "@/server/auth/session";
import { readEmailConfigForUi } from "@/server/email/config";
import { readAttendanceRuleConfigForUi } from "@/server/settings/attendanceRules";
import EmailSettingsForm from "@/features/email/components/EmailSettingsForm";
import { hasElevatedAdminAccess } from "@/server/authorization/permissions";

export default async function EmailSettingsPage() {
  const user = await requireSessionUser();
  if (!hasElevatedAdminAccess(user)) notFound();

  const config = await readEmailConfigForUi();
  const attendanceRules = await readAttendanceRuleConfigForUi();

  return (
    <section className="space-y-3">
      <h1 className="nac-heading text-xl font-semibold">Email Settings</h1>
      <p className="text-sm text-slate-600">
        SMTP host and port come from environment variables. Configure SMTP username/password and default email templates here.
      </p>
      <EmailSettingsForm initial={{ ...config, ...attendanceRules }} />
    </section>
  );
}
