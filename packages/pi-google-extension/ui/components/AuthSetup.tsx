/**
 * AuthSetup — Google sign-in UI.
 *
 * Just a "Sign in with Google" button. Google's own account
 * chooser handles email selection in the browser.
 */

import { CheckCircle2, Loader2, LogIn, LogOut, AlertTriangle } from 'lucide-react';
import type { AuthInfo, GoogleApi } from '../hooks/useGoogleApi';

interface AuthSetupProps {
  auth: AuthInfo;
  google: GoogleApi;
}

export function AuthSetup({ auth, google }: AuthSetupProps) {
  // Authenticated — compact banner with sign-out
  if (auth.status === 'authenticated' && auth.email) {
    return (
      <div className="mx-2 mt-2 flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.03] px-3 py-1.5">
        <CheckCircle2 className="size-3.5 text-emerald-500" />
        <span className="flex-1 text-[11px] text-[var(--text-secondary)]">{auth.email}</span>
        <button
          onClick={google.signOut}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
        >
          <LogOut className="size-2.5" />
          Sign out
        </button>
      </div>
    );
  }

  // Signing in — spinner
  if (auth.status === 'signing-in') {
    return (
      <div className="mx-2 mt-2 flex items-center gap-2.5 rounded-lg border border-blue-500/20 bg-blue-500/[0.03] px-3 py-3">
        <Loader2 className="size-4 animate-spin text-blue-400" />
        <div>
          <p className="text-[12px] font-medium text-[var(--text-primary)]">Waiting for Google sign-in…</p>
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Complete the sign-in in your browser</p>
        </div>
      </div>
    );
  }

  // Not configured
  if (auth.status === 'not-configured') {
    return (
      <div className="mx-2 mt-2 rounded-lg border border-yellow-500/20 bg-yellow-500/[0.03] px-3 py-3">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-yellow-500" />
          <div>
            <p className="text-[12px] font-medium text-[var(--text-primary)]">Google OAuth not configured</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-muted)]">
              Set <code className="rounded bg-[var(--bg-base)] px-1 text-[10px]">GOOGLE_CLIENT_ID</code> and{' '}
              <code className="rounded bg-[var(--bg-base)] px-1 text-[10px]">GOOGLE_CLIENT_SECRET</code> in{' '}
              <code className="rounded bg-[var(--bg-base)] px-1 text-[10px]">~/.sero-ui/agent/.env</code>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Checking
  if (auth.status === 'checking') {
    return (
      <div className="mx-2 mt-2 flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 px-3 py-2.5">
        <Loader2 className="size-3.5 animate-spin text-[var(--text-muted)]" />
        <span className="text-[12px] text-[var(--text-muted)]">Checking…</span>
      </div>
    );
  }

  // Signed out — one button
  return (
    <div className="mx-2 mt-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 px-3 py-3">
      <div className="flex items-center gap-3">
        <GoogleLogo />
        <div className="flex-1">
          <p className="text-[12px] font-medium text-[var(--text-primary)]">Connect your Google account</p>
          <p className="text-[11px] text-[var(--text-muted)]">Access Gmail and Calendar</p>
        </div>
        <button
          onClick={() => google.signIn()}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)] active:scale-[0.98]"
        >
          <LogIn className="size-3.5" />
          Sign in with Google
        </button>
      </div>
      {auth.error && <p className="mt-2 text-[11px] text-red-400">{auth.error}</p>}
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 shrink-0" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}
