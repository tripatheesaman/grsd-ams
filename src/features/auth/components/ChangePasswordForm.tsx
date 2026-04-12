"use client";

import { FormEvent, useState } from "react";
import { withBasePath } from "@/lib/basePath";

export default function ChangePasswordForm() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    setError(null);

    const f = new FormData(e.currentTarget);
    const payload = {
      oldPassword: f.get("oldPassword"),
      newPassword: f.get("newPassword"),
      confirmPassword: f.get("confirmPassword"),
    };

    const res = await fetch(withBasePath("/api/auth/change-password"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Password change failed");
      return;
    }

    setMessage("Password changed successfully.");
    e.currentTarget.reset();
  }

  return (
    <form onSubmit={onSubmit} className="nac-card space-y-2 p-4">
      <h2 className="nac-heading text-lg font-semibold">Change Password</h2>
      <input required type="password" name="oldPassword" placeholder="Current password" className="nac-input" />
      <input required type="password" name="newPassword" placeholder="New password" className="nac-input" />
      <input required type="password" name="confirmPassword" placeholder="Confirm new password" className="nac-input" />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-green-600">{message}</p> : null}
      <button className="nac-btn-primary px-3 py-2" type="submit">Update Password</button>
    </form>
  );
}
