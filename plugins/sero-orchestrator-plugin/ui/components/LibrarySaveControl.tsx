/**
 * LibrarySaveControl — saves a loop's definition into the profile-global Loop
 * Library via the `library_save` action. A linked loop saves a new version of
 * its entry by default; an unlinked loop (or "save as new entry") creates a new
 * entry. The plan/triggers/limits/context travel; run history never does.
 */

import { useState } from 'react';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, Textarea } from '@sero-ai/ui';
import { BookmarkPlus } from 'lucide-react';
import type { Loop, OrchestratorAction } from '../../shared/types';

export function LibrarySaveControl({
  loop,
  busy,
  onAction,
}: {
  loop: Loop;
  busy: boolean;
  onAction: (action: OrchestratorAction) => void;
}) {
  const [open, setOpen] = useState(false);
  const linked = loop.libraryLink;
  const [asNewEntry, setAsNewEntry] = useState(false);
  const [name, setName] = useState(loop.title);
  const [note, setNote] = useState('');

  // A new entry is created when the loop isn't linked, or the user opts out of
  // bumping the linked entry.
  const newEntry = !linked || asNewEntry;

  const reset = () => {
    setAsNewEntry(false);
    setName(loop.title);
    setNote('');
  };

  const submit = () => {
    onAction({
      kind: 'library_save',
      loopId: loop.id,
      mode: newEntry ? 'new-entry' : 'new-version',
      name: newEntry ? name.trim() || loop.title : undefined,
      note: note.trim() || undefined,
    });
    setOpen(false);
    reset();
  };

  return (
    <>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => setOpen(true)} title="Save this Workflow to the Library">
        <BookmarkPlus className="mr-1 h-3.5 w-3.5" />
        Library
        {linked && <span className="ml-1 text-sm font-medium">v{linked.version}</span>}
      </Button>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save to Library</DialogTitle>
            <DialogDescription>
              {linked
                ? `Linked to a library entry (currently v${linked.version}). Saving a new version lets other loaded copies update to it.`
                : 'Saves this Workflow’s plan, triggers, limits, and context to the shared Library. Run history is never saved.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            {newEntry && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="lib-name" className="text-xs">Entry name</Label>
                <Input id="lib-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={loop.title} />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lib-note" className="text-xs">What changed (optional)</Label>
              <Textarea id="lib-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="e.g. added a validation step" />
            </div>
            {linked && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={asNewEntry} onChange={(e) => setAsNewEntry(e.target.checked)} />
                Save as a new entry instead of a new version
              </label>
            )}
          </div>

          <DialogFooter>
            <Button size="sm" variant="ghost" onClick={() => { setOpen(false); reset(); }}>Cancel</Button>
            <Button size="sm" disabled={busy} onClick={submit}>
              {newEntry ? 'Save to Library' : 'Save new version'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
