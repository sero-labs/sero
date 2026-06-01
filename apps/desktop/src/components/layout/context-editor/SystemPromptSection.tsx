import { FileText } from 'lucide-react';
import { ContextSection } from '../context-editor-parts';

interface SystemPromptSectionProps {
  displayedPrompt: string;
  systemPrompt: string | null;
  onSystemPromptChange: (value: string | null) => void;
}

export function SystemPromptSection({
  displayedPrompt,
  systemPrompt,
  onSystemPromptChange,
}: SystemPromptSectionProps) {
  return (
    <ContextSection
      icon={FileText}
      title="System Prompt"
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
          <span className="text-[10px] text-[var(--text-muted)]">
            {systemPrompt === null
              ? 'Using the session default system prompt'
              : systemPrompt === ''
                ? 'System prompt excluded from this session'
                : 'Using a custom system prompt for this session'}
          </span>
          {systemPrompt !== null && (
            <button type="button"
              onClick={() => onSystemPromptChange(null)}
              className="text-[10px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]"
            >
              Reset to default
            </button>
          )}
        </div>
        <textarea
          value={displayedPrompt}
          onChange={(event) => onSystemPromptChange(event.target.value)}
          className="h-80 w-full resize-y rounded-md border border-border/30 bg-[var(--bg-base)] p-2 font-mono text-[11px] text-[var(--text-secondary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent-primary)]"
          placeholder="Enter system prompt..."
        />
        <p className="text-[10px] text-[var(--text-muted)]">
          Leave the prompt blank to exclude it entirely, or reset to use the session default.
        </p>
      </div>
    </ContextSection>
  );
}
