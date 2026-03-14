/**
 * ConnectDeviceDialog — generates and displays a QR code for pairing
 * a remote device (phone/tablet) with Sero over Tailscale or LAN.
 *
 * Flow:
 *   1. User opens this dialog (e.g. via ⌘K → "Connect Device")
 *   2. The dialog calls the main process to create a time-limited web token
 *   3. A QR code + login URL are shown
 *   4. User scans the QR on their device → web-remote auto-connects
 *
 * The manual token entry in the web-remote AuthScreen remains available
 * for same-machine development where camera scanning isn't possible.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, Loader2, QrCode, RefreshCw } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@sero/ui/components/ui/dialog';
import { Button } from '@sero/ui/components/ui/button';
import type { QrLoginData } from '@/types/ipc';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Phase = 'idle' | 'loading' | 'ready' | 'error';

export function ConnectDeviceDialog({ open, onOpenChange }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [data, setData] = useState<QrLoginData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generate = useCallback(async () => {
    setPhase('loading');
    setError(null);
    setCopied(false);
    try {
      const result = await window.sero.gateway.getQrLoginData(7);
      setData(result);
      setPhase('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate QR code');
      setPhase('error');
    }
  }, []);

  // Generate QR data when the dialog opens. The parent controls `open`
  // via props, so onOpenChange(true) is never called by radix — we need
  // an effect to detect the open→true transition. (IPC init — valid useEffect.)
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      generate();
    }
    if (!open && wasOpen.current) {
      // Reset on close so next open starts fresh
      setPhase('idle');
      setData(null);
      setError(null);
      setCopied(false);
    }
    wasOpen.current = open;
  }, [open, generate]);

  const handleCopy = useCallback(async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.loginUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may fail in some contexts
    }
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="size-5" />
            Connect Device
          </DialogTitle>
          <DialogDescription>
            Scan this QR code with your phone to open Sero Remote.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
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

              <p className="text-xs text-muted-foreground">
                Valid for {data.expiryDays} day{data.expiryDays === 1 ? '' : 's'}
                {' — expires '}
                {expiresFormatted}
              </p>

              {/* ── Login URL + copy ─────────────────────────── */}
              <div className="w-full space-y-2">
                <div className="max-h-16 overflow-y-auto rounded-lg border border-border bg-muted px-3 py-2 text-[11px] leading-relaxed text-muted-foreground break-all">
                  {data.loginUrl}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={handleCopy}
                >
                  {copied ? (
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

              {/* ── Regenerate ────────────────────────────────── */}
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 text-muted-foreground"
                onClick={generate}
              >
                <RefreshCw className="size-3.5" />
                Generate New Code
              </Button>
            </>
          )}

          {/* ── Error state ────────────────────────────────── */}
          {phase === 'error' && (
            <div className="flex h-[272px] w-[272px] flex-col items-center justify-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" size="sm" onClick={generate}>
                Retry
              </Button>
            </div>
          )}

          {/* ── Footer instructions ────────────────────────── */}
          <p className="text-center text-[11px] leading-relaxed text-muted-foreground/70">
            Or paste the URL in your phone's browser.
            <br />
            The token auto-saves on the device and won't need re-entry
            until it expires.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
