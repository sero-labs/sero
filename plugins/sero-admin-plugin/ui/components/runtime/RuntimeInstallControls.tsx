import { useEffect, useState } from 'react';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import { Button } from '@sero-ai/ui/components/ui/button';
import {
  getSero,
  type BrowserPackProgressIPC,
  type BrowserPackStatusIPC,
  type ToolchainProgressIPC,
  type ToolchainStatusIPC,
} from '../../hooks/host';

interface RuntimeInstallControlsProps {
  disabled?: boolean;
  onChanged?: () => void;
}

type BusyAction = 'core' | 'browser' | 'uninstall-browser' | null;

export function RuntimeInstallControls({ disabled = false, onChanged }: RuntimeInstallControlsProps) {
  const [coreStatus, setCoreStatus] = useState<ToolchainStatusIPC | null>(null);
  const [browserStatus, setBrowserStatus] = useState<BrowserPackStatusIPC | null>(null);
  const [coreProgress, setCoreProgress] = useState<ToolchainProgressIPC | null>(null);
  const [browserProgress, setBrowserProgress] = useState<BrowserPackProgressIPC | null>(null);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const sero = getSero();
    const [toolchain, browser] = await Promise.all([
      sero.workspace.getToolchainStatus?.(),
      sero.workspace.getBrowserPackStatus?.(),
    ]);
    setCoreStatus(toolchain ?? null);
    setBrowserStatus(browser ?? null);
  };

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : 'Failed to load install status'));
    const sero = getSero();
    const unsubscribeToolchain = sero.workspace.onToolchainProgress?.((event) => {
      setCoreProgress(event);
      void load().catch(() => undefined);
    });
    const unsubscribeBrowser = sero.workspace.onBrowserPackProgress?.((event) => {
      setBrowserProgress(event);
      void load().catch(() => undefined);
    });
    return () => {
      unsubscribeToolchain?.();
      unsubscribeBrowser?.();
    };
  }, []);

  const run = async (action: BusyAction, operation: () => Promise<void>) => {
    setBusy(action);
    setError(null);
    try {
      await operation();
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Runtime install action failed');
      await load().catch(() => undefined);
    } finally {
      setBusy(null);
    }
  };

  const installCore = () => run('core', async () => {
    const status = await getSero().workspace.ensureCoreTools?.('settings');
    if (status) setCoreStatus(status);
  });

  const installBrowser = () => run('browser', async () => {
    const status = await getSero().workspace.ensureBrowserPack?.('settings');
    if (status) setBrowserStatus(status);
  });

  const uninstallBrowser = () => run('uninstall-browser', async () => {
    const status = await getSero().workspace.uninstallBrowserPack?.();
    if (status) setBrowserStatus(status);
  });

  const coreRetryable = coreStatus?.state === 'failed'
    && coreStatus.error?.retryable === true
    && coreStatus.error.installable === true;
  const showCoreInstall = coreStatus !== null
    && coreStatus.state !== 'ready'
    && coreStatus.state !== 'installing'
    && (coreStatus.state !== 'failed' || coreRetryable);
  const browserRetryable = browserStatus?.state === 'failed'
    && browserStatus.error?.retryable === true
    && browserStatus.error.installable === true;
  const showBrowserInstall = browserStatus !== null
    && browserStatus.state !== 'ready'
    && browserStatus.state !== 'missing'
    && browserStatus.state !== 'installing'
    && (browserStatus.state !== 'failed' || browserRetryable);

  return (
    <div className="rounded-lg border border-border/40 bg-secondary/20 px-3 py-2 text-[11px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-foreground/85">Managed host installs</span>
          <Badge variant={coreStatus?.state === 'ready' ? 'secondary' : 'outline'}>
            Core tools {coreStatus?.state ?? 'unknown'}
          </Badge>
          <Badge variant={browserStatus?.state === 'ready' ? 'secondary' : 'outline'}>
            Browser pack {browserStatus?.state ?? 'unknown'}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {showCoreInstall ? (
            <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" disabled={disabled || busy !== null} onClick={installCore}>
              {busy === 'core' ? 'Installing…' : coreStatus.state === 'failed' ? 'Retry core tools' : 'Install core tools'}
            </Button>
          ) : null}
          {coreStatus?.state === 'installing' ? (
            <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" disabled>
              Installing…
            </Button>
          ) : null}
          {showBrowserInstall ? (
            <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" disabled={disabled || busy !== null} onClick={installBrowser}>
              {busy === 'browser' ? 'Installing…' : browserStatus.state === 'failed' ? 'Retry browser pack' : 'Install browser pack'}
            </Button>
          ) : null}
          {browserStatus?.state === 'ready' ? (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" disabled={disabled || busy !== null} onClick={uninstallBrowser}>
              {busy === 'uninstall-browser' ? 'Uninstalling…' : 'Uninstall browser pack'}
            </Button>
          ) : null}
        </div>
      </div>
      <InstallDetail
        coreStatus={coreStatus}
        browserStatus={browserStatus}
        coreProgress={coreProgress ?? coreStatus?.progress}
        browserProgress={browserProgress ?? browserStatus?.progress}
        error={error}
      />
    </div>
  );
}

function InstallDetail(props: {
  coreStatus: ToolchainStatusIPC | null;
  browserStatus: BrowserPackStatusIPC | null;
  coreProgress?: ToolchainProgressIPC;
  browserProgress?: BrowserPackProgressIPC;
  error: string | null;
}) {
  const coreFailure = props.coreStatus?.error ?? props.coreProgress?.error;
  const browserFailure = props.browserStatus?.error ?? props.browserProgress?.error;
  const progress = props.browserProgress ?? props.coreProgress;
  const failure = browserFailure ?? coreFailure;

  if (props.error) return <p className="mt-2 text-destructive">{props.error}</p>;
  if (props.browserStatus?.state === 'missing') {
    return (
      <p className="mt-2 text-muted-foreground/75">
        {browserFailure?.message ?? 'Browser pack artifacts are not available for this machine yet.'} Use a container runtime for browser automation.
      </p>
    );
  }
  if (failure) {
    return (
      <p className="mt-2 text-destructive">
        {failure.message} {failure.retryable && failure.installable ? 'Retry is available.' : 'Manual setup may be required.'}{' '}
        {failure.retryable && failure.installable ? 'Use the retry button to attach to the existing install or start a new attempt.' : 'Container fallback may be a better option.'}
      </p>
    );
  }
  if (progress && progress.phase !== 'ready') {
    const bytes = progress.bytesTotal ? ` (${progress.bytesReceived ?? 0}/${progress.bytesTotal} bytes)` : '';
    return <p className="mt-2 text-muted-foreground/75">Install progress: {progress.phase}{bytes}</p>;
  }
  return (
    <p className="mt-2 text-muted-foreground/75">
      Core tools install on demand. Browser automation is a large optional host pack; containers remain available as fallback.
    </p>
  );
}
