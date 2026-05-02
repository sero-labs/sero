import { useMemo } from 'react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@sero-ai/ui/components/ui/card';
import { Input } from '@sero-ai/ui/components/ui/input';
import { Label } from '@sero-ai/ui/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sero-ai/ui/components/ui/select';
import { getSero } from '../hooks/host';

const DEFAULTS = {
  maxBytesPerFile: 2 * 1024 * 1024,
  maxFilesPerDay: 3,
  retentionDays: 14,
  maxPayloadChars: 4_096,
};

interface MemoryLoggingSettingsCardProps {
  rawSettings: string;
  profilePath: string | null;
  onChange: (next: string) => void;
  disabled?: boolean;
}

type LoggingKey = keyof typeof DEFAULTS;
type MemoryLogPreset = 'minimal' | 'default' | 'verbose-retention';

const PRESETS: Record<MemoryLogPreset, typeof DEFAULTS> = {
  minimal: {
    maxBytesPerFile: 512 * 1024,
    maxFilesPerDay: 2,
    retentionDays: 7,
    maxPayloadChars: 1024,
  },
  default: DEFAULTS,
  'verbose-retention': {
    maxBytesPerFile: 5 * 1024 * 1024,
    maxFilesPerDay: 5,
    retentionDays: 30,
    maxPayloadChars: 12_000,
  },
};

function getObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : fallback;
}

function getDraftValues(rawSettings: string): Record<LoggingKey, number> | null {
  try {
    const parsed = JSON.parse(rawSettings) as Record<string, unknown>;
    const sero = getObject(parsed.sero);
    const memory = getObject(sero.memory);
    const logging = getObject(memory.logging);
    return {
      maxBytesPerFile: normalizePositiveInteger(logging.maxBytesPerFile, DEFAULTS.maxBytesPerFile),
      maxFilesPerDay: normalizePositiveInteger(logging.maxFilesPerDay, DEFAULTS.maxFilesPerDay),
      retentionDays: normalizePositiveInteger(logging.retentionDays, DEFAULTS.retentionDays),
      maxPayloadChars: normalizePositiveInteger(logging.maxPayloadChars, DEFAULTS.maxPayloadChars),
    };
  } catch {
    return null;
  }
}

function updateSettings(rawSettings: string, updates: Partial<Record<LoggingKey, number>>): string | null {
  try {
    const parsed = JSON.parse(rawSettings) as Record<string, unknown>;
    const sero = getObject(parsed.sero);
    const memory = getObject(sero.memory);
    const logging = getObject(memory.logging);

    const next = {
      ...parsed,
      sero: {
        ...sero,
        memory: {
          ...memory,
          logging: {
            ...DEFAULTS,
            ...logging,
            ...updates,
          },
        },
      },
    };

    return `${JSON.stringify(next, null, 2)}\n`;
  } catch {
    return null;
  }
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes % (1024 * 1024) === 0 ? 0 : 1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(bytes % 1024 === 0 ? 0 : 1)} KB`;
  return `${bytes} B`;
}

function NumberField({
  id,
  label,
  hint,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: number;
  disabled?: boolean;
  onChange: (next: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-[11px] font-medium text-foreground/80">{label}</Label>
      <Input
        id={id}
        type="number"
        min={1}
        step={1}
        value={String(value)}
        disabled={disabled}
        onChange={(event) => {
          const next = Number.parseInt(event.target.value, 10);
          if (Number.isFinite(next) && next > 0) onChange(next);
        }}
        className="h-8 text-xs"
      />
      <p className="text-[11px] text-muted-foreground/65">{hint}</p>
    </div>
  );
}

export function MemoryLoggingSettingsCard({
  rawSettings,
  profilePath,
  onChange,
  disabled = false,
}: MemoryLoggingSettingsCardProps) {
  const values = useMemo(() => getDraftValues(rawSettings), [rawSettings]);
  const logDirPath = profilePath ? `${profilePath}/debug/memory` : null;

  const applyUpdate = (updates: Partial<Record<LoggingKey, number>>) => {
    const next = updateSettings(rawSettings, updates);
    if (next) onChange(next);
  };

  const applyPreset = (preset: MemoryLogPreset) => {
    applyUpdate(PRESETS[preset]);
  };

  const revealLogFolder = async () => {
    if (!logDirPath) return;
    await getSero().shell.showItemInFolder(logDirPath);
  };

  return (
    <Card className="mx-4 mt-4 border-border/40 bg-background/70">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm">Memory log policy</CardTitle>
            <CardDescription className="mt-1 text-xs">
              Convenience controls for <code>sero.memory.logging</code> in <code>settings.json</code>.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {logDirPath ? (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={() => void revealLogFolder()}
              >
                Open log folder
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px]"
              disabled={disabled || values === null}
              onClick={() => applyUpdate(DEFAULTS)}
            >
              Reset defaults
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {values === null ? (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-400">
            Fix JSON errors in <code>settings.json</code> to use the structured memory logging controls.
          </div>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
              <div className="space-y-1.5">
                <Label htmlFor="memory-log-preset" className="text-[11px] font-medium text-foreground/80">
                  Preset
                </Label>
                <Select onValueChange={(value) => applyPreset(value as MemoryLogPreset)}>
                  <SelectTrigger id="memory-log-preset" className="h-8 w-full text-xs">
                    <SelectValue placeholder="Apply a preset" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minimal">Minimal</SelectItem>
                    <SelectItem value="default">Default</SelectItem>
                    <SelectItem value="verbose-retention">Verbose retention</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground/65">
                  Quick presets for low disk usage, balanced defaults, or longer retained history.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <NumberField
                id="memory-log-max-bytes"
                label="Max bytes per file"
                hint={`Current: ${formatBytes(values.maxBytesPerFile)}`}
                value={values.maxBytesPerFile}
                disabled={disabled}
                onChange={(next) => applyUpdate({ maxBytesPerFile: next })}
              />
              <NumberField
                id="memory-log-max-files"
                label="Rotated files per day"
                hint="Keeps the active daily log plus numbered backups"
                value={values.maxFilesPerDay}
                disabled={disabled}
                onChange={(next) => applyUpdate({ maxFilesPerDay: next })}
              />
              <NumberField
                id="memory-log-retention"
                label="Retention days"
                hint="Older daily log files are pruned automatically"
                value={values.retentionDays}
                disabled={disabled}
                onChange={(next) => applyUpdate({ retentionDays: next })}
              />
              <NumberField
                id="memory-log-payload"
                label="Max payload chars"
                hint="Large JSON payloads are truncated before writing"
                value={values.maxPayloadChars}
                disabled={disabled}
                onChange={(next) => applyUpdate({ maxPayloadChars: next })}
              />
              </div>
            </div>

            <div className="rounded-lg border border-border/40 bg-secondary/20 px-3 py-2 text-[11px] text-muted-foreground/75">
              Logs are written to <code>~/.sero-ui/debug/memory/YYYY-MM-DD.log</code> with per-day rotation.
              {logDirPath ? (
                <span> Current profile path: <code>{logDirPath}</code>.</span>
              ) : null}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
