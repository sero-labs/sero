import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import './TerminalPanel.css';

interface Props {
  projectId: string;
  panelId: string;
  terminalId: string;
}

const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 2000;

export function TerminalPanel({ projectId, panelId, terminalId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;
    let terminal: Terminal | null = null;
    let fitAddon: FitAddon | null = null;
    let inputDisposable: { dispose(): void } | null = null;
    let resizeDisposable: { dispose(): void } | null = null;
    let outputCleanup: (() => void) | null = null;
    let resizeObserver: ResizeObserver | null = null;

    function initTerminal() {
      // Wait until the element has actual rendered dimensions
      if (el!.clientWidth === 0 || el!.clientHeight === 0) {
        if (!cancelled) requestAnimationFrame(initTerminal);
        return;
      }

      terminal = new Terminal({
        theme: {
          background: '#111113',
          foreground: '#e4e4e7',
          cursor: '#6366f1',
          cursorAccent: '#111113',
          selectionBackground: '#6366f133',
          black: '#27272a',
          red: '#ef4444',
          green: '#22c55e',
          yellow: '#f59e0b',
          blue: '#3b82f6',
          magenta: '#a855f7',
          cyan: '#06b6d4',
          white: '#e4e4e7',
          brightBlack: '#71717a',
          brightRed: '#f87171',
          brightGreen: '#4ade80',
          brightYellow: '#fbbf24',
          brightBlue: '#60a5fa',
          brightMagenta: '#c084fc',
          brightCyan: '#22d3ee',
          brightWhite: '#fafafa',
        },
        fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', monospace",
        fontSize: 13,
        lineHeight: 1.4,
        cursorBlink: true,
        cursorStyle: 'bar',
        scrollback: 10000,
        allowProposedApi: true,
      });

      fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.loadAddon(new WebLinksAddon());

      terminal.open(el!);
      terminalRef.current = terminal;

      // Initial fit
      try {
        fitAddon.fit();
      } catch {
        // Fit can fail if dimensions are still settling
      }

      // Focus the terminal so it accepts keyboard input
      terminal.focus();

      // Forward user keystrokes → container PTY
      inputDisposable = terminal.onData((data) => {
        window.sero.terminal.write(terminalId, data);
      });

      // Receive PTY output → xterm.js
      outputCleanup = window.sero.terminal.onData((tid, data) => {
        if (tid === terminalId && terminal) {
          terminal.write(data);
        }
      });

      // Sync resize: xterm.js → node-pty
      resizeDisposable = terminal.onResize(({ cols, rows }) => {
        window.sero.terminal.resize(terminalId, cols, rows);
      });

      // Refit when panel is resized
      resizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(() => {
          try {
            fitAddon?.fit();
          } catch {
            // ignore
          }
        });
      });
      resizeObserver.observe(el!);

      // Re-focus terminal when the panel is clicked
      el!.addEventListener('click', () => terminal?.focus());

      // Connect to the container with retry
      connectWithRetry(terminal);
    }

    async function connectWithRetry(term: Terminal) {
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        if (cancelled) return;
        try {
          await window.sero.terminal.create(projectId, terminalId);
          if (cancelled) return;
          setIsConnected(true);
          return;
        } catch {
          if (cancelled) return;
          setRetryCount(attempt + 1);
          if (attempt < MAX_RETRIES - 1) {
            term.writeln(`\x1b[33m● Waiting for container... (${attempt + 1}/${MAX_RETRIES})\x1b[0m`);
            await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          } else {
            term.writeln(`\x1b[1;31m● Failed to connect after ${MAX_RETRIES} attempts.\x1b[0m`);
          }
        }
      }
    }

    // Kick off — wait for dimensions
    requestAnimationFrame(initTerminal);

    return () => {
      cancelled = true;
      inputDisposable?.dispose();
      resizeDisposable?.dispose();
      outputCleanup?.();
      resizeObserver?.disconnect();
      terminal?.dispose();
      window.sero.terminal.dispose(terminalId);
      terminalRef.current = null;
    };
  }, [projectId, terminalId]);

  return (
    <div className="terminal-panel">
      <div className="terminal-container" ref={containerRef} />
      {!isConnected && (
        <div className="terminal-connecting">
          Connecting to container{retryCount > 0 ? ` (attempt ${retryCount}/${MAX_RETRIES})` : ''}...
        </div>
      )}
    </div>
  );
}
