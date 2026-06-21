import { useState } from 'react';
import { Button, Input } from '@sero-ai/ui';

import type { LoopGoal } from '../../shared/types';
import type { OrchestratorActions } from '../lib/actions';
import '../styles.css';

interface EditGoalFormProps {
  loop: LoopGoal;
  actions: OrchestratorActions;
  onDone: () => void;
}

/** Inline editor for a goal's title/text; changing the goal re-derives the plan. */
export function EditGoalForm({ loop, actions, onDone }: EditGoalFormProps) {
  const [title, setTitle] = useState(loop.title);
  const [goal, setGoal] = useState(loop.goal);

  const dirty = title.trim() !== loop.title || goal.trim() !== loop.goal;
  const canSave = title.trim().length > 0 && goal.trim().length > 0 && dirty && !actions.busy;

  const save = async () => {
    if (!canSave) return;
    const ok = await actions.edit(loop.id, { title: title.trim(), goal: goal.trim() });
    if (ok) onDone();
  };

  return (
    <div className="flex flex-col gap-2">
      <Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Goal title" />
      <textarea
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        aria-label="Goal description"
        rows={3}
        className="resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={!canSave} onClick={() => void save()}>
          Save
        </Button>
        <Button size="sm" variant="outline" disabled={actions.busy} onClick={onDone}>
          Cancel
        </Button>
        <span className="text-xs text-muted-foreground">Changing the goal re-checks how it’s verified.</span>
      </div>
    </div>
  );
}

export default EditGoalForm;
