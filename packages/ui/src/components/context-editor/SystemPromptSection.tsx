import { FileText } from 'lucide-react';
import { ContextSection } from './parts';

export interface SystemPromptCopy {
  /** Section title. Defaults to "System Prompt". */
  title?: string;
  /** Help text when no override is set. */
  defaultHint?: string;
  /** Help text when the prompt is set to empty string. */
  emptyHint?: string;
  /** Help text when a custom prompt is set. */
  customHint?: string;
  /** Textarea placeholder. */
  placeholder?: string;
  /** Footer note under the textarea. */
  footnote?: string;
}

const DEFAULT_COPY: Required<SystemPromptCopy> = {
  title: 'System Prompt',
  defaultHint: 'Using the default system prompt',
  emptyHint: 'System prompt excluded',
  customHint: 'Using a custom system prompt',
  placeholder: 'Enter system prompt...',
  footnote: 'Leave the prompt blank to exclude it entirely, or reset to use the default.',
};

interface SystemPromptSectionProps {
  displayedPrompt: string;
  systemPrompt: string | null;
  onSystemPromptChange: (value: string | null) => void;
  copy?: SystemPromptCopy;
}

export function SystemPromptSection({
  displayedPrompt,
  systemPrompt,
  onSystemPromptChange,
  copy,
}: SystemPromptSectionProps) {
  const c = { ...DEFAULT_COPY, ...copy };

  return (
    <ContextSection
      icon={FileText}
      title={c.title}
      tint="blue"
      badge={
        systemPrompt !== null
          ? (systemPrompt === '' ? 'excluded' : 'custom')
          : undefined
      }
      badgeVariant={
        systemPrompt !== null
          ? (systemPrompt === '' ? 'disabled' : 'modified')
          : 'default'
      }
      defaultOpen={false}
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-[var(--text-muted)]">
            {systemPrompt === null
              ? c.defaultHint
              : systemPrompt === ''
                ? c.emptyHint
                : c.customHint}
          </span>
          {systemPrompt !== null && (
            <button type="button"
              onClick={() => onSystemPromptChange(null)}
              className="text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]"
            >
              Reset to default
            </button>
          )}
        </div>
        <textarea aria-label="System prompt"
          value={displayedPrompt}
          onChange={(event) => onSystemPromptChange(event.target.value)}
          className="h-80 w-full resize-y rounded-md border border-border/30 bg-[var(--bg-base)] p-2 font-mono text-sm text-[var(--text-secondary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent-primary)]"
          placeholder={c.placeholder}
        />
        <p className="text-sm text-[var(--text-muted)]">{c.footnote}</p>
      </div>
    </ContextSection>
  );
}
