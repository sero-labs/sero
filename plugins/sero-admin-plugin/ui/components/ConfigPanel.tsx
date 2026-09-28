/**
 * ConfigPanel, config file list + JSON editor.
 *
 * Lists known Sero config files on the left, shows the selected file's
 * JSON content in an editable textarea on the right. Supports save + reload.
 */

import { useState, useEffect, useCallback, memo } from 'react';
import { TriangleAlert } from 'lucide-react';
import { cn } from '@sero-ai/ui/lib/utils';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import { ScrollArea } from '@sero-ai/ui/components/ui/scroll-area';
import { CONFIG_FILES } from '../../shared/types';
import type { ConfigFile } from '../../shared/types';
import { useConfigFile } from '../hooks/useConfigFile';
import { MemoryLoggingSettingsCard } from './MemoryLoggingSettingsCard';
import { RuntimeStateSettingsCard } from './RuntimeStateSettingsCard';

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
        <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground/50">
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
    <button type="button"
      onClick={onSelect}
      className={cn(
        'admin-sidebar-item w-full border-l-2 border-l-transparent px-3 py-2 text-left transition-colors duration-150',
        'hover:bg-secondary/50',
        isSelected && 'border-l-primary bg-secondary',
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn(
          'text-xs font-medium',
          isSelected ? 'text-foreground' : 'text-foreground/80',
        )}>
          {config.label}
        </span>
        {config.sensitive && (
          <Badge
            variant="outline"
            className="h-4 rounded border-amber-500/20 bg-amber-500/5 px-1 text-xs text-amber-400"
          >
            sensitive
          </Badge>
        )}
        {config.readOnly && (
          <Badge
            variant="outline"
            className="h-4 rounded border-muted-foreground/20 px-1 text-xs text-muted-foreground"
          >
            read-only
          </Badge>
        )}
      </div>
      <p className="mt-0.5 text-sm leading-tight text-muted-foreground/60">
        {config.description}
      </p>
    </button>
  );
});

// ── Sensitive file auth gate ───────────────────────────────

/**
 * Sensitive files (auth.json, .env) require an explicit unlock step
 * before content is revealed. This prevents accidental exposure of
 * secrets when someone glances at the screen.
 */
function SensitiveAuthGate({
  label,
  onUnlock,
}: {
  label: string;
  onUnlock: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <div className="flex size-12 items-center justify-center rounded-xl bg-amber-500/10">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-amber-400/70"
        >
          <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>
      <div className="text-center">
        <p className="text-base font-medium text-foreground/80">{label}</p>
        <p className="mt-1 text-sm text-muted-foreground/60">
          This file contains sensitive data (API keys, tokens).
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="border-amber-500/30 text-xs text-amber-400 hover:bg-amber-500/10"
        onClick={onUnlock}
      >
        Reveal contents
      </Button>
    </div>
  );
}

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
  const [sensitiveUnlocked, setSensitiveUnlocked] = useState(false);

  // Reset edit state AND re-lock sensitive files when switching configs
  useEffect(() => {
    setEditContent(null);
    setParseError(null);
    setSensitiveUnlocked(false);
  }, [configKey]);

  const displayContent = editContent ?? content;

  const isJsonFile = configFile?.relativePath.endsWith('.json') ?? true;
  const isSensitive = configFile?.sensitive ?? false;
  const isReadOnly = configFile?.readOnly ?? false;

  const handleEdit = useCallback((value: string) => {
    setEditContent(value);
    // Validate JSON (skip for non-JSON files like .env)
    if (isJsonFile) {
      try {
        JSON.parse(value);
        setParseError(null);
      } catch (err) {
        setParseError(err instanceof Error ? err.message : 'Invalid JSON');
      }
    } else {
      setParseError(null);
    }
  }, [isJsonFile]);

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

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="admin-loading text-xs text-muted-foreground">Loading…</div>
      </div>
    );
  }

  // Gate sensitive files behind an explicit unlock
  if (isSensitive && !sensitiveUnlocked) {
    return (
      <SensitiveAuthGate
        label={configFile?.label ?? configKey}
        onUnlock={() => setSensitiveUnlocked(true)}
      />
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
            <span className="inline-flex items-center gap-1 text-sm text-amber-400/70">
              <TriangleAlert className="size-3" />
              Contains sensitive data
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {isSensitive && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-sm text-amber-400/70"
              onClick={() => setSensitiveUnlocked(false)}
            >
              Lock
            </Button>
          )}
          {hasChanges && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-sm text-muted-foreground"
                onClick={handleReset}
              >
                Reset
              </Button>
              <Button
                variant="default"
                size="sm"
                className="h-6 bg-primary px-2.5 text-sm hover:bg-primary/90"
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
            className="h-6 px-2 text-sm text-muted-foreground"
            onClick={handleReload}
          >
            Reload
          </Button>
        </div>
      </div>

      {/* Error bar */}
      {(error || parseError) && (
        <div className="border-b border-destructive/20 bg-destructive/5 px-4 py-1.5">
          <p className="text-sm text-destructive">{error || parseError}</p>
        </div>
      )}

      {/* Editor */}
      <ScrollArea className="min-h-0 flex-1 [&>[data-slot=scroll-area-viewport]>div]:!block">
        {content === null ? (
          <div className="flex h-full items-center justify-center py-16">
            <p className="text-xs text-muted-foreground/50">File not found</p>
          </div>
        ) : (
          <>
            {configKey === 'settings' ? (
              <>
                <RuntimeStateSettingsCard disabled={isReadOnly} />
                {displayContent !== null ? (
                  <MemoryLoggingSettingsCard
                    rawSettings={displayContent}
                    profilePath={profilePath}
                    onChange={handleEdit}
                    disabled={isReadOnly}
                  />
                ) : null}
              </>
            ) : null}
            <textarea aria-label="Config JSON"
              value={displayContent ?? ''}
              onChange={(e) => handleEdit(e.target.value)}
              readOnly={isReadOnly}
              spellCheck={false}
              className={cn(
                'admin-editor w-full min-h-full resize-none bg-transparent',
                'px-4 py-3 text-base leading-[1.6] text-foreground/90',
                isReadOnly && 'opacity-60 cursor-default',
              )}
              // fieldSizing: 'content' is Chromium-only (Chrome 123+), fine for Electron
              style={{ fieldSizing: 'content' } as React.CSSProperties}
            />
          </>
        )}
      </ScrollArea>
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────

const EmptyState = memo(function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-primary/60"
        >
          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
          <path d="M14 2v4a2 2 0 0 0 2 2h4" />
        </svg>
      </div>
      <p className="mt-3 text-xs text-muted-foreground/50">Select a config file to view</p>
    </div>
  );
});
