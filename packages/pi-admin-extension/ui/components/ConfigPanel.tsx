/**
 * ConfigPanel — config file list + JSON editor.
 *
 * Lists known Sero config files on the left, shows the selected file's
 * JSON content in an editable textarea on the right. Supports save + reload.
 */

import { useState, useCallback, memo } from 'react';
import { cn } from '@sero/ui/lib/utils';
import { Button } from '@sero/ui/components/ui/button';
import { Badge } from '@sero/ui/components/ui/badge';
import { ScrollArea } from '@sero/ui/components/ui/scroll-area';
import { CONFIG_FILES } from '../../shared/types';
import type { ConfigFile } from '../../shared/types';
import { useConfigFile } from '../hooks/useSeroFiles';

interface ConfigPanelProps {
  profilePath: string | null;
  selectedKey: string | null;
  onSelectKey: (key: string) => void;
}

export const ConfigPanel = memo(function ConfigPanel({
  profilePath,
  selectedKey,
  onSelectKey,
}: ConfigPanelProps) {
  return (
    <div className="flex min-h-0 flex-1">
      <ConfigSidebar
        selectedKey={selectedKey}
        onSelect={onSelectKey}
      />
      <div className="min-h-0 flex-1 overflow-hidden">
        <div key={selectedKey ?? '__empty'} className="admin-fade-in h-full">
          {selectedKey ? (
            <ConfigEditor profilePath={profilePath} configKey={selectedKey} />
          ) : (
            <EmptyState />
          )}
        </div>
      </div>
    </div>
  );
});

// ── Config file sidebar ────────────────────────────────────

const ConfigSidebar = memo(function ConfigSidebar({
  selectedKey,
  onSelect,
}: {
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="flex w-56 flex-col border-r border-border/30">
      <div className="px-3 py-2">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
          Config Files
        </p>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {CONFIG_FILES.map((cf) => (
          <ConfigFileItem
            key={cf.key}
            config={cf}
            isSelected={cf.key === selectedKey}
            onSelect={() => onSelect(cf.key)}
          />
        ))}
      </ScrollArea>
    </div>
  );
});

// ── Single config file item ────────────────────────────────

const ConfigFileItem = memo(function ConfigFileItem({
  config,
  isSelected,
  onSelect,
}: {
  config: ConfigFile;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'admin-sidebar-item w-full px-3 py-2 text-left transition-colors duration-150',
        'hover:bg-secondary/50',
        isSelected && 'bg-indigo-500/8 border-r-2 border-indigo-400',
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn(
          'text-xs font-medium',
          isSelected ? 'text-indigo-400' : 'text-foreground/80',
        )}>
          {config.label}
        </span>
        {config.sensitive && (
          <Badge
            variant="outline"
            className="h-4 rounded border-amber-500/20 bg-amber-500/5 px-1 text-[9px] text-amber-400"
          >
            sensitive
          </Badge>
        )}
        {config.readOnly && (
          <Badge
            variant="outline"
            className="h-4 rounded border-muted-foreground/20 px-1 text-[9px] text-muted-foreground"
          >
            read-only
          </Badge>
        )}
      </div>
      <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground/60">
        {config.description}
      </p>
    </button>
  );
});

// ── JSON Editor ────────────────────────────────────────────

function ConfigEditor({
  profilePath,
  configKey,
}: {
  profilePath: string | null;
  configKey: string;
}) {
  const { content, loading, error, saving, configFile, save, reload } =
    useConfigFile(profilePath, configKey);

  const [editContent, setEditContent] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  // When content loads, sync to edit state
  const displayContent = editContent ?? content;

  const handleEdit = useCallback((value: string) => {
    setEditContent(value);
    // Validate JSON
    try {
      JSON.parse(value);
      setParseError(null);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Invalid JSON');
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!editContent || parseError) return;
    await save(editContent);
    setEditContent(null);
  }, [editContent, parseError, save]);

  const handleReload = useCallback(async () => {
    setEditContent(null);
    setParseError(null);
    await reload();
  }, [reload]);

  const handleReset = useCallback(() => {
    setEditContent(null);
    setParseError(null);
  }, []);

  const hasChanges = editContent !== null && editContent !== content;
  const isSensitive = configFile?.sensitive ?? false;
  const isReadOnly = configFile?.readOnly ?? false;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="admin-loading text-xs text-muted-foreground">Loading…</div>
      </div>
    );
  }

  return (
    <div className="admin-config-pane flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border/30 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-foreground/80">
            {configFile?.label ?? configKey}
          </span>
          {isSensitive && (
            <span className="text-[10px] text-amber-400/70">⚠ Contains sensitive data</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {hasChanges && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px] text-muted-foreground"
                onClick={handleReset}
              >
                Reset
              </Button>
              <Button
                variant="default"
                size="sm"
                className="h-6 bg-emerald-600 px-2.5 text-[11px] hover:bg-emerald-500"
                onClick={handleSave}
                disabled={!!parseError || saving || isReadOnly}
              >
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px] text-muted-foreground"
            onClick={handleReload}
          >
            Reload
          </Button>
        </div>
      </div>

      {/* Error bar */}
      {(error || parseError) && (
        <div className="border-b border-destructive/20 bg-destructive/5 px-4 py-1.5">
          <p className="text-[11px] text-destructive">{error || parseError}</p>
        </div>
      )}

      {/* Editor */}
      <ScrollArea className="min-h-0 flex-1">
        {content === null ? (
          <div className="flex h-full items-center justify-center py-16">
            <p className="text-xs text-muted-foreground/50">File not found</p>
          </div>
        ) : (
          <textarea
            value={displayContent ?? ''}
            onChange={(e) => handleEdit(e.target.value)}
            readOnly={isReadOnly}
            spellCheck={false}
            className={cn(
              'admin-editor w-full min-h-full resize-none bg-transparent',
              'px-4 py-3 text-[12px] leading-[1.6] text-foreground/90',
              isReadOnly && 'opacity-60 cursor-default',
            )}
            style={{ fieldSizing: 'content' } as React.CSSProperties}
          />
        )}
      </ScrollArea>
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────

const EmptyState = memo(function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-indigo-400/60"
        >
          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
          <path d="M14 2v4a2 2 0 0 0 2 2h4" />
        </svg>
      </div>
      <p className="mt-3 text-xs text-muted-foreground/50">Select a config file to view</p>
    </div>
  );
});
