"use client";

import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { withBasePath } from "@/lib/basePath";

type Department = { id: number; name: string };
type InitialValues = {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  departmentId: string;
  isActive: boolean;
  isStaff: boolean;
  isSuperuser: boolean;
  isDepartmentAdmin: boolean;
};

type RoleValue = "user" | "department_superadmin" | "superadmin";

function deriveRole(initial: InitialValues): RoleValue {
  if (initial.isSuperuser) return "superadmin";
  if (initial.isDepartmentAdmin) return "department_superadmin";
  return "user";
}

export default function UserForm({
  departments,
  mode,
  userId,
  initial,
  allowGlobalSuperadmin = true,
}: {
  departments: Department[];
  mode: "create" | "edit";
  userId?: string;
  initial: InitialValues;
  allowGlobalSuperadmin?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialRole = deriveRole(initial);

  async function submitFormData(formData: FormData) {
    setBusy(true);
    setError(null);
    const payload = {
      username: String(formData.get("username") ?? "").trim(),
      email: String(formData.get("email") ?? "").trim(),
      firstName: String(formData.get("firstName") ?? "").trim(),
      lastName: String(formData.get("lastName") ?? "").trim(),
      password: String(formData.get("password") ?? ""),
      departmentId: String(formData.get("departmentId") ?? "").trim(),
      isActive: formData.get("isActive") === "on",
      isStaff: formData.get("isStaff") === "on",
      isSuperuser: false,
      isDepartmentAdmin: false,
    };
    const role = String(formData.get("role") ?? "user") as RoleValue;
    if (role === "superadmin" && allowGlobalSuperadmin) {
      payload.isSuperuser = true;
      payload.isDepartmentAdmin = false;
    } else if (role === "department_superadmin") {
      payload.isSuperuser = false;
      payload.isDepartmentAdmin = true;
    }
    if (mode === "edit" && !payload.password) {
      delete (payload as { password?: string }).password;
    }

    const endpoint = mode === "create" ? withBasePath("/api/users") : withBasePath(`/api/users/${userId}`);
    const method = mode === "create" ? "POST" : "PUT";
    const res = await fetch(endpoint, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error || "Failed to save user.");
      setBusy(false);
      return;
    }
    router.push("/app/users");
    router.refresh();
  }

  return (
    <form
      className="nac-card grid gap-3 p-4 md:grid-cols-2"
      onSubmit={async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        await submitFormData(formData);
      }}
    >
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Username</label>
        <input name="username" defaultValue={initial.username} className="nac-input" required />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Email</label>
        <input name="email" type="email" defaultValue={initial.email} className="nac-input" required />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">First Name</label>
        <input name="firstName" defaultValue={initial.firstName} className="nac-input" required />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Last Name</label>
        <input name="lastName" defaultValue={initial.lastName} className="nac-input" required />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          Password {mode === "edit" ? "(leave blank to keep current)" : ""}
        </label>
        <input name="password" type="password" minLength={8} className="nac-input" required={mode === "create"} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Department</label>
        <select name="departmentId" defaultValue={initial.departmentId} className="nac-select" required>
          <option value="">Select department</option>
          {departments.map((d) => (
            <option key={d.id} value={String(d.id)}>
              {d.name}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={initial.isActive} />
        Active
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isStaff" defaultChecked={initial.isStaff} />
        Staff Access
      </label>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Role</label>
        <select
          name="role"
          defaultValue={!allowGlobalSuperadmin && initialRole === "superadmin" ? "department_superadmin" : initialRole}
          className="nac-select"
        >
          <option value="user">Department User</option>
          <option value="department_superadmin">Department Superadmin</option>
          {allowGlobalSuperadmin ? <option value="superadmin">Superadmin</option> : null}
        </select>
      </div>
      <div className="md:col-span-2 flex items-center justify-between">
        {error ? <p className="text-sm text-red-600">{error}</p> : <span />}
        <button type="submit" className="nac-btn-primary px-4 py-2.5 text-sm" disabled={busy}>
          {busy ? "Saving..." : mode === "create" ? "Create User" : "Save Changes"}
        </button>
      </div>
    </form>
  );
}

