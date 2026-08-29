import { useEffect } from 'react';
import { Download, X } from 'lucide-react';
import { openSeroApp } from '@sero-ai/app-runtime';
import { Button } from '@sero-ai/ui/components/ui/button';
import { useBrowserPackNoticeStore } from '@/stores/browser-pack-notice';
import { useProfileStore } from '@/stores/profiles';

export function BrowserPackUpdateNotice() {
  const onboarded = useProfileStore((state) => state.activeProfile?.onboarded === true);
  const visible = useBrowserPackNoticeStore((state) => state.visible);
  const status = useBrowserPackNoticeStore((state) => state.status);
  const check = useBrowserPackNoticeStore((state) => state.check);
  const dismiss = useBrowserPackNoticeStore((state) => state.dismiss);

  useEffect(() => {
    if (onboarded) void check();
  }, [check, onboarded]);

  if (!visible || !status?.previousManifestVersion) return null;

  const openSettings = async () => {
    const opened = await openSeroApp('admin', {
      section: 'settings',
      configKey: 'settings',
    });
    if (opened) dismiss();
  };

  return (
    <div
      role="status"
      className="flex shrink-0 items-center gap-2.5 border-t border-[var(--banner-primary-border)] bg-[var(--banner-primary-muted)] px-4 py-2 text-xs"
    >
      <Download className="size-3.5 shrink-0 text-[var(--banner-primary)]" />
      <span className="min-w-0 flex-1 text-[var(--text-primary)]">
        Sero can install a newer browser automation pack.
      </span>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="shrink-0 text-[var(--banner-primary)]"
        onClick={() => void openSettings()}
      >
        Open settings
      </Button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss browser pack update"
        className="shrink-0 rounded p-0.5 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
