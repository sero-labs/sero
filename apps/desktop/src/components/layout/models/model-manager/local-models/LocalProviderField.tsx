import type { ReactNode } from 'react';

interface LocalProviderFieldProps {
  label: string;
  hint?: string;
  children: ReactNode;
}

export function LocalProviderField({
  label,
  hint,
  children,
}: LocalProviderFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-2">
        <label className="text-sm font-medium uppercase tracking-wider text-[var(--text-muted)]">
          {label}
        </label>
        {hint && (
          <span className="text-sm text-[var(--text-muted)]">{hint}</span>
        )}
      </div>
      {children}
    </div>
  );
}
