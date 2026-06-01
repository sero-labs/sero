import { LocalProviderField } from './LocalProviderField';

interface LocalProviderCompatSectionProps {
  supportsDeveloperRole: boolean;
  onSupportsDeveloperRoleChange: (checked: boolean) => void;
  supportsReasoningEffort: boolean;
  onSupportsReasoningEffortChange: (checked: boolean) => void;
}

export function LocalProviderCompatSection({
  supportsDeveloperRole,
  onSupportsDeveloperRoleChange,
  supportsReasoningEffort,
  onSupportsReasoningEffortChange,
}: LocalProviderCompatSectionProps) {
  return (
    <LocalProviderField label="Compatibility">
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          <input aria-label="Checkbox input"
            type="checkbox"
            checked={supportsDeveloperRole}
            onChange={(event) => onSupportsDeveloperRoleChange(event.target.checked)}
            className="rounded"
          />
          Supports developer role
        </label>
        <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          <input aria-label="Checkbox input"
            type="checkbox"
            checked={supportsReasoningEffort}
            onChange={(event) => onSupportsReasoningEffortChange(event.target.checked)}
            className="rounded"
          />
          Supports reasoning effort
        </label>
      </div>
    </LocalProviderField>
  );
}
