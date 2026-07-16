/**
 * By Provider · Model breakdown — expandable provider rows carrying
 * aggregate values, with per-model rows beneath (default expanded).
 */

import { memo, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from '@sero-ai/ui';
import { ChevronDown, ChevronRight } from 'lucide-react';

import { formatCost, formatCount, formatTokens } from '../../shared/format';
import type { ModelStats, ProviderStats, TokenBreakdown } from '../../shared/types';

interface NumericColumn {
  label: string;
  dimmed?: boolean;
  value: (stats: { sessions: number; messages: number; cost: number; tokens: TokenBreakdown }) => string;
}

const COLUMNS: NumericColumn[] = [
  { label: 'Sessions', value: (s) => formatCount(s.sessions) },
  { label: 'Msgs', value: (s) => formatCount(s.messages) },
  { label: 'Cost', value: (s) => formatCost(s.cost) },
  { label: 'Tokens', value: (s) => formatTokens(s.tokens.total) },
  { label: '↑ In', dimmed: true, value: (s) => formatTokens(s.tokens.input + s.tokens.cacheWrite) },
  { label: '↓ Out', dimmed: true, value: (s) => formatTokens(s.tokens.output) },
  { label: 'Cache', dimmed: true, value: (s) => formatTokens(s.tokens.cacheRead + s.tokens.cacheWrite) },
];

function NumericCells({ stats, dimAll }: { stats: ProviderStats | ModelStats; dimAll?: boolean }) {
  return (
    <>
      {COLUMNS.map((column) => (
        <TableCell
          key={column.label}
          className={cn('text-right tabular-nums', (column.dimmed || dimAll) && 'text-muted-foreground')}
        >
          {column.value(stats)}
        </TableCell>
      ))}
    </>
  );
}

export const ProviderTable = memo(function ProviderTable({ providers }: { providers: ProviderStats[] }) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  const toggle = (provider: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(provider)) {
        next.delete(provider);
      } else {
        next.add(provider);
      }
      return next;
    });
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Provider / Model</TableHead>
            {COLUMNS.map((column) => (
              <TableHead
                key={column.label}
                className={cn('text-right', column.dimmed && 'text-muted-foreground/70')}
              >
                {column.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {providers.map((provider) => {
            const isCollapsed = collapsed.has(provider.provider);
            const Chevron = isCollapsed ? ChevronRight : ChevronDown;
            return [
              <TableRow key={provider.provider}>
                <TableCell>
                  <button
                    type="button"
                    onClick={() => toggle(provider.provider)}
                    className="flex items-center gap-1.5 font-medium hover:text-foreground"
                    aria-expanded={!isCollapsed}
                  >
                    <Chevron className="size-3.5 text-muted-foreground" aria-hidden />
                    {provider.provider}
                  </button>
                </TableCell>
                <NumericCells stats={provider} />
              </TableRow>,
              ...(isCollapsed
                ? []
                : provider.models.map((model) => (
                    <TableRow key={`${provider.provider}/${model.model}`} className="hover:bg-transparent">
                      <TableCell className="pl-9 text-muted-foreground">{model.model}</TableCell>
                      <NumericCells stats={model} dimAll />
                    </TableRow>
                  ))),
            ];
          })}
        </TableBody>
      </Table>
    </div>
  );
});
