import { useState, type RefObject } from 'react';
import { Check, ChevronDown, FolderInput, FolderOpen, FolderPlus, Loader2, X } from 'lucide-react';
import {
  DEFAULT_OPENSHELL_POLICY_PROFILE_ID,
  OPENSHELL_POLICY_PROFILES,
  getOpenShellPolicyProfile,
  type OpenShellPolicyProfileId,
} from '@sero-ai/common';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Input } from '@sero-ai/ui/components/ui/input';
import { cn } from '@sero-ai/ui/lib/utils';
import type { OpenShellCloudAuthMode } from '@/types/ipc';
import { AddWorkspaceCloudFields } from './AddWorkspaceCloudFields';

export type RuntimeChoice =
  | 'default'
  | 'host'
  | 'apple-container'
  | 'openshell-local'
  | 'openshell-remote'
  | 'openshell-cloud';

const RUNTIME_OPTIONS: Array<{
  value: RuntimeChoice;
  label: string;
  detail: string;
}> = [
  { value: 'default', label: 'Default', detail: 'Current behavior' },
  { value: 'host', label: 'Local macOS', detail: 'Run directly on this Mac' },
  { value: 'apple-container', label: 'Apple Container', detail: 'Isolated workspace runtime' },
  { value: 'openshell-local', label: 'OpenShell Local', detail: 'Experimental · requires Docker' },
  { value: 'openshell-remote', label: 'OpenShell Remote', detail: 'Experimental · SSH Linux host with Docker' },
  { value: 'openshell-cloud', label: 'OpenShell Cloud', detail: 'Experimental · hosted gateway, auth, and external costs' },
];

/** Initial view — two action rows. */
export function PickView({
  onCreateNew,
  onImportExisting,
}: {
  onCreateNew: () => void;
  onImportExisting: () => void;
}) {
  return (
    <div className="flex flex-col py-1">
      <button
        onClick={onCreateNew}
        className="flex items-center gap-2.5 px-3 py-2 text-left text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
      >
        <FolderPlus className="size-3.5 text-[var(--text-muted)]" />
        Create New
      </button>
      <button
        onClick={onImportExisting}
        className="flex items-center gap-2.5 px-3 py-2 text-left text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
      >
        <FolderInput className="size-3.5 text-[var(--text-muted)]" />
        Import Existing
      </button>
    </div>
  );
}

