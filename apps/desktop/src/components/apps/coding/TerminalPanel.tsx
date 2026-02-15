/**
 * TerminalPanel — xterm.js terminal connected to a workspace container.
 *
 * Each instance represents a single terminal session. Uses @xterm/xterm
 * with fit and web-links addons. Data flows:
 *   xterm.js → IPC (terminal:write) → node-pty → container exec
 *   container exec → node-pty → IPC (terminal:data) → xterm.js
 *
 * On remount (e.g. after workspace switch), the component requests the
 * buffered output from the main process and replays it into xterm.js
 * so the terminal looks exactly as it did before.
 */

import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

interface TerminalPanelProps {
  terminalId: string;
  /** Whether this terminal is the currently visible tab. */
  isActive: boolean;
}

/** Shared xterm.js theme — dark to match the shell. */
const TERMINAL_THEME = {
  background: '#0a0a0b',
  foreground: '#d4d4d8',
  cursor: '#d4d4d8',
  selectionBackground: '#3f3f46',
  black: '#18181b',
  red: '#ef4444',
  green: '#22c55e',
  yellow: '#eab308',
  blue: '#3b82f6',
  magenta: '#a855f7',
  cyan: '#06b6d4',
  white: '#d4d4d8',
  brightBlack: '#52525b',
  brightRed: '#f87171',
  brightGreen: '#4ade80',
  brightYellow: '#facc15',
  brightBlue: '#60a5fa',
  brightMagenta: '#c084fc',
  brightCyan: '#22d3ee',
  brightWhite: '#fafafa',
} as const;

/**
 * Single terminal instance — mounts xterm.js and bridges IPC.
 * Replays buffered output on mount so content survives workspace switches.
 */
export function TerminalPanel({ terminalId, isActive }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const unsubDataRef = useRef<(() => void) | null>(null);

  // Set up terminal on mount, replay buffered content
  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily:
        "'JetBrains Mono', 'SF Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
      lineHeight: 1.2,
      scrollback: 10000,
      theme: TERMINAL_THEME,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(containerRef.current);

    termRef.current = term;
    fitRef.current = fitAddon;

    // Initial fit
    try {
      fitAddon.fit();
    } catch {
      /* container may not be visible yet */
    }

    // Replay buffered output from the main process, then subscribe to live data.
    // This ensures content persists across workspace switches.
    replayAndSubscribe(term, terminalId, unsubDataRef);

    // Forward user input to the main process
    term.onData((data) => {
      window.sero.terminal.write(terminalId, data);
    });

    // Send terminal dimensions to main process
    try {
      window.sero.terminal.resize(terminalId, term.cols, term.rows);
    } catch {
      /* terminal may not be created yet */
    }

    return () => {
      unsubDataRef.current?.();
      unsubDataRef.current = null;
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [terminalId]);

  // Re-fit when terminal becomes active or container resizes
  useEffect(() => {
    if (!isActive || !fitRef.current || !termRef.current) return;

    const timer = setTimeout(() => {
      try {
        fitRef.current?.fit();
        if (termRef.current) {
          window.sero.terminal.resize(
            terminalId,
            termRef.current.cols,
            termRef.current.rows,
          );
        }
      } catch {
        /* safe to ignore */
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [isActive, terminalId]);

  // ResizeObserver for container size changes
  useEffect(() => {
    if (!containerRef.current || !fitRef.current) return;

    const observer = new ResizeObserver(() => {
      if (!isActive) return;
      try {
        fitRef.current?.fit();
        if (termRef.current) {
          window.sero.terminal.resize(
            terminalId,
            termRef.current.cols,
            termRef.current.rows,
          );
        }
      } catch {
        /* safe to ignore */
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [isActive, terminalId]);

  // Focus terminal when it becomes active
  useEffect(() => {
    if (isActive && termRef.current) {
      termRef.current.focus();
    }
  }, [isActive]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ display: isActive ? 'block' : 'none' }}
    />
  );
}

// ── Helpers ──────────────────────────────────────────────────

/**
 * Replay buffered output into the terminal, then subscribe to live data.
 * Ordering: replay first → subscribe second ensures no gap or duplicates.
 */
async function replayAndSubscribe(
  term: Terminal,
  terminalId: string,
  unsubRef: React.MutableRefObject<(() => void) | null>,
): Promise<void> {
  try {
    const buffer = await window.sero.terminal.replay(terminalId);
    // Guard against component unmounting during the await
    if (!term.element) return;
    if (buffer) {
      term.write(buffer);
    }
  } catch {
    /* terminal may not exist yet — fresh terminal */
  }

  // Now subscribe to live data (after replay so nothing is missed)
  const unsub = window.sero.terminal.onData((tid, data) => {
    if (tid === terminalId) {
      term.write(data);
    }
  });
  unsubRef.current = unsub;
}
