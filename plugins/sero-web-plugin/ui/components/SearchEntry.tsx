// components/SearchEntry.tsx, Expandable card for a single search or fetch entry.

import { useState, useCallback } from 'react';
import { cn } from '@sero-ai/ui/lib/utils';
import { Globe, FileText, ChevronDown, ExternalLink, AlertCircle } from 'lucide-react';
import type { WebEntry, QueryInfo, UrlInfo } from '../../shared/types';
import { relativeTime, truncate, extractDomain, formatChars } from '../lib/format';
import { ProviderBadge } from './ProviderBadge';

interface SearchEntryProps {
  entry: WebEntry;
}

export function SearchEntry({ entry }: SearchEntryProps) {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((p) => !p), []);

  const isSearch = entry.type === 'search';
  const Icon = isSearch ? Globe : FileText;

  const summaryParts: string[] = [];
  if (isSearch && entry.queries) {
    const q = entry.queries;
    summaryParts.push(q.length === 1 ? q[0].query : `${q.length} queries`);
    const totalResults = q.reduce((s, x) => s + x.resultCount, 0);
    summaryParts.push(`${totalResults} sources`);
  } else if (entry.urls) {
    const u = entry.urls;
    summaryParts.push(u.length === 1 ? truncate(u[0].title || extractDomain(u[0].url), 50) : `${u.length} URLs`);
    const totalChars = u.reduce((s, x) => s + x.charCount, 0);
    if (totalChars > 0) summaryParts.push(`${formatChars(totalChars)} chars`);
  }

  const hasError = entry.queries?.some((q) => q.error) || entry.urls?.some((u) => u.error);

  return (
    <div className="animate-web-fade-in border-b border-border last:border-b-0">
      {/* Header row */}
      <button
        type="button"
        onClick={toggle}
        className={cn(
          'flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors',
          'hover:bg-secondary/50',
          expanded && 'bg-secondary/30',
        )}
      >
        <div className={cn(
          'flex size-6 shrink-0 items-center justify-center rounded-md',
          isSearch ? 'bg-blue-500/10 text-blue-400' : 'bg-amber-500/10 text-amber-400',
        )}>
          <Icon className="size-3.5" />
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate text-base font-medium text-foreground">
            {summaryParts[0] || 'Untitled'}
          </span>
          {summaryParts[1] && (
            <span className="shrink-0 text-xs text-muted-foreground">
              · {summaryParts[1]}
            </span>
          )}
          {isSearch && entry.queries?.[0]?.provider && (
            <ProviderBadge provider={entry.queries[0].provider} />
          )}
          {hasError && (
            <AlertCircle className="size-3 shrink-0 text-destructive" />
          )}
        </div>

        <span className="shrink-0 text-sm text-muted-foreground">
          {relativeTime(entry.timestamp)}
        </span>
        <ChevronDown className={cn(
          'size-3.5 shrink-0 text-muted-foreground transition-transform',
          expanded && 'rotate-180',
        )} />
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border/50 bg-secondary/20 px-3 py-2.5">
          {isSearch && entry.queries && <SearchQueryDetails queries={entry.queries} />}
          {!isSearch && entry.urls && <FetchUrlDetails urls={entry.urls} />}
        </div>
      )}
    </div>
  );
}

// ── Source link, clickable, opens in browser ───────────────

function SourceLink({ title, url, domain }: { title: string; url: string; domain: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group/link flex items-center gap-1.5 rounded-sm px-1 py-0.5 -mx-1 hover:bg-blue-500/8 transition-colors"
    >
      <ExternalLink className="size-2.5 shrink-0 text-blue-400/50 group-hover/link:text-blue-400 transition-colors" />
      <span className="truncate text-sm text-blue-400/80 group-hover/link:text-blue-400 transition-colors">
        {title || domain}
      </span>
      {title && (
        <span className="shrink-0 text-sm text-muted-foreground/40">
          {domain}
        </span>
      )}
    </a>
  );
}

// ── Search query details ────────────────────────────────────

function SearchQueryDetails({ queries }: { queries: QueryInfo[] }) {
  return (
    <div className="flex flex-col gap-3">
      {queries.map((q) => (
        <div key={`${q.provider ?? 'search'}:${q.query}`} className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground">{q.query}</span>
            {q.provider && <ProviderBadge provider={q.provider} />}
          </div>

          {q.error && (
            <span className="text-sm text-destructive">{q.error}</span>
          )}

          {q.answer && (
            <p className="rounded-md bg-card/50 px-2.5 py-2 text-sm leading-relaxed text-muted-foreground border border-border/30">
              {truncate(q.answer, 300)}
            </p>
          )}

          {q.sources.length > 0 && (
            <div className="flex flex-col gap-0.5 pl-1">
              {q.sources.slice(0, 8).map((s) => (
                <SourceLink key={s.url} title={s.title} url={s.url} domain={extractDomain(s.url)} />
              ))}
              {q.sources.length > 8 && (
                <span className="text-sm text-muted-foreground/40 pl-5">
                  +{q.sources.length - 8} more
                </span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Fetch URL details ───────────────────────────────────────

function FetchUrlDetails({ urls }: { urls: UrlInfo[] }) {
  return (
    <div className="flex flex-col gap-0.5">
      {urls.map((u) => (
        <div key={u.url} className="flex items-center gap-2">
          <a
            href={u.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group/link flex min-w-0 flex-1 items-center gap-1.5 rounded-sm px-1 py-0.5 -mx-1 hover:bg-amber-500/8 transition-colors"
          >
            <ExternalLink className="size-2.5 shrink-0 text-amber-400/50 group-hover/link:text-amber-400 transition-colors" />
            <span className="truncate text-sm text-amber-400/80 group-hover/link:text-amber-400 transition-colors">
              {u.title || extractDomain(u.url)}
            </span>
            <span className="shrink-0 text-sm text-muted-foreground/40">
              {extractDomain(u.url)}
            </span>
          </a>
          {u.error ? (
            <span className="shrink-0 text-sm text-destructive">{truncate(u.error, 30)}</span>
          ) : (
            <span className="shrink-0 text-sm text-muted-foreground/50">{formatChars(u.charCount)}</span>
          )}
        </div>
      ))}
    </div>
  );
}

export default SearchEntry;
