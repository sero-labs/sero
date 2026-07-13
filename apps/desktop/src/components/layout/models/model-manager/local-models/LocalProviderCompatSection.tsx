import { Checkbox } from '@sero-ai/ui/components/ui/checkbox';
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
          <Checkbox
            checked={supportsDeveloperRole}
            onCheckedChange={(checked) => onSupportsDeveloperRoleChange(checked === true)}
          />
          Supports developer role
        </label>
        <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          <Checkbox
            checked={supportsReasoningEffort}
            onCheckedChange={(checked) => onSupportsReasoningEffortChange(checked === true)}
          />
          Supports reasoning effort
        </label>
      </div>
    </LocalProviderField>
  );
}
