/**
 * SkillsSection, the Skills page: the grouped list beside the editor.
 *
 * It works out, for the selected skill, whether a same-name skill replaces it
 * and what its model visibility is, and hands both to the editor.
 */

import { useCallback } from 'react';
import type { SkillCrud } from '../hooks/useSkillCrud';
import type { SkillView } from '../hooks/useSkillView';
import type { useSkillVisibility } from '../hooks/useSkillVisibility';
import { ALL_PROJECTS, duplicateNote, originName } from '../lib/skill-catalogue';
import { ResourceSection } from './ResourceSection';
import { SkillEditor } from './SkillEditor';
import { SkillList } from './SkillList';

interface SkillsSectionProps {
  crud: SkillCrud;
  view: SkillView;
  visibility: ReturnType<typeof useSkillVisibility>;
  loading: boolean;
  error: string | null;
  saving: boolean;
  onSelect: (filePath: string) => void;
}

/**
 * The editor shows only a skill that the list shows, and only once its own file
 * has loaded. Filtering to another project hides the selected skill's editor with it.
 */
function shownEditor(crud: SkillCrud, view: SkillView) {
  const entry = crud.selectedEntry && view.inView.includes(crud.selectedEntry) ? crud.selectedEntry : null;
  const loaded = entry !== null && crud.editing?.filePath === entry.filePath;
  return { entry, editing: crud.isNew || loaded ? crud.editing : null };
}

export function SkillsSection({ crud, view, visibility, loading, error, saving, onSelect }: SkillsSectionProps) {
  const { entry, editing } = shownEditor(crud, view);
  const existing = crud.isNew ? null : entry;
  const status = existing ? view.statusFor(existing) : null;
  const workspaceName = view.workspace === ALL_PROJECTS
    ? 'this project'
    : view.projectNames.get(view.workspace) ?? 'this project';

  const changeVisibility = useCallback(
    (visible: boolean) => {
      if (editing) visibility.setSkillEnabled(editing.name, visible);
    },
    [editing, visibility],
  );

  return (
    <ResourceSection
      label="Skill"
      count={view.inView.length}
      countText={view.countText}
      loading={loading}
      error={error}
      onRefresh={crud.refresh}
      onNew={crud.startNew}
      list={<SkillList view={view} projects={crud.projects} selected={crud.selected} onSelect={onSelect} />}
      editor={editing ? (
        <SkillEditor
          data={editing}
          isNew={crud.isNew}
          saving={saving}
          entry={existing}
          originName={entry ? originName(entry, view.projectNames) : 'Yours'}
          duplicate={status ? duplicateNote(status, workspaceName, view.projectNames) : null}
          notUsed={status?.kind === 'loses'}
          visibleToModel={existing ? !existing.disableModelInvocation && !visibility.isHiddenByUser(existing.name) : undefined}
          lockedHidden={entry?.disableModelInvocation}
          onVisibilityChange={existing ? changeVisibility : undefined}
          onSave={crud.save}
          onDelete={crud.remove}
          onChange={crud.setEditing}
        />
      ) : null}
    />
  );
}
