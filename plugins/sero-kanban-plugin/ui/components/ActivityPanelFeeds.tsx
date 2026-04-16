import type { PlanningToolEntry } from '../../shared/types';
import { formatActivityLogLine } from './activity-panel-log';
import type { ActivityPanelTheme } from './ActivityPanel';

function toolIcon(name: string): string {
  return TOOL_ICONS[name] ?? '🔧';
}

const TOOL_ICONS: Record<string, string> = {
  read: '📖',
  bash: '📂',
  write: '✏️',
  edit: '✏️',
  ls: '📁',
  find: '🔍',
  grep: '🔎',
  glob: '🔍',
};

export function ToolFeed({
  feedRef,
  tools,
  activeColor,
  maxHeight,
  separated,
}: {
  feedRef: React.RefObject<HTMLDivElement | null>;
  tools: PlanningToolEntry[];
  activeColor: string;
  maxHeight: number;
  separated: boolean;
}) {
  return (
    <div
      ref={feedRef}
      style={{
        maxHeight: `${maxHeight}px`,
        overflowY: 'auto',
        marginTop: separated ? '8px' : 0,
        borderTop: '1px solid rgba(255, 255, 255, 0.05)',
        padding: separated ? '10px 14px 6px' : '6px 14px',
      }}
      className="kb-scrollbar"
    >
      {tools.map((entry, index) => (
        <div
          key={`${entry.tool}-${index}`}
          className="flex items-center"
          style={{ gap: '6px', padding: '2px 0' }}
        >
          <span
            style={{
              display: 'inline-block',
              width: '5px',
              height: '5px',
              borderRadius: '50%',
              backgroundColor: entry.running ? activeColor : '#34d399',
              animation: entry.running ? 'kb-pulse 1.5s ease-in-out infinite' : undefined,
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: '10px', flexShrink: 0 }}>{toolIcon(entry.tool)}</span>
          <span style={{ fontSize: '10px', fontWeight: 500, color: '#5c5e6a', flexShrink: 0 }}>
            {entry.tool}
          </span>
          {entry.args && (
            <span
              style={{
                fontSize: '10px',
                color: 'rgba(139, 141, 151, 0.6)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
              }}
            >
              {entry.args}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export function NarrativeFeed({
  feedRef,
  entries,
  theme,
  maxHeight,
  separated,
}: {
  feedRef: React.RefObject<HTMLDivElement | null>;
  entries: string[];
  theme: ActivityPanelTheme;
  maxHeight: number;
  separated: boolean;
}) {
  return (
    <div
      ref={feedRef}
      style={{
        maxHeight: `${maxHeight}px`,
        overflowY: 'auto',
        marginTop: separated ? '8px' : 0,
        borderTop: '1px solid rgba(255, 255, 255, 0.05)',
        padding: separated ? '10px 14px 4px' : '8px 14px 2px',
      }}
      className="kb-scrollbar"
    >
      {entries.map((entry, index) => (
        <NarrativeEntry key={`${entry}-${index}`} entry={entry} theme={theme} />
      ))}
    </div>
  );
}

function NarrativeEntry({
  entry,
  theme,
}: {
  entry: string;
  theme: ActivityPanelTheme;
}) {
  const formattedEntry = formatActivityLogLine(entry);
  const tone = resolveLogTone(formattedEntry);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
        padding: '0 0 6px',
      }}
    >
      <span
        style={{
          display: 'inline-block',
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          backgroundColor: tone === 'running'
            ? theme.primary
            : tone === 'success'
              ? '#34d399'
              : tone === 'error'
                ? '#f87171'
                : tone === 'warning'
                  ? '#f59e0b'
                  : 'rgba(255, 255, 255, 0.18)',
          animation: tone === 'running' ? 'kb-pulse 1.8s ease-in-out infinite' : undefined,
          flexShrink: 0,
          marginTop: '4px',
        }}
      />
      <p
        className="whitespace-pre-wrap break-words"
        style={{
          fontSize: '10px',
          lineHeight: 1.45,
          color: tone === 'success'
            ? '#86efac'
            : tone === 'error'
              ? '#fca5a5'
              : tone === 'warning'
                ? '#fcd34d'
                : tone === 'running'
                  ? theme.primaryText
                  : '#8b8d97',
          minWidth: 0,
        }}
      >
        {formattedEntry}
      </p>
    </div>
  );
}

function resolveLogTone(entry: string): 'running' | 'success' | 'error' | 'warning' | 'neutral' {
  if (entry.startsWith('🔄')) return 'running';
  if (entry.startsWith('✅')) return 'success';
  if (entry.startsWith('❌')) return 'error';
  if (entry.startsWith('⚠️')) return 'warning';
  return 'neutral';
}
