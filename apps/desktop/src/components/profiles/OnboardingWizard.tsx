/**
 * OnboardingWizard — new-profile first-run flow.
 *
 * Two concerns, handled differently:
 *
 * 1. **Auth** (UI) — if no provider credentials exist, show the auth
 *    dialog. The agent can't run without auth, so this must be a modal
 *    gate. Cancelling does NOT mark onboarding complete — it shows again
 *    on next launch.
 *
 * 2. **Memory setup** (agentic) — once auth is ready, auto-create a
 *    session and let the agent handle it conversationally. The memory
 *    extension's bootstrap instructions inject automatically (triggered
 *    by MEMORY.md not existing). The questionnaire tool is forced to
 *    use exactly the predefined questions via globalThis override.
 *    Completion is detected by the memory extension writing MEMORY.md.
 *
 * The `.onboarding-complete` marker is written once:
 *   - Auth is configured (or was already present from credential copy)
 *   - AND the memory session has been launched (the agent takes it from here)
 *
 * If the user quits before the agent finishes writing MEMORY.md, the
 * bootstrap instructions still inject into the next session — the agent
 * picks up naturally. No wizard needed again.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@sero-ai/ui/components/ui/dialog';
import { Button } from '@sero-ai/ui/components/ui/button';
import { KeyRound, Loader2, TriangleAlert } from 'lucide-react';
import { AuthLoginDialog } from '@/components/layout/AuthLoginDialog';
import { TierPicker } from './TierPicker';
import type { ModelTierSettings } from '@/types/ipc';
import { useSessionStore } from '@/stores/sessions';
import { useAgentStore } from '@/stores/agent';
import { useAppStore } from '@/stores/app';
import { useUserFeedbackStore } from '@/stores/user-feedback-store';

type Phase = 'checking' | 'auth' | 'tiers' | 'launching' | 'error' | 'done';

export function OnboardingWizard() {
  const [phase, setPhase] = useState<Phase>('checking');
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hideLaunchingDialogRef = useRef(false);
  const hasPendingUserInput = useUserFeedbackStore((s) => s.pending.size > 0);

  if (phase === 'launching' && hasPendingUserInput) {
    hideLaunchingDialogRef.current = true;
  }

  // ── Initial check ───────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'checking') return;
    let cancelled = false;

    (async () => {
      try {
        const needed = await window.sero.profiles.needsOnboarding();
        if (cancelled || !needed) { setPhase('done'); return; }

        const providers = await window.sero.auth.getProviders();
        if (cancelled) return;

        // Only count profile-local credentials, not inherited env vars
        const hasAuth = providers.oauth.some((p) => p.isLoggedIn)
          || providers.apiKey.some((p) => p.hasKey && !p.fromEnv);

        if (hasAuth) {
          // Auth present — check if tiers are configured
          const tiers = await window.sero.modelTiers.get();
          if (Object.keys(tiers).length > 0) {
            launchMemorySession();
          } else {
            setPhase('tiers');
          }
        } else {
          setPhase('auth');
        }
      } catch {
        setPhase('done');
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ── Launch the agentic memory session ───────────────────────
  const launchMemorySession = useCallback(async () => {
    hideLaunchingDialogRef.current = false;
    setErrorMessage(null);
    setPhase('launching');
    try {
      const session = await useSessionStore.getState().createSession('global');
      useSessionStore.getState().setActiveSession(session.id);
      await window.sero.agent.open(session.id, session.path, 'global');
      await useSessionStore.getState().renameSession(session.id, 'Welcome');
      useAgentStore.getState().focusSession(session.id);
      useAppStore.getState().setChatPanelOpen(true);

      // Await the prompt — if auth fails, we catch it and show the auth dialog
      await window.sero.agent.prompt(
        session.id,
        "Hey! I'm new here — set up my memory so you can get to know me.",
      );

      // Prompt completed successfully → mark onboarding done
      await window.sero.profiles.markOnboardingDone();
      setPhase('done');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[onboarding] Memory prompt failed:', msg);

      if (msg.includes('Authentication failed') || msg.includes('authentication') || msg.includes('unauthorized') || msg.includes('401') || msg.includes('No API key') || msg.includes('credentials')) {
        // Copied credentials were invalid/expired → show auth dialog
        setPhase('auth');
        return;
      }

      setErrorMessage(msg);
      setPhase('error');
    }
  }, []);

  // ── Auth completed → launch memory session ──────────────────
  const handleLoginComplete = useCallback(() => {
    setShowLoginDialog(false);
    setPhase('tiers');
  }, []);

  // ── Auth skipped → launch memory session anyway ─────────────
  const handleSkipAuth = useCallback(() => {
    setPhase('tiers');
  }, []);

  const handleTierComplete = useCallback(async (tiers: ModelTierSettings) => {
    try {
      await window.sero.modelTiers.set(tiers);
    } catch (err) {
      console.warn('[onboarding] Failed to save model tiers:', err);
    }
    launchMemorySession();
  }, [launchMemorySession]);

  const handleTierSkip = useCallback(() => {
    launchMemorySession();
  }, [launchMemorySession]);

  // Nothing to show
  if (phase === 'checking' || phase === 'done') return null;

  return (
    <>
      <Dialog
        open={phase === 'launching' && !hideLaunchingDialogRef.current}
        onOpenChange={() => {/* prevent close via overlay/escape */}}
      >
        <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-[var(--bg-elevated)]">
              <Loader2 className="size-5 animate-spin text-[var(--status-success)]" />
            </div>
            <DialogTitle>Setting up your memory</DialogTitle>
            <DialogDescription>
              Sero is opening a welcome session and starting the memory setup flow.
              This should only take a moment.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      <Dialog open={phase === 'tiers'} onOpenChange={() => {/* prevent close */}}>
        <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Choose your default models</DialogTitle>
            <DialogDescription>
              Pick which models to use for different task complexities.
              You can change these anytime in settings.
            </DialogDescription>
          </DialogHeader>
          <TierPicker onComplete={handleTierComplete} onSkip={handleTierSkip} />
        </DialogContent>
      </Dialog>

      <Dialog open={phase === 'auth'} onOpenChange={() => {/* prevent close via overlay/escape */}}>
        <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-[var(--bg-elevated)]">
              <KeyRound className="size-5 text-[var(--status-success)]" />
            </div>
            <DialogTitle>Welcome to Sero</DialogTitle>
            <DialogDescription>
              Sign in to a model provider so the AI agent can work.
              You can add more providers later in settings.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 pt-1">
            <Button onClick={() => setShowLoginDialog(true)} variant="outline" className="w-full">
              <KeyRound className="mr-2 size-3.5" />
              Sign in to a provider
            </Button>
          </div>

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={handleSkipAuth}>
              Skip for now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={phase === 'error'} onOpenChange={() => {/* prevent close via overlay/escape */}}>
        <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-[var(--bg-elevated)]">
              <TriangleAlert className="size-5 text-[var(--status-warning)]" />
            </div>
            <DialogTitle>Memory setup couldn't start</DialogTitle>
            <DialogDescription>
              Sero hit an error while opening the welcome session for memory setup.
            </DialogDescription>
          </DialogHeader>

          {errorMessage ? (
            <div className="rounded-md border border-[var(--border-default)] bg-[var(--bg-elevated)] px-3 py-2 text-xs text-[var(--text-secondary)]">
              {errorMessage}
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setPhase('done')}>
              Continue for now
            </Button>
            <Button size="sm" onClick={() => void launchMemorySession()}>
              Retry setup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AuthLoginDialog
        open={showLoginDialog}
        onOpenChange={setShowLoginDialog}
        onComplete={handleLoginComplete}
      />
    </>
  );
}
