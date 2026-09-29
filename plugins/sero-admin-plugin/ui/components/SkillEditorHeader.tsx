/**
 * SkillEditorHeader, the title row of the skill editor: name, where the skill
 * comes from, and the Delete and Save actions that its scope allows.
 */

import { Save, Trash2 } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import type { SkillScopeIPC } from '../hooks/host';

interface SkillEditorHeaderProps {
  title: string;
  scope: SkillScopeIPC;
  originName: string;
  saving: boolean;
  canSave: boolean;
  /** Set only for a skill that may be deleted. */
  deletePath?: string;
  onDelete: (filePath: string) => void;
}

export function SkillEditorHeader({ title, scope, originName, saving, canSave, deletePath, onDelete }: SkillEditorHeaderProps) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-4 py-2">
      <span className="flex-1 text-base font-medium text-foreground truncate">{title}</span>
      {scope !== 'user' && (
        <span className="rounded bg-muted px-1.5 py-0.5 text-sm text-muted-foreground">
          {originName}
        </span>
      )}
      {deletePath && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={() => onDelete(deletePath)}
        >
          <Trash2 className="size-3.5" />
          Delete
        </Button>
      )}
      {/* A plugin's skill belongs to the plugin, so it has nothing to save. */}
      {scope !== 'plugin' && (
        <Button type="submit" size="sm" disabled={!canSave || saving}>
          {saving ? 'Saving...' : (
            <>
              <Save className="size-3.5" />
              Save
            </>
          )}
        </Button>
      )}
    </div>
  );
}