/** Create form view — name input, optional location, create button. */
export function CreateView({
  inputRef,
  name,
  onNameChange,
  parentPath,
  onPickLocation,
  onClearLocation,
  runtimeChoice,
  onRuntimeChoiceChange,
  policyProfileId = DEFAULT_OPENSHELL_POLICY_PROFILE_ID,
  onPolicyProfileChange,
  remoteGatewayName,
  onRemoteGatewayNameChange,
  remoteSshHost,
  onRemoteSshHostChange,
  remoteSshKeyPath,
  onRemoteSshKeyPathChange,
  remotePort,
  onRemotePortChange,
  remoteGatewayHost,
  onRemoteGatewayHostChange,
  remoteError,
  cloudGatewayName,
  onCloudGatewayNameChange,
  cloudEndpoint,
  onCloudEndpointChange,
  cloudAuthMode,
  onCloudAuthModeChange,
  cloudResourceLabel,
  onCloudResourceLabelChange,
  cloudCostLabel,
  onCloudCostLabelChange,
  cloudIdleTimeoutMinutes,
  onCloudIdleTimeoutMinutesChange,
  cloudError,
  onBack,
  onCreate,
  isCreating,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  name: string;
  onNameChange: (v: string) => void;
  parentPath: string | null;
  onPickLocation: () => void;
  onClearLocation: () => void;
  runtimeChoice: RuntimeChoice;
  onRuntimeChoiceChange: (choice: RuntimeChoice) => void;
  policyProfileId?: OpenShellPolicyProfileId;
  onPolicyProfileChange?: (profileId: OpenShellPolicyProfileId) => void;
  remoteGatewayName: string;
  onRemoteGatewayNameChange: (v: string) => void;
  remoteSshHost: string;
  onRemoteSshHostChange: (v: string) => void;
  remoteSshKeyPath: string;
  onRemoteSshKeyPathChange: (v: string) => void;
  remotePort: string;
  onRemotePortChange: (v: string) => void;
  remoteGatewayHost: string;
  onRemoteGatewayHostChange: (v: string) => void;
  remoteError: string | null;
  cloudGatewayName: string;
  onCloudGatewayNameChange: (v: string) => void;
  cloudEndpoint: string;
  onCloudEndpointChange: (v: string) => void;
  cloudAuthMode: OpenShellCloudAuthMode;
  onCloudAuthModeChange: (v: OpenShellCloudAuthMode) => void;
  cloudResourceLabel: string;
  onCloudResourceLabelChange: (v: string) => void;
  cloudCostLabel: string;
  onCloudCostLabelChange: (v: string) => void;
  cloudIdleTimeoutMinutes: string;
  onCloudIdleTimeoutMinutesChange: (v: string) => void;
  cloudError: string | null;
  onBack: () => void;
  onCreate: () => void;
  isCreating: boolean;
}) {
  const locationLabel = parentPath
    ? parentPath.split('/').filter(Boolean).pop()
    : null;
  const selectedPolicyProfile = getOpenShellPolicyProfile(policyProfileId);
  const [showPolicyProfiles, setShowPolicyProfiles] = useState(false);

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onCreate(); }}
      className="flex flex-col gap-2.5 p-3"
    >
      {/* Name */}
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
          Name
        </label>
        <Input
          ref={inputRef}
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="My Project"
          className="h-7 text-xs"
          autoFocus
        />
      </div>

      {/* Location */}
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
          Location
        </label>
        <button
          type="button"
          onClick={onPickLocation}
          className={cn(
            'flex h-7 w-full items-center gap-1.5 rounded-md border px-2 text-xs transition-colors',
            'border-[var(--border-default)] bg-[var(--bg-base)] hover:bg-[var(--bg-elevated)]',
            parentPath ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]',
          )}
          title={parentPath ?? 'Default (~/.sero-ui/workspaces)'}
        >
          <FolderOpen className="size-3 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-left">
            {locationLabel ?? 'Default'}
          </span>
          {parentPath && (
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => { e.stopPropagation(); onClearLocation(); }}
              className="shrink-0 rounded p-0.5 hover:bg-[var(--bg-base)]"
            >
              <X className="size-2.5 text-[var(--text-muted)]" />
            </span>
          )}
        </button>
      </div>

      {/* Runtime */}
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
          Runtime
        </label>
        <div className="grid gap-1" role="radiogroup" aria-label="Workspace runtime">
          {RUNTIME_OPTIONS.map((option) => {
            const selected = runtimeChoice === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onRuntimeChoiceChange(option.value)}
                className={cn(
                  'flex cursor-pointer items-start gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors',
                  selected
                    ? 'border-[var(--accent-primary)] bg-[var(--bg-elevated)] text-[var(--text-primary)] ring-1 ring-[var(--accent-primary)]/40'
                    : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]',
                )}
              >
                <span className={cn(
                  'mt-0.5 flex size-3 shrink-0 items-center justify-center rounded-full border',
                  selected ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] text-[var(--bg-base)]' : 'border-[var(--border-default)]',
                )}>
                  {selected ? <Check className="size-2" /> : null}
                </span>
                <span className="min-w-0">
                  <span className="block font-medium">{option.label}</span>
                  <span className="block text-[var(--text-muted)]">{option.detail}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {runtimeChoice === 'openshell-remote' && (
        <div className="rounded-md border border-[var(--border-default)] bg-[var(--bg-base)] p-2">
          <p className="mb-2 text-[11px] leading-snug text-[var(--text-muted)]">
            OpenShell Remote requires SSH access to a Linux host with Docker. Use OpenShell Cloud for hosted endpoint gateways.
          </p>
          <div className="grid gap-2">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">
                Gateway name
              </label>
              <Input
                value={remoteGatewayName}
                onChange={(e) => onRemoteGatewayNameChange(e.target.value)}
                placeholder="sero-remote-mybox"
                className="h-7 text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">
                SSH destination
              </label>
              <Input
                value={remoteSshHost}
                onChange={(e) => onRemoteSshHostChange(e.target.value)}
                placeholder="user@example-host"
                className="h-7 text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">
                SSH key path
              </label>
              <Input
                value={remoteSshKeyPath}
                onChange={(e) => onRemoteSshKeyPathChange(e.target.value)}
                placeholder="Optional SSH key path"
                className="h-7 text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">
                  Port
                </label>
                <Input
                  value={remotePort}
                  onChange={(e) => onRemotePortChange(e.target.value)}
                  placeholder="8080"
                  inputMode="numeric"
                  className="h-7 text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">
                  Gateway host
                </label>
                <Input
                  value={remoteGatewayHost}
                  onChange={(e) => onRemoteGatewayHostChange(e.target.value)}
                  placeholder="Optional override"
                  className="h-7 text-xs"
                />
              </div>
            </div>
          </div>
          {remoteError && (
            <p className="mt-2 rounded-md border border-[var(--status-error-border)] bg-[var(--status-error-faint)] px-2 py-1.5 text-[11px] leading-snug text-[var(--status-error)]">
              {remoteError}
            </p>
          )}
        </div>
      )}

      {runtimeChoice === 'openshell-cloud' && (
        <AddWorkspaceCloudFields
          gatewayName={cloudGatewayName}
          onGatewayNameChange={onCloudGatewayNameChange}
          endpoint={cloudEndpoint}
          onEndpointChange={onCloudEndpointChange}
          authMode={cloudAuthMode}
          onAuthModeChange={onCloudAuthModeChange}
          resourceLabel={cloudResourceLabel}
          onResourceLabelChange={onCloudResourceLabelChange}
          costLabel={cloudCostLabel}
          onCostLabelChange={onCloudCostLabelChange}
          idleTimeoutMinutes={cloudIdleTimeoutMinutes}
          onIdleTimeoutMinutesChange={onCloudIdleTimeoutMinutesChange}
          error={cloudError}
        />
      )}

      {runtimeChoice === 'openshell-local' && (
        <div className="rounded-md border border-[var(--border-default)] bg-[var(--bg-base)] p-2">
          <button
            type="button"
            aria-expanded={showPolicyProfiles}
            onClick={() => setShowPolicyProfiles((open) => !open)}
            className="flex w-full items-center justify-between gap-3 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-[var(--bg-elevated)]"
          >
            <span className="min-w-0">
              <span className="block text-xs font-medium text-[var(--text-secondary)]">
                OpenShell policy profile
              </span>
              <span className="block truncate text-[11px] text-[var(--text-muted)]">
                {selectedPolicyProfile.label} · intent only
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1 text-[11px] text-[var(--text-muted)]">
              Change
              <ChevronDown className={cn('size-3 transition-transform', showPolicyProfiles ? 'rotate-180' : '')} />
            </span>
          </button>

          {showPolicyProfiles && (
            <div className="mt-2 border-t border-[var(--border-subtle)] pt-2">
              <p className="mb-2 text-[11px] leading-snug text-[var(--text-muted)]">
                Sero stores profile intent only; generated policy YAML is not applied yet.
              </p>
              <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="OpenShell policy profile">
                {OPENSHELL_POLICY_PROFILES.map((profile) => {
                  const selected = policyProfileId === profile.id;
                  return (
                    <button
                      key={profile.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => onPolicyProfileChange?.(profile.id)}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] leading-none transition-colors',
                        selected
                          ? 'border-[var(--accent-primary)] bg-[var(--bg-elevated)] text-[var(--text-primary)] ring-1 ring-[var(--accent-primary)]/40'
                          : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]',
                      )}
                    >
                      {selected ? <Check className="size-2.5" /> : null}
                      <span>{profile.label}</span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1.5">
                <div className="text-[11px] font-medium text-[var(--text-secondary)]">
                  {selectedPolicyProfile.label}
                </div>
                <p className="mt-0.5 text-[11px] leading-snug text-[var(--text-muted)]">
                  {selectedPolicyProfile.summary} Enforcement is reported in diagnostics.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-between">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={onBack}
        >
          Back
        </Button>
        <Button
          type="submit"
          size="sm"
          className="h-6 px-2 text-xs"
          disabled={!name.trim() || isCreating}
        >
          {isCreating ? <Loader2 className="size-3 animate-spin" /> : 'Create'}
        </Button>
      </div>
    </form>
  );
}
