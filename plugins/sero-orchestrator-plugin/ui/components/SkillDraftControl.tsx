/**
 * SkillDraftControl — turns a proven Workflow into a reusable skill
 * (specs/18-skill-extraction.md).
 *
 * The button runs the extraction pass; the dialog is the review the user must
 * pass before anything is written. Every field is editable, because what gets
 * saved is the user's version, not the model's proposal.
 *
 * The review is one state machine, not seven flags: opening a draft, hitting a
 * name collision and closing each move several fields at once, so each is a
 * single dispatched action and the intermediate states cannot be reached.
 */

import { useReducer } from 'react';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, Textarea } from '@sero-ai/ui';
import { GraduationCap } from 'lucide-react';
import type { Loop, SkillDraft } from '../../shared/types';
import { useWatchedJson } from '../lib/use-watched-json';
import { approveSkillWrite } from '../lib/skill-approval';

interface ExtractDetails {
  ok?: boolean;
  loop?: Loop;
  skillDeclined?: string;
  skillDraftBody?: string;
  skillConflict?: { name: string; filePath: string };
}

interface ReviewState {
  open: boolean;
  /** The pending draft this review belongs to; a save names it. */
  draftId: string;
  name: string;
  description: string;
  body: string;
  /** Why the pass judged this worth teaching, and which runs it read. */
  rationale: string;
  fromRunNumbers: number[];
  /** The existing skill name the host refused to overwrite. */
  conflict: string | null;
  /** The pass ran and judged there is nothing durable to teach. */
  declined: string | null;
}

type ReviewAction =
  | { kind: 'extracting' }
  | { kind: 'declined'; reason: string }
  | { kind: 'review'; draft: SkillDraft; body: string }
  | { kind: 'edit'; field: 'name' | 'description' | 'body'; value: string }
  | { kind: 'conflict'; name: string }
  | { kind: 'close' };

const INITIAL: ReviewState = {
  open: false,
  draftId: '',
  name: '',
  description: '',
  body: '',
  rationale: '',
  fromRunNumbers: [],
  conflict: null,
  declined: null,
};

function reduce(state: ReviewState, action: ReviewAction): ReviewState {
  switch (action.kind) {
    case 'extracting':
      return { ...state, declined: null };
    case 'declined':
      return { ...state, open: false, declined: action.reason };
    case 'review':
      return {
        open: true,
        draftId: action.draft.id,
        name: action.draft.name,
        description: action.draft.description,
        body: action.body,
        rationale: action.draft.rationale,
        fromRunNumbers: action.draft.fromRunNumbers,
        conflict: null,
        declined: null,
      };
    case 'edit':
      // Editing the name is how the user resolves a collision, so it clears one.
      return { ...state, [action.field]: action.value, conflict: action.field === 'name' ? null : state.conflict };
    case 'conflict':
      return { ...state, conflict: action.name };
    case 'close':
      return { ...state, open: false, conflict: null };
  }
}

export function SkillDraftControl({
  loop,
  busy,
  onDispatch,
}: {
  loop: Loop;
  busy: boolean;
  onDispatch: (params: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
}) {
  const pending = loop.skillDraft?.status === 'pending' ? loop.skillDraft : undefined;
  const [state, dispatch] = useReducer(reduce, INITIAL);
  const { open, name, description, body, conflict, declined } = state;

  // The draft body is a colocated JSON artifact, so a pending draft can be
  // reopened after a reload without re-running the pass.
  const watched = useWatchedJson<{ body: string }>(pending?.bodyRef ?? null, { body: '' });

  const extract = async () => {
    dispatch({ kind: 'extracting' });
    const details = (await onDispatch({ action: 'extract_skill', loopId: loop.id })) as ExtractDetails | null;
    if (!details || details.ok === false) return;
    if (details.skillDeclined) {
      dispatch({ kind: 'declined', reason: details.skillDeclined });
      return;
    }
    // The fresh draft arrives in the result, before the watched loop file catches up.
    const fresh = details.loop?.skillDraft;
    if (fresh) dispatch({ kind: 'review', draft: fresh, body: details.skillDraftBody ?? '' });
  };

  const save = async (replace?: boolean) => {
    const content = { name: name.trim(), description: description.trim(), body };
    // Saving back into the skill this Workflow already produced is an update, so
    // it does not need the user to answer a collision they did not create.
    const overwrite = replace || loop.skillLink?.name === content.name || undefined;
    // The approval goes over renderer-only IPC and covers exactly these bytes.
    // The host refuses the write without it, so this comes first.
    await approveSkillWrite(`${loop.id}:${state.draftId}`, content);
    const details = (await onDispatch({
      action: 'save_skill',
      loopId: loop.id,
      skillDraftId: state.draftId,
      skillName: content.name,
      skillDescription: content.description,
      skillBody: content.body,
      skillOverwrite: overwrite,
    })) as ExtractDetails | null;
    if (details?.skillConflict) {
      dispatch({ kind: 'conflict', name: details.skillConflict.name });
      return;
    }
    if (details && details.ok !== false) dispatch({ kind: 'close' });
  };

  const discard = async () => {
    await onDispatch({ action: 'discard_skill_draft', loopId: loop.id });
    dispatch({ kind: 'close' });
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        // A pending draft opens from its artifact, so the button waits for it
        // rather than opening the review with an empty SKILL.md.
        disabled={busy || (!!pending && !watched.body)}
        onClick={() => (pending ? dispatch({ kind: 'review', draft: pending, body: watched.body }) : void extract())}
        title={pending ? 'Review the drafted skill' : 'Draft a reusable skill from what this Workflow proved works'}
      >
        <GraduationCap className="mr-1 h-3.5 w-3.5" />
        {pending ? 'Review skill' : 'Skill'}
        {loop.skillLink && !pending && <span className="ml-1 text-sm font-medium">{loop.skillLink.name}</span>}
      </Button>

      {declined && <span className="text-xs text-muted-foreground">Nothing durable to teach yet — {declined}</span>}

      <Dialog open={open} onOpenChange={(next) => !next && dispatch({ kind: 'close' })}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Save as a skill</DialogTitle>
            <DialogDescription>
              {state.rationale}
              {state.fromRunNumbers.length ? ` (from run ${state.fromRunNumbers.join(', ')})` : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="skill-name" className="text-xs">Name</Label>
              <Input id="skill-name" value={name} onChange={(e) => dispatch({ kind: 'edit', field: 'name', value: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="skill-description" className="text-xs">Description — what it does and when to use it</Label>
              <Textarea
                id="skill-description"
                value={description}
                onChange={(e) => dispatch({ kind: 'edit', field: 'description', value: e.target.value })}
                rows={2}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="skill-body" className="text-xs">SKILL.md</Label>
              <Textarea
                id="skill-body"
                value={body}
                onChange={(e) => dispatch({ kind: 'edit', field: 'body', value: e.target.value })}
                rows={14}
                className="font-mono text-xs"
              />
            </div>
            {conflict && (
              <p className="text-xs text-amber-500">
                A skill named “{conflict}” already exists. Rename it above, or replace it.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" disabled={busy} onClick={() => void discard()}>Discard</Button>
            {conflict ? (
              <Button variant="destructive" disabled={busy} onClick={() => void save(true)}>Replace {conflict}</Button>
            ) : (
              <Button disabled={busy || !name.trim() || !description.trim() || !body.trim()} onClick={() => void save()}>
                Save skill
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
