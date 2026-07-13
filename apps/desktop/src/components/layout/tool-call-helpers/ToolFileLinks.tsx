import { ImageIcon } from 'lucide-react';
import { useEditorBridge } from '@/stores/editor-bridge';
import { looksLikeFilePath, toEditorVirtualPath } from '../ClickableFilePath';

function basename(filePath: string): string {
  return filePath.split('/').filter(Boolean).pop() ?? filePath;
}

export function getImagePaths(details: Record<string, unknown> | null | undefined): string[] {
  const value = details?.imagePaths;
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && looksLikeFilePath(entry));
}

export function ToolFileLinks({
  details,
  imagePaths,
  workspaceId,
}: {
  details?: Record<string, unknown> | null;
  imagePaths?: string[];
  workspaceId: string | null;
}) {
  const requestOpenFile = useEditorBridge((state) => state.requestOpenFile);
  const paths = [...new Set(imagePaths ?? getImagePaths(details))];

  if (!workspaceId || paths.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 px-3 py-2">
      {paths.map((filePath) => {
        const editorPath = toEditorVirtualPath(filePath);
        return (
          <a
            key={filePath}
            href={`sero-editor:${editorPath}`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              requestOpenFile(workspaceId, editorPath);
            }}
            className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-[var(--accent-primary)]/40 bg-[var(--accent-primary)]/10 px-2 py-1 text-left text-sm font-medium text-[var(--accent-primary)] underline-offset-2 transition-colors hover:bg-[var(--accent-primary)]/15 hover:underline"
            title={`Open ${filePath} in editor`}
          >
            <ImageIcon className="size-3 shrink-0" />
            <span className="truncate font-mono">{basename(filePath)}</span>
          </a>
        );
      })}
    </div>
  );
}
