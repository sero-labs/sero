/**
 * Shared helpers for the context extension tools.
 */

import type { SessionManager } from '@mariozechner/pi-coding-agent';

// Locally-defined since SessionTreeNode is not exported from the SDK
interface SessionTreeNode {
  entry: { id: string };
  children: SessionTreeNode[];
  label?: string;
}

/** Names of our own tools — used to filter "internal" noise from the log */
export const INTERNAL_TOOLS = ['context_tag', 'context_log', 'context_checkout'];

export const isInternal = (name: string): boolean => INTERNAL_TOOLS.includes(name);

/**
 * Resolve a target string to a session entry ID.
 * Supports: "root", hex commit IDs, and tag names.
 */
export function resolveTargetId(sm: SessionManager, target: string): string {
  if (target.toLowerCase() === 'root') {
    const tree = sm.getTree();
    return tree.length > 0 ? tree[0].entry.id : target;
  }
  if (/^[0-9a-f]{8,}$/i.test(target)) return target;

  const find = (nodes: SessionTreeNode[]): string | null => {
    for (const n of nodes) {
      if (sm.getLabel(n.entry.id) === target) return n.entry.id;
      const r = find(n.children);
      if (r) return r;
    }
    return null;
  };

  return find(sm.getTree() as SessionTreeNode[]) || target;
}

/** Format token counts for display (e.g. 134000 → "134k") */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return Math.round(n / 1_000) + 'k';
  return n.toString();
}

/** Rough token estimate from text length */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);
