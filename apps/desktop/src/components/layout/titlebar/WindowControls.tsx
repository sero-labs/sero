import { useEffect, useState } from 'react';
import { Copy, Minus, Square, X } from 'lucide-react';

/**
 * Custom window controls, rendered only on Linux (frameless window).
 * macOS keeps native traffic lights; Windows uses the native title-bar
 * overlay — neither needs these.
 */
export function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void window.sero.window.isMaximized().then((value) => {
      if (!cancelled) setMaximized(value);
    });
    const unsubscribe = window.sero.window.onMaximizedChanged(setMaximized);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return (
    <div className="no-drag flex items-center gap-0.5 pr-1.5">
      <ControlButton label="Minimize" onClick={() => void window.sero.window.minimize()}>
        <Minus className="size-3.5" />
      </ControlButton>
      <ControlButton
        label={maximized ? 'Restore' : 'Maximize'}
        onClick={() => void window.sero.window.toggleMaximize()}
      >
        {maximized ? <Copy className="size-3" /> : <Square className="size-3" />}
      </ControlButton>
      <ControlButton
        label="Close"
        onClick={() => void window.sero.window.close()}
        className="hover:bg-status-error hover:text-white"
      >
        <X className="size-3.5" />
      </ControlButton>
    </div>
  );
}

function ControlButton({
  label,
  onClick,
  className = 'hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]',
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex size-7 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors ${className}`}
    >
      {children}
    </button>
  );
}
