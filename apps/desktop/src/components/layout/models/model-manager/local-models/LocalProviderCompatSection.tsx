import { Checkbox } from '@sero-ai/ui/components/ui/checkbox';
import type { LocalThinkingFormat } from '@/types/local-models';
import { LocalProviderField } from './LocalProviderField';
import { THINKING_FORMAT_OPTIONS } from './shared';

interface LocalProviderCompatSectionProps {
  supportsDeveloperRole: boolean;
  onSupportsDeveloperRoleChange: (checked: boolean) => void;
  supportsReasoningEffort: boolean;
  onSupportsReasoningEffortChange: (checked: boolean) => void;
  thinkingFormat: LocalThinkingFormat;
  onThinkingFormatChange: (format: LocalThinkingFormat) => void;
}

export function LocalProviderCompatSection({
  supportsDeveloperRole,
  onSupportsDeveloperRoleChange,
  supportsReasoningEffort,
  onSupportsReasoningEffortChange,
  thinkingFormat,
  onThinkingFormatChange,
}: LocalProviderCompatSectionProps) {
  const commonFormats = THINKING_FORMAT_OPTIONS.filter((option) => !option.advanced);
  const advancedFormats = THINKING_FORMAT_OPTIONS.filter((option) => option.advanced);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[var(--border-subtle)] p-3">
      <LocalProviderField label="Thinking Request Format">
        <select
          aria-label="Thinking request format"
          value={thinkingFormat}
          onChange={(event) => onThinkingFormatChange(
            event.target.value as LocalThinkingFormat,
          )}
          className="h-8 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)]
            px-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)]"
        >
          {commonFormats.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
          <optgroup label="Advanced formats">
            {advancedFormats.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </optgroup>
        </select>
        {thinkingFormat === 'qwen-chat-template' ? (
          <p className="text-sm text-[var(--text-muted)]">
            Uses Qwen chat template controls for SGLang and sends the model's mapped
            reasoning effort.
          </p>
        ) : null}
      </LocalProviderField>
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
          Supports reasoning effort values
        </label>
        </div>
      </LocalProviderField>
    </div>
  );
}
