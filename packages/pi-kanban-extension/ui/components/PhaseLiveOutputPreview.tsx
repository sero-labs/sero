import type { ActivityPanelTheme } from './ActivityPanel';
import { formatLiveOutputText } from './activity-panel-log';

export function PhaseLiveOutputPreview({
  source,
  text,
  theme,
}: {
  source?: string;
  text?: string;
  theme: ActivityPanelTheme;
}) {
  if (!text?.trim()) return null;

  const formatted = formatLiveOutputText(text);
  const preview = formatted.length > 700 ? `…${formatted.slice(-700)}` : formatted;

  return (
    <div
      style={{
        padding: '8px 14px 4px',
      }}
    >
      <div
        style={{
          borderRadius: '7px',
          border: `1px solid ${theme.border}`,
          backgroundColor: 'rgba(0, 0, 0, 0.18)',
          padding: '8px 10px',
        }}
      >
        <div
          className="flex items-center gap-2"
          style={{ marginBottom: '6px' }}
        >
          <span
            style={{
              fontSize: '10px',
              fontWeight: 600,
              color: theme.primaryText,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            {source ? `${source} live output` : 'Live output'}
          </span>
          <span style={{ color: theme.primary, fontSize: '10px', animation: 'kb-pulse 1.6s ease-in-out infinite' }}>
            █
          </span>
        </div>
        <pre
          className="kb-scrollbar whitespace-pre-wrap break-words"
          style={{
            maxHeight: '132px',
            overflowY: 'auto',
            fontSize: '10px',
            lineHeight: 1.55,
            color: '#b7b9c5',
            margin: 0,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          }}
        >
          {preview}
        </pre>
      </div>
    </div>
  );
}
