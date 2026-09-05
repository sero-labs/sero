/**
 * Devices paired with this profile.
 *
 * Tokens are masked here and never handed back to the renderer, so a QR
 * cannot be shown a second time. A device that has lost its code pairs
 * again; the desktop does not reissue a live credential.
 *
 * Revoking takes the device's access away at once and drops whatever was
 * filed under its token, including its push subscription.
 */

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Smartphone, Trash2 } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import type { PairedDevice } from '@/types/ipc';

/** Shown when the profile is paired with this many devices. */
export const MAX_PAIRED_DEVICES = 10;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function PairedDeviceList({
  devices,
  loading,
  onRevoked,
}: {
  devices: PairedDevice[];
  loading: boolean;
  onRevoked: () => void;
}) {
  const [revoking, setRevoking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const revoke = useCallback(
    async (tokenId: string) => {
      setRevoking(tokenId);
      setError(null);
      try {
        await window.sero.gateway.revokeWebToken(tokenId);
        onRevoked();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not unpair the device');
      } finally {
        setRevoking(null);
      }
    },
    [onRevoked],
  );

  if (loading) {
    return (
      <div className="flex h-24 w-full items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (devices.length === 0) {
    return (
      <p className="w-full py-4 text-center text-sm text-muted-foreground">
        No devices paired yet.
      </p>
    );
  }

  return (
    <div className="w-full space-y-2">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <ul className="space-y-1">
        {devices.map((device) => (
          <li
            key={device.tokenId}
            data-testid="paired-device"
            className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2"
          >
            <Smartphone className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{device.label}</p>
              <p className="truncate text-xs text-muted-foreground">
                {device.workspaceIds === null
                  ? 'All workspaces'
                  : `${device.workspaceIds.length} workspace${device.workspaceIds.length === 1 ? '' : 's'}`}
                {' · expires '}
                {formatDate(device.expiresAt)}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Unpair ${device.label}`}
              title="Unpair this device"
              data-testid="unpair-device"
              disabled={revoking !== null}
              onClick={() => void revoke(device.tokenId)}
              className="size-7 shrink-0 p-0 text-muted-foreground hover:text-destructive"
            >
              {revoking === device.tokenId ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Trash2 className="size-3.5" />
              )}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Load the paired devices, and reload them on demand. */
export function usePairedDevices() {
  const [devices, setDevices] = useState<PairedDevice[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setDevices(await window.sero.gateway.listWebTokens());
    } catch {
      // An unreachable gateway means nothing is paired that we can show.
      setDevices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // The caller mounts when the dialog opens, so one load on mount is
  // one load per open. (IPC init, valid useEffect.)
  useEffect(() => {
    void reload();
  }, [reload]);

  return { devices, loading, reload };
}
