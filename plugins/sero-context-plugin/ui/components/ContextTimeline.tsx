/**
 * ContextTimeline — vertical timeline visualising the context graph.
 *
 * Shows entries as nodes on a vertical line with role-based icons,
 * tag badges, HEAD indicator, and hidden-message gaps.
 */

import { useState, useCallback } from 'react';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import { Button } from '@sero-ai/ui/components/ui/button';
import { cn } from '@sero-ai/ui/lib/utils';
import type { ContextNode, NodeRole } from '../../shared/types';

interface Props {
  nodes: ContextNode[];
  onCheckout: (target: string) => void;
  onTag: (name: string) => void;
}

// ── Role styling ──────────────────────────────────────────────

const ROLE_CONFIG: Record<NodeRole, { icon: string; color: string; bg: string }> = {
  user: { icon: '●', color: 'text-indigo-400', bg: 'bg-indigo-500/20' },
  ai: { icon: '◆', color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
  tool: { icon: '◇', color: 'text-amber-400', bg: 'bg-amber-500/20' },
  bash: { icon: '$', color: 'text-orange-400', bg: 'bg-orange-500/20' },
  summary: { icon: '≡', color: 'text-purple-400', bg: 'bg-purple-500/20' },
};

const ROLE_LABEL: Record<NodeRole, string> = {
  user: 'USER',
  ai: 'AI',
  tool: 'TOOL',
  bash: 'BASH',
  summary: 'SUMMARY',
};

// ── Component ─────────────────────────────────────────────────

export function ContextTimeline({ nodes, onCheckout, onTag }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  if (nodes.length === 0) {
    return (
      <div className="py-8 text-center text-xs text-muted-foreground">
        No entries to display.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0">
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Context Graph
      </h2>

      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />

        {nodes.map((node, idx) => (
          <TimelineNode
            key={node.id}
            node={node}
            isLast={idx === nodes.length - 1}
            isExpanded={expandedId === node.id}
            onToggle={() => toggleExpand(node.id)}
            onCheckout={onCheckout}
            onTag={onTag}
          />
        ))}
      </div>
    </div>
  );
}

// ── Timeline Node ─────────────────────────────────────────────

function TimelineNode({
  node,
  isLast,
  isExpanded,
  onToggle,
  onCheckout,
  onTag,
}: {
  node: ContextNode;
  isLast: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onCheckout: (target: string) => void;
  onTag: (name: string) => void;
}) {
  const role = ROLE_CONFIG[node.role];
  const [tagInput, setTagInput] = useState('');

  return (
    <>
      {/* Hidden messages gap */}
      {node.hiddenBefore > 0 && (
        <div className="flex items-center gap-2 py-1 pl-[7px]">
          <div className="flex h-[9px] w-[9px] items-center justify-center">
            <span className="text-[8px] text-muted-foreground/50">⋮</span>
          </div>
          <span className="text-[10px] italic text-muted-foreground/50">
            {node.hiddenBefore} hidden
          </span>
        </div>
      )}

      {/* Node */}
      <div
        className={cn(
          'group relative flex items-start gap-2.5 rounded-md py-1.5 pl-0 pr-2 transition-colors',
          isExpanded && 'bg-secondary/50',
        )}
      >
        {/* Dot */}
        <div className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center">
          {node.isHead ? (
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.4)]">
              <span className="text-[9px] font-bold text-white">H</span>
            </div>
          ) : (
            <div
              className={cn(
                'flex h-4 w-4 items-center justify-center rounded-full',
                node.label ? role.bg : 'bg-background',
                node.label ? '' : 'border border-border',
              )}
            >
              <span className={cn('text-[10px]', role.color)}>{role.icon}</span>
            </div>
          )}
        </div>

        {/* Content */}
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
        >
          {/* Top line: role + tags + id */}
          <div className="flex items-center gap-1.5">
            <span className={cn('text-[10px] font-medium', role.color)}>
              {ROLE_LABEL[node.role]}
            </span>

            {node.isRoot && (
              <Badge variant="outline" className="h-4 px-1 text-[9px] font-normal">
                ROOT
              </Badge>
            )}
            {node.isHead && (
              <Badge className="h-4 bg-indigo-500/20 px-1 text-[9px] font-normal text-indigo-400 hover:bg-indigo-500/30">
                HEAD
              </Badge>
            )}
            {node.label && (
              <Badge variant="secondary" className="h-4 px-1.5 text-[9px] font-mono">
                🏷 {node.label}
              </Badge>
            )}
            {node.isBranchPoint && (
              <Badge variant="outline" className="h-4 px-1 text-[9px] font-normal text-amber-400">
                ⑂
              </Badge>
            )}

            <span className="ml-auto font-mono text-[9px] text-muted-foreground/40">
              {node.id.slice(0, 8)}
            </span>
          </div>

          {/* Content preview */}
          {node.content && (
            <p className="text-xs leading-snug text-muted-foreground">
              {node.content}
            </p>
          )}
        </button>
      </div>

      {/* Expanded actions */}
      {isExpanded && (
        <div className="mb-1 ml-8 flex flex-col gap-2 rounded-md bg-secondary/30 p-2.5">
          <div className="flex items-center gap-1.5">
            <Button
              size="xs"
              variant="outline"
              className="h-6 text-[10px]"
              onClick={() => {
                const target = node.label || node.id;
                onCheckout(target);
              }}
            >
              Ask agent to checkout
            </Button>

            {!node.label && (
              <form
                className="flex items-center gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = tagInput.trim();
                  if (name) {
                    onTag(name);
                    setTagInput('');
                  }
                }}
              >
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="tag name…"
                  className="h-6 w-24 rounded border border-input bg-background px-1.5 text-[10px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <Button
                  size="xs"
                  variant="ghost"
                  className="h-6 text-[10px]"
                  type="submit"
                  disabled={!tagInput.trim()}
                >
                  Ask agent to tag
                </Button>
              </form>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground/60">
            Prompt-routed via the agent — not a direct UI command.
          </span>
          <span className="font-mono text-[9px] text-muted-foreground/40">
            ID: {node.id}
          </span>
        </div>
      )}
    </>
  );
}
