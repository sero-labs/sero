/**
 * File preview — code/text/image preview with syntax highlighting and tabs.
 */

import { memo } from 'react';
import { useFileStore } from '@/stores/files';
import { getLanguageFromPath, isImageFile } from '@/lib/file-api';
import { cn } from '@/lib/cn';
import { X, FileText } from 'lucide-react';

function CodePreview({ content, language }: { content: string; language?: string }) {
  return (
    <pre className="p-4 text-sm font-mono overflow-auto h-full">
      <code className={language ? `language-${language}` : ''}>
        {content}
      </code>
    </pre>
  );
}

function ImagePreview({ content, mimeType }: { content: string; mimeType: string }) {
  return (
    <div className="flex items-center justify-center h-full p-4">
      <img
        src={`data:${mimeType};base64,${content}`}
        alt="File preview"
        className="max-w-full max-h-full object-contain rounded-lg"
      />
    </div>
  );
}

const FileTab = memo(function FileTab({
  path,
  isActive,
  onActivate,
  onClose,
}: {
  path: string;
  isActive: boolean;
  onActivate: () => void;
  onClose: () => void;
}) {
  const fileName = path.split('/').pop() ?? path;

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 text-xs border-r border-border cursor-pointer',
        'group',
        isActive
          ? 'bg-background text-foreground'
          : 'bg-card text-muted-foreground hover:text-foreground',
      )}
    >
      <button onClick={onActivate} className="truncate max-w-[120px]">
        {fileName}
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
});

export function FilePreview() {
  const openFiles = useFileStore((s) => s.openFiles);
  const activeFilePath = useFileStore((s) => s.activeFilePath);
  const setActiveFile = useFileStore((s) => s.setActiveFile);
  const closeFile = useFileStore((s) => s.closeFile);

  const activeFile = openFiles.find((f) => f.path === activeFilePath);

  if (openFiles.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Select a file to preview</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex border-b border-border bg-card overflow-x-auto">
        {openFiles.map((file) => (
          <FileTab
            key={file.path}
            path={file.path}
            isActive={file.path === activeFilePath}
            onActivate={() => setActiveFile(file.path)}
            onClose={() => closeFile(file.path)}
          />
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-background">
        {activeFile && (
          isImageFile(activeFile.mimeType) ? (
            <ImagePreview
              content={activeFile.content}
              mimeType={activeFile.mimeType}
            />
          ) : (
            <CodePreview
              content={activeFile.encoding === 'base64'
                ? atob(activeFile.content)
                : activeFile.content}
              language={getLanguageFromPath(activeFile.path)}
            />
          )
        )}
      </div>
    </div>
  );
}
