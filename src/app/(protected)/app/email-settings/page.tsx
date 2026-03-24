import { notFound } from "next/navigation";
import { requireSessionUser } from "@/server/auth/session";
import { readEmailConfigForUi } from "@/server/email/config";
import EmailSettingsForm from "@/features/email/components/EmailSettingsForm";

export default async function EmailSettingsPage() {
  const user = await requireSessionUser();
  if (!user.isSuperuser) notFound();

  const config = await readEmailConfigForUi();

  return (
    <section className="space-y-3">
      <h1 className="nac-heading text-xl font-semibold">Email Settings</h1>
      <p className="text-sm text-slate-600">
        SMTP host and port come from environment variables. Configure SMTP username/password and default email templates here.
      </p>
      <EmailSettingsForm initial={config} />
    </section>
  );
}
