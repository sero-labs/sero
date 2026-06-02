import type { ReactNode } from 'react';
import { AlertCircle, Check, Copy, ExternalLink, Github, Loader2 } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { cn } from '@sero-ai/ui/lib/utils';
import type { GitHubAuthSource } from '@/stores/github-auth';

function GitHubAuthStateFrame({
  icon,
  iconClassName,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  iconClassName: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-lg border',
            iconClassName,
          )}
        >
          {icon}
        </div>
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-[var(--text-primary)]">{title}</p>
          <p className="text-xs leading-relaxed text-[var(--text-secondary)]">{description}</p>
        </div>
      </div>

      {children}
    </div>
  );
}

function sourceSummary(source: GitHubAuthSource | null): string {
  switch (source) {
    case 'explorer':
      return 'Explorer so you can continue with repo work.';
    case 'onboarding':
      return 'onboarding so you can finish setup.';
    case 'remote-origin':
      return 'remote creation so you can finish creating this repository.';
    case 'publish':
      return 'publishing so you can finish creating and pushing this repository.';
    default:
      return 'the GitHub task that brought you here.';
  }
}

export function GitHubAuthLoadingView({ onClose }: { onClose: () => void }) {
  return (
    <GitHubAuthStateFrame
      icon={<Loader2 className="size-4 animate-spin text-[var(--text-primary)]" />}
      iconClassName="border-[var(--border-subtle)] bg-[var(--bg-elevated)]"
      title="Checking GitHub connection"
      description="Sero is refreshing your GitHub status before showing the next step."
    >
      <div className="flex justify-end">
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </GitHubAuthStateFrame>
  );
}

export function GitHubAuthReadyView({
  source,
  onConnect,
  onClose,
}: {
  source: GitHubAuthSource | null;
  onConnect: () => void;
  onClose: () => void;
}) {
  return (
    <GitHubAuthStateFrame
      icon={<Github className="size-4 text-[var(--text-primary)]" />}
      iconClassName="border-[var(--border-subtle)] bg-[var(--bg-elevated)]"
      title="Connect GitHub"
      description="Use one shared GitHub login flow for publishing, remote setup, and Explorer actions."
    >
      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-muted)]/30 px-3 py-2 text-xs leading-relaxed text-[var(--text-secondary)]">
        We&apos;ll open GitHub in your browser and give you a one-time device code. When you finish, Sero returns you to {sourceSummary(source)}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={onConnect}>
          <Github className="mr-2 size-4" />
          Connect GitHub
        </Button>
      </div>
    </GitHubAuthStateFrame>
  );
}

export function GitHubAuthCodeView({
  userCode,
  verificationUri,
  copied,
  copyFailed,
  onCopyCode,
  onCancel,
}: {
  userCode: string;
  verificationUri: string;
  copied: boolean;
  copyFailed: boolean;
  onCopyCode: (code: string) => void;
  onCancel: () => void;
}) {
  return (
    <GitHubAuthStateFrame
      icon={<Github className="size-4 text-status-info" />}
      iconClassName="border-status-info-border bg-status-info-muted"
      title="Authorize in GitHub"
      description="Enter this one-time code at GitHub, then come back here. Sero will finish the connection automatically."
    >
      <div className="space-y-3 rounded-lg border border-status-info-border bg-status-info-muted/70 p-3">
        <div className="space-y-2">
          <p className="text-xs text-[var(--text-secondary)]">Enter this code at github.com/login/device:</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-md border border-status-info-border bg-[var(--bg-base)] px-3 py-2 font-mono text-lg font-bold tracking-[0.25em] text-status-info">
              {userCode}
            </code>
            <Button variant="outline" size="sm" onClick={() => onCopyCode(userCode)}>
              {copied ? (
                <>
                  <Check className="mr-2 size-3.5" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="mr-2 size-3.5" />
                  Copy code
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          <Loader2 className="size-3.5 animate-spin" />
          Waiting for authorization…
        </div>

        {copyFailed ? (
          <p className="text-xs text-status-error">Copy failed, enter the code manually.</p>
        ) : null}
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="outline" onClick={() => window.open(verificationUri, '_blank', 'noopener,noreferrer')}>
          <ExternalLink className="mr-2 size-4" />
          Open GitHub
        </Button>
      </div>
    </GitHubAuthStateFrame>
  );
}

export function GitHubAuthPollingView({ onCancel }: { onCancel: () => void }) {
  return (
    <GitHubAuthStateFrame
      icon={<Loader2 className="size-4 animate-spin text-status-info" />}
      iconClassName="border-status-info-border bg-status-info-muted"
      title="Waiting for GitHub"
      description="Finish the device login in your browser. This dialog updates automatically when GitHub responds."
    >
      <div className="rounded-lg border border-status-info-border bg-status-info-muted/70 px-3 py-2 text-xs text-[var(--text-secondary)]">
        Still waiting for authorization…
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </GitHubAuthStateFrame>
  );
}

export function GitHubAuthConnectedView({
  username,
  onClose,
  onLogout,
}: {
  username: string;
  onClose: () => void;
  onLogout: () => void;
}) {
  return (
    <GitHubAuthStateFrame
      icon={<Check className="size-4 text-status-success" />}
      iconClassName="border-status-success-border bg-status-success-muted"
      title="GitHub connected"
      description="Your GitHub account is ready to use in Sero."
    >
      <div className="rounded-lg border border-status-success-border bg-status-success-muted/70 px-3 py-2 text-xs text-[var(--text-secondary)]">
        Connected as <span className="font-medium text-[var(--text-primary)]">{username}</span>.
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onLogout}>
          Disconnect GitHub
        </Button>
        <Button onClick={onClose}>Done</Button>
      </div>
    </GitHubAuthStateFrame>
  );
}

export function GitHubAuthErrorView({
  message,
  onRetry,
  onClose,
}: {
  message: string;
  onRetry: () => void;
  onClose: () => void;
}) {
  return (
    <GitHubAuthStateFrame
      icon={<AlertCircle className="size-4 text-status-error" />}
      iconClassName="border-status-error-border bg-status-error-muted"
      title="GitHub authentication failed"
      description="Retry the GitHub device login or close this dialog to return where you started."
    >
      <div className="rounded-lg border border-status-error-border bg-status-error-muted/70 px-3 py-2 text-xs leading-relaxed text-status-error">
        {message}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
        <Button onClick={onRetry}>Try again</Button>
      </div>
    </GitHubAuthStateFrame>
  );
}
