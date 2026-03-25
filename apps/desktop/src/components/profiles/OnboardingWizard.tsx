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

import { useCallback, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@sero-ai/ui/components/ui/dialog';
import { Button } from '@sero-ai/ui/components/ui/button';
import { KeyRound } from 'lucide-react';
import { AuthLoginDialog } from '@/components/layout/AuthLoginDialog';
import { useSessionStore } from '@/stores/sessions';
import { useAgentStore } from '@/stores/agent';
import { useAppStore } from '@/stores/app';

type Phase = 'checking' | 'auth' | 'launching' | 'done';

export function OnboardingWizard() {
  const [phase, setPhase] = useState<Phase>('checking');
  const [showLoginDialog, setShowLoginDialog] = useState(false);

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
          // Auth present (copied at creation) → launch memory setup
          launchMemorySession();
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
    setPhase('launching');
    try {
      const session = await useSessionStore.getState().createSession('global');
      useSessionStore.getState().setActiveSession(session.id);
      await useSessionStore.getState().renameSession(session.id, 'Welcome');
      await window.sero.agent.open(session.id, session.path, 'global');
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
      } else {
        // Non-auth error — mark done so we don't loop
        await window.sero.profiles.markOnboardingDone();
        setPhase('done');
      }
    }
  }, []);

  // ── Auth completed → launch memory session ──────────────────
  const handleLoginComplete = useCallback(() => {
    setShowLoginDialog(false);
    launchMemorySession();
  }, [launchMemorySession]);

  // ── Auth skipped → launch memory session anyway ─────────────
  const handleSkipAuth = useCallback(() => {
    launchMemorySession();
  }, [launchMemorySession]);

  // Nothing to show
  if (phase === 'checking' || phase === 'launching' || phase === 'done') return null;

  return (
    <>
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

      <AuthLoginDialog
        open={showLoginDialog}
        onOpenChange={setShowLoginDialog}
        onComplete={handleLoginComplete}
      />
    </>
  );
}
