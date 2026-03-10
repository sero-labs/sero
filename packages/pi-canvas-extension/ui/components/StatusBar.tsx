/**
 * StatusBar — bottom bar showing document stats.
 */

import { memo, useMemo } from 'react';

interface StatusBarProps {
  content: string;
  type: 'text' | 'code';
  language: string;
}

function countStats(content: string, type: 'text' | 'code') {
  const chars = content.length;
  const lines = content ? content.split('\n').length : 0;
  if (type === 'code') {
    return { chars, lines, label: `${lines} lines · ${chars} chars` };
  }
  const words = content.trim() ? content.trim().split(/\s+/).length : 0;
  return { chars, lines, words, label: `${words} words · ${chars} chars · ${lines} lines` };
}

export const StatusBar = memo(function StatusBar({ content, type, language }: StatusBarProps) {
  const stats = useMemo(() => countStats(content, type), [content, type]);

  return (
    <div className="flex items-center justify-between border-t border-border/20 px-4 py-1.5">
      <span className="text-[10px] text-muted-foreground/40">
        {stats.label}
      </span>
      <span className="text-[10px] text-muted-foreground/30">
        {language}
      </span>
    </div>
  );
});
