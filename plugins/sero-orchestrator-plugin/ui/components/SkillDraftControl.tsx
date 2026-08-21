/**
 * SkillDraftControl — turns a proven Workflow into a reusable skill
 * (specs/18-skill-extraction.md).
 *
 * The button runs the extraction pass; the dialog is the review the user must
 * pass before anything is written. Every field is editable, because what gets
 * saved is the user's version, not the model's proposal.
 */

import { useState } from 'react';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, Textarea } from '@sero-ai/ui';
import { GraduationCap } from 'lucide-react';
import type { Loop, SkillDraft } from '../../shared/types';
import { useWatchedJson } from '../lib/use-watched-json';

interface ExtractDetails {
  ok?: boolean;
  loop?: Loop;
  skillDeclined?: string;
  skillDraftBody?: string;
  skillConflict?: { name: string; filePath: string };
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
  const [open, setOpen] = useState(false);
  const [declined, setDeclined] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [body, setBody] = useState('');
  // Held here as well as on the loop: a freshly extracted draft reaches the
  // dialog through the action result, before the watched loop file catches up.
  const [provenance, setProvenance] = useState<{ rationale: string; fromRunNumbers: number[] }>({ rationale: '', fromRunNumbers: [] });

  // The draft body is a colocated JSON artifact, so a pending draft can be
  // reopened after a reload without re-running the pass.
  const watched = useWatchedJson<{ body: string }>(pending?.bodyRef ?? null, { body: '' });

  const review = (draftValues: SkillDraft, draftBody: string) => {
    setName(draftValues.name);
    setDescription(draftValues.description);
    setBody(draftBody);
    setProvenance({ rationale: draftValues.rationale, fromRunNumbers: draftValues.fromRunNumbers });
    setConflict(null);
    setOpen(true);
  };

  const extract = async () => {
    setDeclined(null);
    const details = (await onDispatch({ action: 'extract_skill', loopId: loop.id })) as ExtractDetails | null;
    if (!details || details.ok === false) return;
    if (details.skillDeclined) {
      setDeclined(details.skillDeclined);
      return;
    }
    const fresh = details.loop?.skillDraft;
    if (fresh) review(fresh, details.skillDraftBody ?? '');
  };

  const save = async (overwrite?: boolean) => {
    const details = (await onDispatch({
      action: 'save_skill',
      loopId: loop.id,
      skillName: name.trim(),
      skillDescription: description.trim(),
      skillBody: body,
      skillOverwrite: overwrite,
    })) as ExtractDetails | null;
    if (details?.skillConflict) {
      setConflict(details.skillConflict.name);
      return;
    }
    if (details && details.ok !== false) setOpen(false);
  };

  const discard = async () => {
    await onDispatch({ action: 'discard_skill_draft', loopId: loop.id });
    setOpen(false);
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => (pending ? review(pending, watched.body) : void extract())}
        title={pending ? 'Review the drafted skill' : 'Draft a reusable skill from what this Workflow proved works'}
      >
        <GraduationCap className="mr-1 h-3.5 w-3.5" />
        {pending ? 'Review skill' : 'Skill'}
        {loop.skillLink && !pending && <span className="ml-1 text-sm font-medium">{loop.skillLink.name}</span>}
      </Button>

      {declined && <span className="text-xs text-muted-foreground">Nothing durable to teach yet — {declined}</span>}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Save as a skill</DialogTitle>
            <DialogDescription>
              {provenance.rationale}
              {provenance.fromRunNumbers.length ? ` (from run ${provenance.fromRunNumbers.join(', ')})` : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="skill-name" className="text-xs">Name</Label>
              <Input id="skill-name" value={name} onChange={(e) => { setName(e.target.value); setConflict(null); }} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="skill-description" className="text-xs">Description — what it does and when to use it</Label>
              <Textarea id="skill-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="skill-body" className="text-xs">SKILL.md</Label>
              <Textarea id="skill-body" value={body} onChange={(e) => setBody(e.target.value)} rows={14} className="font-mono text-xs" />
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
