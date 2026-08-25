import { TriangleAlert, X } from 'lucide-react';
import { useStorageSecurityStore } from '@/stores/storage-security';

/**
 * Banner shown when saved credentials are not really protected.
 *
 * Covers every use of safe storage, not just GitHub — plugins store tokens
 * through the same channel, so a warning attached to one login would stay
 * silent for the rest.
 *
 * Dismissible, because it cannot be fixed without installing a keyring and
 * restarting. The status-bar indicator remains after dismissal.
 */
export function StorageSecurityBanner() {
  const status = useStorageSecurityStore((s) => s.status);
  const dismissed = useStorageSecurityStore((s) => s.bannerDismissed);
  const dismiss = useStorageSecurityStore((s) => s.dismissBanner);

  if (!status || status.secure || dismissed) return null;

  return (
    <div
      role="status"
      className="flex shrink-0 items-center gap-2.5 border-t border-[var(--status-warning-border)] bg-[var(--status-warning-muted)] px-4 py-2 text-xs"
    >
      <TriangleAlert className="size-3.5 shrink-0 text-[var(--status-warning)]" />
      <span className="min-w-0 flex-1 text-[var(--text-primary)]">
        Credentials are not stored securely.{' '}
        <span className="text-[var(--text-secondary)]">{status.reason}</span>
      </span>
      {status.remedy ? (
        <span className="hidden shrink-0 text-[var(--text-secondary)] sm:inline">
          {status.remedy}
        </span>
      ) : null}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss storage security warning"
        title="Dismiss. The status bar keeps showing this."
        className="shrink-0 rounded p-0.5 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
