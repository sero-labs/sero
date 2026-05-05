import type { OpenShellCloudAuthMode } from '@/types/ipc';
import { Input } from '@sero-ai/ui/components/ui/input';

interface AddWorkspaceCloudFieldsProps {
  gatewayName: string;
  onGatewayNameChange: (value: string) => void;
  endpoint: string;
  onEndpointChange: (value: string) => void;
  authMode: OpenShellCloudAuthMode;
  onAuthModeChange: (value: OpenShellCloudAuthMode) => void;
  resourceLabel: string;
  onResourceLabelChange: (value: string) => void;
  costLabel: string;
  onCostLabelChange: (value: string) => void;
  idleTimeoutMinutes: string;
  onIdleTimeoutMinutesChange: (value: string) => void;
  error: string | null;
}

export function AddWorkspaceCloudFields({
  gatewayName,
  onGatewayNameChange,
  endpoint,
  onEndpointChange,
  authMode,
  onAuthModeChange,
  resourceLabel,
  onResourceLabelChange,
  costLabel,
  onCostLabelChange,
  idleTimeoutMinutes,
  onIdleTimeoutMinutesChange,
  error,
}: AddWorkspaceCloudFieldsProps) {
  return (
    <div className="rounded-md border border-[var(--border-default)] bg-[var(--bg-base)] p-2">
      <p className="mb-2 text-[11px] leading-snug text-[var(--text-muted)]">
        OpenShell Cloud connects to a hosted gateway endpoint. Sessions may incur external provider costs; clean up stale sessions when you are done.
      </p>
      <div className="grid gap-2">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">
            Gateway name
          </label>
          <Input
            value={gatewayName}
            onChange={(e) => onGatewayNameChange(e.target.value)}
            placeholder="sero-cloud-prod"
            className="h-7 text-xs"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">
            Endpoint
          </label>
          <Input
            value={endpoint}
            onChange={(e) => onEndpointChange(e.target.value)}
            placeholder="https://gateway.example.com"
            className="h-7 text-xs"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">
              Auth mode
            </label>
            <select
              value={authMode}
              onChange={(e) => onAuthModeChange(e.target.value as OpenShellCloudAuthMode)}
              className="h-7 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-base)] px-2 text-xs text-[var(--text-primary)]"
            >
              <option value="none">None</option>
              <option value="browser">Browser login</option>
              <option value="external">External</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">
              Idle timeout
            </label>
            <Input
              value={idleTimeoutMinutes}
              onChange={(e) => onIdleTimeoutMinutesChange(e.target.value)}
              placeholder="60"
              inputMode="numeric"
              className="h-7 text-xs"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">
              Resource label
            </label>
            <Input
              value={resourceLabel}
              onChange={(e) => onResourceLabelChange(e.target.value)}
              placeholder="Optional CPU/GPU notes"
              className="h-7 text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">
              Cost label
            </label>
            <Input
              value={costLabel}
              onChange={(e) => onCostLabelChange(e.target.value)}
              placeholder="Optional cost notes"
              className="h-7 text-xs"
            />
          </div>
        </div>
      </div>
      {error && (
        <p className="mt-2 rounded-md border border-[var(--status-error-border)] bg-[var(--status-error-faint)] px-2 py-1.5 text-[11px] leading-snug text-[var(--status-error)]">
          {error}
        </p>
      )}
    </div>
  );
}
