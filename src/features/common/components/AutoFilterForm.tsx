"use client";

import { FormEvent, ReactNode, useCallback, useMemo, useRef, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Props = {
  actionPath?: string;
  debounceMs?: number;
  className?: string;
  children: ReactNode;
};

export default function AutoFilterForm({
  actionPath,
  debounceMs = 500,
  className,
  children,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isPending, startTransition] = useTransition();

  const targetPath = useMemo(() => actionPath || pathname || "/", [actionPath, pathname]);

  const applyForm = useCallback(
    (form: HTMLFormElement) => {
      const existingQuery = searchParams?.toString() ?? "";
      const current = new URLSearchParams(existingQuery);
      const formData = new FormData(form);
      const formKeys = new Set<string>();
      const nextFormValues = new URLSearchParams();

      for (const [rawKey, rawValue] of formData.entries()) {
        const key = String(rawKey);
        formKeys.add(key);
        const value = String(rawValue ?? "").trim();
        if (value.length > 0) {
          nextFormValues.append(key, value);
        }
      }

      for (const key of formKeys) {
        current.delete(key);
      }
      for (const [key, value] of nextFormValues.entries()) {
        current.append(key, value);
      }

      const query = current.toString();
      const href = query ? `${targetPath}?${query}` : targetPath;
      const currentHref = existingQuery ? `${targetPath}?${existingQuery}` : targetPath;
      if (href === currentHref) {
        return;
      }

      startTransition(() => {
        router.replace(href, { scroll: false });
      });
    },
    [router, searchParams, targetPath],
  );

  const scheduleApply = useCallback(
    (form: HTMLFormElement) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => applyForm(form), debounceMs);
    },
    [applyForm, debounceMs],
  );

  const onSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      applyForm(e.currentTarget);
    },
    [applyForm],
  );

  return (
    <form
      className={className}
      onSubmit={onSubmit}
      onInputCapture={(e) => scheduleApply(e.currentTarget)}
      onChangeCapture={(e) => scheduleApply(e.currentTarget)}
      data-pending={isPending ? "true" : "false"}
    >
      {children}
    </form>
  );
}
