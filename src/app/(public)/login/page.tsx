"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { withBasePath } from "@/lib/basePath";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const res = await fetch(withBasePath("/api/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: form.get("username"),
        password: form.get("password"),
      }),
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Login failed");
      setLoading(false);
      return;
    }

    router.push("/app");
    router.refresh();
  }

  return (
    <main className="na-auth-bg">
      <div className="na-auth-card">
        <div className="flex items-center justify-center">
          <Image src={withBasePath("/logo.png")} alt="Nepal Airlines logo" width={280} height={90} priority className="h-auto w-64 object-contain" />
        </div>
        <form onSubmit={onSubmit} className="mt-8 space-y-5">
          <div>
            <label htmlFor="username" className="na-auth-label">Email</label>
            <input id="username" name="username" placeholder="you@example.com" className="nac-input na-auth-input" required />
          </div>
          <div>
            <label htmlFor="password" className="na-auth-label">Password</label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                className="nac-input na-auth-input pr-11"
                required
              />
              <button
                type="button"
                className="na-auth-icon-btn absolute right-3 top-1/2 -translate-y-1/2"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M2.1 12.4c-.13-.25-.13-.55 0-.8C3.8 8.2 7.6 5.5 12 5.5c4.4 0 8.2 2.7 9.9 6.1.13.25.13.55 0 .8-1.7 3.4-5.5 6.1-9.9 6.1-4.4 0-8.2-2.7-9.9-6.1Z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                </svg>
              </button>
          </div>
        </div>
          {error ? <p className="text-sm font-semibold text-red-700">{error}</p> : null}
          <button disabled={loading} className="nac-btn-primary na-auth-btn disabled:opacity-60">
            {loading ? "Signing in..." : "Login"}
          </button>
        </form>
      </div>
    </main>
  );
}
