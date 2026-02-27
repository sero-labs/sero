/**
 * MailThread — expanded email thread view.
 *
 * Renders HTML emails in sandboxed iframes that auto-resize.
 * Falls back to plain text when no HTML body is available.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { GmailMessage } from '../../shared/types';
import { formatRelativeDate, extractName } from './format-utils';

interface MailThreadProps {
  messages: GmailMessage[];
  onBack: () => void;
}

export function MailThread({ messages, onBack }: MailThreadProps) {
  const subject = messages[0]?.subject || '(no subject)';

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Thread header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] px-3 py-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
        >
          <ChevronLeft className="size-3.5" />
          Back
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[13px] font-medium text-[var(--text-primary)]">
            {subject}
          </h2>
          <span className="text-[10px] text-[var(--text-muted)]">
            {messages.length} message{messages.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Messages — single message fills space, multi-message scrolls list */}
      {messages.length === 1 ? (
        <SingleMessage message={messages[0]} />
      ) : (
        <div className="flex-1 space-y-1 overflow-y-auto p-2">
          {messages.map((msg, i) => (
            <MessageCard
              key={msg.id}
              message={msg}
              defaultExpanded={i === messages.length - 1}
              index={i}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Single message (fills space, content scrolls) ────────────

function SingleMessage({ message }: { message: GmailMessage }) {
  const senderName = extractName(message.from);
  const senderInitial = senderName.charAt(0).toUpperCase() || '?';

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Sender header — pinned */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] px-3 py-2">
        <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-[10px] font-semibold text-blue-400">
          {senderInitial}
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-[12px] font-medium text-[var(--text-primary)]">{senderName}</span>
          <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
            <span className="truncate">{message.from}</span>
            {message.to && <><span>→</span><span className="truncate">{message.to}</span></>}
          </div>
        </div>
        <span className="shrink-0 text-[10px] text-[var(--text-muted)]">
          {formatRelativeDate(message.date)}
        </span>
      </div>

      {/* Body — fills remaining space */}
      <div className="flex-1 overflow-hidden">
        {message.bodyHtml ? (
          <HtmlBody html={message.bodyHtml} fill />
        ) : (
          <div className="h-full overflow-y-auto px-3 py-2 whitespace-pre-wrap text-[12px] leading-relaxed text-[var(--text-secondary)]">
            {message.body || message.snippet || '(empty)'}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Collapsible message card (multi-message threads) ─────────

function MessageCard({
  message,
  defaultExpanded,
  index,
}: {
  message: GmailMessage;
  defaultExpanded: boolean;
  index: number;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const senderName = extractName(message.from);
  const senderInitial = senderName.charAt(0).toUpperCase() || '?';

  return (
    <div
      className="animate-g-fade-in overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50"
      style={{ animationDelay: `${index * 30}ms` }}
    >
      {/* Header bar */}
      <button
        onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-[var(--bg-elevated)]/80"
      >
        <ChevronRight
          className={`size-3.5 shrink-0 text-[var(--text-muted)] transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
        />
        <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-[10px] font-semibold text-blue-400">
          {senderInitial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-[12px] font-medium text-[var(--text-primary)]">
              {senderName}
            </span>
            <span className="ml-auto shrink-0 text-[10px] text-[var(--text-muted)]">
              {formatRelativeDate(message.date)}
            </span>
          </div>
          {!expanded && message.snippet && (
            <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">
              {message.snippet}
            </p>
          )}
        </div>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-[var(--border-subtle)]">
          {/* Meta line */}
          <div className="flex items-center gap-3 px-3 py-1.5 text-[10px] text-[var(--text-muted)]">
            <span className="truncate">{message.from}</span>
            {message.to && (
              <>
                <span className="shrink-0">→</span>
                <span className="truncate">{message.to}</span>
              </>
            )}
          </div>
          {/* Body */}
          {message.bodyHtml ? (
            <HtmlBody html={message.bodyHtml} />
          ) : (
            <div className="px-3 py-2 whitespace-pre-wrap text-[12px] leading-relaxed text-[var(--text-secondary)]">
              {message.body || message.snippet || '(empty)'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── HTML email renderer (sandboxed iframe) ───────────────────

const EMAIL_STYLES = `
  body {
    margin: 0; padding: 12px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px; line-height: 1.5;
    color: #e0e0e0; background: transparent;
    word-break: break-word;
  }
  a { color: #60a5fa; }
  img { max-width: 100%; height: auto; }
  table { max-width: 100% !important; }
  * { max-width: 100% !important; box-sizing: border-box; }
`;

/**
 * HtmlBody — renders HTML email in a sandboxed iframe.
 * fill=true: 100% height, content scrolls inside iframe.
 * fill=false: auto-sizes to content height (for multi-message cards).
 */
function HtmlBody({ html, fill = false }: { html: string; fill?: boolean }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(200);

  const writeContent = useCallback((iframe: HTMLIFrameElement) => {
    const doc = iframe.contentDocument;
    if (!doc) return;
    const overflow = fill ? 'overflow-y: auto; overflow-x: hidden;' : 'overflow: hidden;';
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${EMAIL_STYLES} body { ${overflow} }</style>
</head><body>${html}</body></html>`);
    doc.close();

    if (!fill) {
      // Auto-size: measure after images load
      const resize = () => {
        const h = doc.body?.scrollHeight ?? 0;
        if (h > 0) setHeight(Math.min(h + 16, 2000));
      };
      const imgs = doc.querySelectorAll('img');
      let pending = imgs.length;
      if (pending === 0) { resize(); return; }
      imgs.forEach((img) => {
        if (img.complete) { pending--; if (!pending) resize(); }
        else { img.onload = img.onerror = () => { pending--; if (!pending) resize(); }; }
      });
      resize();
    }
  }, [html, fill]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (iframe) writeContent(iframe);
  }, [writeContent]);

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-same-origin"
      title="Email content"
      style={{
        width: '100%',
        height: fill ? '100%' : height,
        border: 'none',
        display: 'block',
      }}
    />
  );
}
