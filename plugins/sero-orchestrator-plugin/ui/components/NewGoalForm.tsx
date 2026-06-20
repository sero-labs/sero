import { useState } from 'react';
import { Button, Input } from '@sero-ai/ui';

import type { ExecutionMode } from '../../shared/types';
import '../styles.css';

const MODE_LABEL: Record<ExecutionMode, string> = {
  'background-worker': 'Background worker',
  'active-session': 'Active chat',
  hybrid: 'Hybrid',
};

interface NewGoalFormProps {
  busy: boolean;
  onCreate: (input: { title: string; goal: string; executionMode: ExecutionMode }) => Promise<boolean>;
}

export function NewGoalForm({ busy, onCreate }: NewGoalFormProps) {
  const [title, setTitle] = useState('');
  const [goal, setGoal] = useState('');
  const [mode, setMode] = useState<ExecutionMode>('background-worker');

  const canSubmit = title.trim().length > 0 && goal.trim().length > 0 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    const ok = await onCreate({ title: title.trim(), goal: goal.trim(), executionMode: mode });
    if (ok) {
      setTitle('');
      setGoal('');
      setMode('background-worker');
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-2 border-b border-border p-3"
    >
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="New goal title"
        aria-label="Goal title"
      />
      <textarea
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        placeholder="What should this loop achieve?"
        aria-label="Goal description"
        rows={2}
        className="min-h-0 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <div className="flex items-center gap-2">
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as ExecutionMode)}
          aria-label="How attempts run"
          className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {(Object.keys(MODE_LABEL) as ExecutionMode[]).map((value) => (
            <option key={value} value={value}>
              {MODE_LABEL[value]}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" disabled={!canSubmit}>
          Add goal
        </Button>
      </div>
    </form>
  );
}

export default NewGoalForm;
