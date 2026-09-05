/**
 * ConnectDeviceDialog, generates and displays a QR code for pairing
 * a remote device (phone/tablet) with Sero over Tailscale or LAN.
 *
 * Flow:
 *   1. User opens this dialog (e.g. via ⌘K → "Connect Device")
 *   2. It lists the devices already paired with this profile
 *   3. "Pair a new device" creates a time-limited owner web token and
 *      shows its QR code + login URL
 *   4. User scans the QR on their device → web-remote auto-connects with access to the whole profile
 *
 * Opening this dialog pairs nothing. It used to mint a token on every
 * open, which filled the ten-token limit with codes nobody had scanned
 * and pushed real pairings out of it.
 *
 * A QR is shown once. Tokens are masked once stored, so a device that
 * lost its code pairs again rather than being handed the credential a
 * second time.
 *
 * The manual token entry in the web-remote AuthScreen remains available
 * for same-machine development where camera scanning isn't possible.
 */

import { useCallback, useState } from 'react';
import { ArrowLeft, Check, Copy, Loader2, Plus, QrCode } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@sero-ai/ui/components/ui/dialog';
import { Button } from '@sero-ai/ui/components/ui/button';
import type { QrLoginData } from '@/types/ipc';
import { copyTextToClipboard } from '@/lib/copy-to-clipboard';
import {
  MAX_PAIRED_DEVICES,
  PairedDeviceList,
  usePairedDevices,
} from './PairedDeviceList';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Phase = 'list' | 'loading' | 'ready' | 'error';

export function ConnectDeviceDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <ConnectDevicePanel />
      </DialogContent>
    </Dialog>
  );
}

/**
 * What the dialog shows. Radix mounts it on open and unmounts it on
 * close, so every open starts on the list with nothing generated, and
 * a code left on screen is gone once the dialog closes.
 */
function ConnectDevicePanel() {
  const [phase, setPhase] = useState<Phase>('list');
  const [data, setData] = useState<QrLoginData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const { devices, loading: devicesLoading, reload } = usePairedDevices();

  const atLimit = devices.length >= MAX_PAIRED_DEVICES;

  const generate = useCallback(async () => {
    setPhase('loading');
    setError(null);
    setCopied(false);
    setCopyFailed(false);
    try {
      const result = await window.sero.gateway.getQrLoginData(7);
      setData(result);
      setPhase('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate QR code');
      setPhase('error');
    }
  }, []);

  /** Back to the list, with the new pairing in it. */
  const backToList = useCallback(() => {
    setPhase('list');
    setData(null);
    setError(null);
    void reload();
  }, [reload]);

  const handleCopy = useCallback(async () => {
    if (!data) return;
    const ok = await copyTextToClipboard(data.loginUrl);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return;
    }
    setCopyFailed(true);
    setTimeout(() => setCopyFailed(false), 3000);
  }, [data]);

  const expiresFormatted = data
    ? new Date(data.expiresAt).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <QrCode className="size-5" />
          Connect Device
        </DialogTitle>
        <DialogDescription>
          {phase === 'list'
            ? 'Devices paired with this Sero profile. A paired device reaches every workspace in the profile, including ones you create later.'
            : 'Scan this QR code with your phone to open Sero Remote. This pairing signs the device into this Sero profile, with access to all current workspaces and any new workspaces you create later.'}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col items-center gap-4">
        {/* ── Paired devices ─────────────────────────────── */}
        {phase === 'list' && (
          <>
            <PairedDeviceList
              devices={devices}
              loading={devicesLoading}
              onRevoked={reload}
            />

            {atLimit ? (
              <p className="w-full text-center text-sm text-muted-foreground">
                Paired with {MAX_PAIRED_DEVICES} devices, the most allowed.
                Unpair one to pair another.
              </p>
            ) : null}

            <Button
              className="w-full gap-2"
              disabled={devicesLoading || atLimit}
              data-testid="pair-new-device"
              onClick={generate}
            >
              <Plus className="size-3.5" />
              Pair a new device
            </Button>
          </>
        )}

        {/* ── Loading state ──────────────────────────────── */}
        {phase === 'loading' && (
          <div className="flex h-[272px] w-[272px] items-center justify-center rounded-xl border border-border bg-muted">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* ── QR code ────────────────────────────────────── */}
        {phase === 'ready' && data && (
          <>
            <div className="rounded-xl bg-white p-2">
              <img
                src={data.qrDataUrl}
                alt="QR code for Sero Remote login"
                width={256}
                height={256}
                className="block"
              />
            </div>

            <div className="w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Profile access</span>
                <span className="font-medium text-foreground">All workspaces</span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Access expires</span>
                <span className="font-medium text-foreground">
                  {expiresFormatted}
                </span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Valid for {data.expiryDays} day{data.expiryDays === 1 ? '' : 's'}.
              Once paired, this device can switch between any workspace in the profile, including ones created after pairing.
            </p>

            {/* ── Login URL + copy ─────────────────────────── */}
            <div className="w-full space-y-2">
              <div className="max-h-16 overflow-y-auto rounded-lg border border-border bg-muted px-3 py-2 text-sm leading-relaxed text-muted-foreground break-all">
                {data.loginUrl}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={handleCopy}
              >
                {copyFailed ? (
                  <span className="text-destructive">
                    Copy failed, select the URL above manually
                  </span>
                ) : copied ? (
                  <>
                    <Check className="size-3.5" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="size-3.5" />
                    Copy Login URL
                  </>
                )}
              </Button>
            </div>

            {/* ── Back to the list ──────────────────────────── */}
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-muted-foreground"
              onClick={backToList}
            >
              <ArrowLeft className="size-3.5" />
              Done
            </Button>
          </>
        )}

        {/* ── Error state ────────────────────────────────── */}
        {phase === 'error' && (
          <div className="flex h-[272px] w-[272px] flex-col items-center justify-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
            <p className="text-base text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={backToList}>
              Back
            </Button>
          </div>
        )}

        {/* ── Footer instructions ────────────────────────── */}
        {phase === 'ready' && (
        <p className="text-center text-sm leading-relaxed text-muted-foreground/70">
          Or paste the URL in your phone's browser.
          <br />
          The token auto-saves on the device and keeps profile-wide workspace access until it expires or you unpair it.
        </p>
        )}
      </div>
    </>
  );
}
