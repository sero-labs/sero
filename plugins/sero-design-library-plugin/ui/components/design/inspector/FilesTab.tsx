import { Button, ScrollArea } from '@sero-ai/ui';
import { FolderOpen } from 'lucide-react';

import type { DesignRevisionFile } from '../../../../shared/design';
import { formatBytes } from '../../../lib/format';
import { Block, Field } from './Field';

/**
 * The files this revision is made of.
 *
 * Names and sizes rather than contents: a revision is a small file tree on disk,
 * and reading one into the panel would put tens of kilobytes of markup where a
 * list belongs. What the tab is for is knowing what was written — a page with no
 * stylesheet is visible here and nowhere else.
 */
export function FilesTab({
  files,
  onOpen,
}: {
  files: DesignRevisionFile[];
  onOpen?: () => void;
}) {
  if (files.length === 0) {
    return <p className="text-muted-foreground px-4 py-3 text-sm">Nothing has been written yet.</p>;
  }

  return (
    <ScrollArea className="min-h-0 flex-1">
      <Block>
        {onOpen !== undefined && (
          <Button type="button" variant="outline" size="sm" className="mb-3" onClick={onOpen}>
            <FolderOpen className="size-3.5" />
            Show in folder
          </Button>
        )}
        <Field label="Files">
          <ul className="space-y-1 font-mono text-sm">
            {files.map((file) => (
              <li key={file.name} className="flex items-baseline justify-between gap-2">
                <span className="truncate">{file.name}</span>
                <span className="text-muted-foreground shrink-0 tabular-nums">
                  {formatBytes(file.bytes)}
                </span>
              </li>
            ))}
          </ul>
        </Field>
      </Block>
    </ScrollArea>
  );
}
