/**
 * ProfileForm — shared form for creating profiles.
 *
 * Used by both the setup screen and the create-profile dialog.
 * Handles name input, optional custom folder picker, and optional
 * credential/config import from an existing profile.
 */

import { useEffect, useState } from 'react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Input } from '@sero-ai/ui/components/ui/input';
import { Folder, Loader2 } from 'lucide-react';

interface ProfileFormProps {
  /** Button label (e.g. "Create Profile", "Get Started"). */
  submitLabel?: string;
  /** Called when the user submits the form. */
  onSubmit: (name: string, customPath?: string, copyAuthFromId?: string) => Promise<void>;
  /** Shared operational error for restart-sensitive profile actions. */
  operationError?: string | null;
  /** Clears the shared operational error when the user edits the form. */
  onClearOperationError?: () => void;
  /** If true, shows a loading spinner on the submit button. */
  isLoading?: boolean;
  /** If true, the name input is autofocused. */
  autoFocus?: boolean;
}

export function ProfileForm({
  submitLabel = 'Create Profile',
  onSubmit,
  operationError = null,
  onClearOperationError,
  isLoading = false,
  autoFocus = true,
}: ProfileFormProps) {
  const [name, setName] = useState('');
  const [customPath, setCustomPath] = useState<string | null>(null);
  const [copyAuth, setCopyAuth] = useState(false);
  const [hasAuthSource, setHasAuthSource] = useState(false);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Check if the current active profile has transferable profile data to copy
  useEffect(() => {
    (async () => {
      try {
        const [sources, active] = await Promise.all([
          window.sero.profiles.listAuthSources(),
          window.sero.profiles.getActive(),
        ]);
        const currentHasAuth = active && sources.some((s) => s.id === active.id);
        setHasAuthSource(!!currentHasAuth);
        setActiveProfileId(active?.id ?? null);
        if (currentHasAuth) setCopyAuth(true); // default to checked
      } catch { /* ignore */ }
    })();
  }, []);

  const handlePickFolder = async () => {
    try {
      const picked = await window.sero.profiles.pickFolder();
      if (picked) {
        setCustomPath(picked);
        setValidationError(null);
        onClearOperationError?.();
      }
    } catch (err) {
      console.error('[ProfileForm] Folder picker error:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setValidationError('Profile name is required');
      return;
    }
    setValidationError(null);
    onClearOperationError?.();
    const authSource = (copyAuth && activeProfileId) ? activeProfileId : undefined;
    await onSubmit(trimmed, customPath ?? undefined, authSource);
  };

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4">
      {/* Profile Name */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="profile-name"
          className="text-xs font-medium text-[var(--text-secondary)]"
        >
          Profile Name
        </label>
        <Input
          id="profile-name"
          type="text"
          placeholder="e.g. Personal, Work, Research..."
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setValidationError(null);
            onClearOperationError?.();
          }}
          autoFocus={autoFocus}
          disabled={isLoading}
          className="bg-[var(--bg-surface)] text-[var(--text-primary)]"
        />
      </div>

      {/* Storage Location */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-[var(--text-secondary)]">
          Storage Location
          <span className="ml-1 font-normal text-[var(--text-muted)]">(optional)</span>
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePickFolder}
            disabled={isLoading}
            className="flex flex-1 items-center gap-2 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-left text-xs transition-colors hover:border-[var(--border-default)] disabled:opacity-50"
          >
            <Folder className="size-3.5 shrink-0 text-[var(--text-muted)]" />
            <span className={customPath ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}>
              {customPath ? customPath : 'Default location'}
            </span>
          </button>
          {customPath && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setCustomPath(null);
                onClearOperationError?.();
              }}
              disabled={isLoading}
              className="shrink-0 text-xs text-[var(--text-muted)]"
            >
              Reset
            </Button>
          )}
        </div>
        <p className="text-[10px] text-[var(--text-muted)]">
          Each profile stores its own workspaces, sessions, settings, and credentials.
        </p>
      </div>

      {/* Copy Credentials */}
      {hasAuthSource && (
        <label className="flex cursor-pointer items-center gap-2.5 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2.5">
          <input
            type="checkbox"
            checked={copyAuth}
            onChange={(e) => {
              setCopyAuth(e.target.checked);
              onClearOperationError?.();
            }}
            disabled={isLoading}
            className="size-3.5 accent-[var(--accent-primary)]"
          />
          <div>
            <span className="text-xs text-[var(--text-secondary)]">
              Copy credentials and model preferences from current profile
            </span>
            <p className="text-[10px] text-[var(--text-muted)]">
              Copies API keys, OAuth tokens, env-backed credentials, local model config, gateway access, and model preferences.
            </p>
          </div>
        </label>
      )}

      {(validationError ?? operationError) && (
        <p className="text-xs text-[var(--status-error)]">{validationError ?? operationError}</p>
      )}

      <Button
        type="submit"
        disabled={isLoading || !name.trim()}
        className="mt-2"
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 size-3.5 animate-spin" />
            Creating...
          </>
        ) : (
          submitLabel
        )}
      </Button>
    </form>
  );
}
