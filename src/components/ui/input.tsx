"use client";

import { useId } from "react";
import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

interface FieldChrome {
  label: string;
  helper?: string;
  error?: string;
}

const fieldClass = (error?: string) =>
  "w-full rounded-md border bg-surface px-3 py-2.5 text-base text-ink placeholder:text-ink-faint " +
  "focus:outline-2 focus:outline-offset-1 disabled:bg-surface-soft disabled:text-ink-faint " +
  (error
    ? "border-danger focus:outline-danger"
    : "border-line focus:outline-primary");

function FieldShell({
  id,
  label,
  helper,
  error,
  children,
}: FieldChrome & { id: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : helper ? (
        <p className="text-sm text-ink-faint">{helper}</p>
      ) : null}
    </div>
  );
}

export function TextInput({
  label,
  helper,
  error,
  id,
  ...props
}: FieldChrome & InputHTMLAttributes<HTMLInputElement>) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <FieldShell id={inputId} label={label} helper={helper} error={error}>
      <input id={inputId} className={fieldClass(error)} {...props} />
    </FieldShell>
  );
}

export function TextArea({
  label,
  helper,
  error,
  id,
  rows = 4,
  ...props
}: FieldChrome & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <FieldShell id={inputId} label={label} helper={helper} error={error}>
      <textarea id={inputId} rows={rows} className={fieldClass(error)} {...props} />
    </FieldShell>
  );
}
