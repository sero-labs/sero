import { Checkbox } from '@sero-ai/ui/components/ui/checkbox';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@sero-ai/ui/components/ui/select';
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
        <Select value={thinkingFormat} onValueChange={(value) => onThinkingFormatChange(value as LocalThinkingFormat)}>
          <SelectTrigger size="sm" aria-label="Thinking request format" className="h-8 w-full border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 text-xs text-[var(--text-primary)]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {commonFormats.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
            <SelectGroup>
              <SelectLabel>Advanced formats</SelectLabel>
              {advancedFormats.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
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
