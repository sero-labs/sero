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
import { useAppStore, type Theme } from '@/stores/app';

interface TerminalPanelProps {
  terminalId: string;
  /** Whether this terminal is the currently visible tab. */
  isActive: boolean;
}

/** xterm.js themes keyed by app theme. */
const TERMINAL_THEMES: Record<Theme, Record<string, string>> = {
  dark: {
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
  },
  light: {
    background: '#ffffff',
    foreground: '#1e1e1e',
    cursor: '#1e1e1e',
    selectionBackground: '#add6ff',
    black: '#1e1e1e',
    red: '#cd3131',
    green: '#008000',
    yellow: '#795e26',
    blue: '#0451a5',
    magenta: '#bc05bc',
    cyan: '#0598bc',
    white: '#6a737d',
    brightBlack: '#6a737d',
    brightRed: '#cd3131',
    brightGreen: '#008000',
    brightYellow: '#795e26',
    brightBlue: '#0451a5',
    brightMagenta: '#bc05bc',
    brightCyan: '#0598bc',
    brightWhite: '#1e1e1e',
  },
};

/**
 * Single terminal instance — mounts xterm.js and bridges IPC.
 * Replays buffered output on mount so content survives workspace switches.
 */
export function TerminalPanel({ terminalId, isActive }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  // Set up terminal on mount, replay buffered content
  useEffect(() => {
    if (!containerRef.current) return;

    const initialTheme = useAppStore.getState().theme;
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily:
        "'JetBrains Mono', 'SF Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
      lineHeight: 1.2,
      scrollback: 10000,
      theme: TERMINAL_THEMES[initialTheme],
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
    let active = true;
    let unsubscribeData: (() => void) | null = null;
    void replayAndSubscribe(term, terminalId, (unsubscribe) => {
      if (!active) {
        unsubscribe();
        return;
      }
      unsubscribeData = unsubscribe;
    });

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
      active = false;
      unsubscribeData?.();
      unsubscribeData = null;
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [terminalId]);

  // React to theme changes
  useEffect(() => {
    let prevTheme = useAppStore.getState().theme;
    const unsub = useAppStore.subscribe((state) => {
      if (state.theme !== prevTheme) {
        prevTheme = state.theme;
        if (termRef.current) {
          termRef.current.options.theme = TERMINAL_THEMES[state.theme];
        }
      }
    });
    return unsub;
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
  onSubscribe: (unsubscribe: () => void) => void,
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
  onSubscribe(unsub);
}
