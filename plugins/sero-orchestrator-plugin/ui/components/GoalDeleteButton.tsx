import { DeleteConfirmationButton } from './DeleteConfirmationButton';

export function GoalDeleteButton({ busy, onDelete }: { busy: boolean; onDelete: () => void }) {
  return (
    <DeleteConfirmationButton
      resource="Goal"
      description="This permanently removes its objective, evidence, usage, and history from Orchestrator."
      busy={busy}
      onDelete={onDelete}
    />
  );
}
