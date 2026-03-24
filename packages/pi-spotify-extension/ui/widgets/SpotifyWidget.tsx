/**
 * SpotifyWidget — mini player for the dashboard.
 *
 * Shows current track with album art, artist, progress bar,
 * and play/pause + skip controls. Animated gradient backdrop
 * pulses when playing.
 */

import { useAppState, useAgentPrompt } from '@sero-ai/app-runtime';
import type { SpotifyAppState } from '../../shared/types';

const DEFAULT_STATE: SpotifyAppState = {
  auth: { clientId: '', redirectUri: '', accessToken: null, refreshToken: null, expiresAt: null, scope: '', connectedAt: null },
  profile: null,
  playlists: [],
  selectedPlaylistId: null,
  tracksByPlaylist: {},
  playback: { deviceId: null, deviceName: null, isPaused: true, volumePercent: null, progressMs: 0, currentTrack: null, updatedAt: null },
  lastRecommendations: [],
  lastError: null,
  updatedAt: null,
};

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export function SpotifyWidget() {
  const [state] = useAppState<SpotifyAppState>(DEFAULT_STATE);
  const prompt = useAgentPrompt();

  const { playback, profile } = state;
  const track = playback.currentTrack;
  const isPlaying = !playback.isPaused && track !== null;
  const progress = track && track.durationMs > 0
    ? Math.min(100, (playback.progressMs / track.durationMs) * 100)
    : 0;

  const handleToggle = () => prompt('Toggle play/pause on Spotify');
  const handleNext = () => prompt('Skip to next track on Spotify');
  const handlePrev = () => prompt('Go to previous track on Spotify');

  if (!profile && !track) {
    return <NotConnected />;
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {/* ── Animated gradient backdrop ── */}
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          background: isPlaying
            ? 'linear-gradient(135deg, #1db954 0%, #191414 50%, #1db954 100%)'
            : 'linear-gradient(135deg, #191414 0%, #282828 100%)',
          backgroundSize: isPlaying ? '200% 200%' : '100% 100%',
          animation: isPlaying ? 'spotify-gradient 4s ease infinite' : 'none',
        }}
      />

      <div className="relative flex min-h-0 flex-1 flex-col p-3">
        {track ? (
          <>
            {/* ── Track info ── */}
            <div className="flex items-center gap-2.5">
              {/* Album art */}
              <div className="relative size-12 shrink-0 overflow-hidden rounded-md shadow-lg">
                {track.albumArtUrl ? (
                  <img
                    src={track.albumArtUrl}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center bg-[#282828] text-lg">
                    ♫
                  </div>
                )}
                {/* Playing indicator dot */}
                {isPlaying && (
                  <div
                    className="absolute bottom-0.5 right-0.5 size-2 rounded-full bg-[#1db954]"
                    style={{ boxShadow: '0 0 6px rgba(29, 185, 84, 0.6)' }}
                  />
                )}
              </div>

              {/* Title + artist */}
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-[var(--text-primary)]">
                  {track.name}
                </div>
                <div className="truncate text-[10px] text-[var(--text-muted)]">
                  {track.artists.join(', ')}
                </div>
                <div className="truncate text-[9px] text-[var(--text-muted)] opacity-60">
                  {track.albumName}
                </div>
              </div>
            </div>

            {/* ── Progress bar ── */}
            <div className="mt-2 flex items-center gap-1.5">
              <span className="w-7 text-right text-[9px] tabular-nums text-[var(--text-muted)]">
                {formatMs(playback.progressMs)}
              </span>
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-[#1db954] transition-[width] duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="w-7 text-[9px] tabular-nums text-[var(--text-muted)]">
                {formatMs(track.durationMs)}
              </span>
            </div>

            {/* ── Controls ── */}
            <div className="mt-auto flex items-center justify-center gap-4 pt-2">
              <ControlButton label="Previous" onClick={handlePrev}>
                ◀◀
              </ControlButton>
              <button
                onClick={handleToggle}
                className="flex size-8 items-center justify-center rounded-full bg-[#1db954] text-sm font-bold text-black transition-transform hover:scale-105 active:scale-95"
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? '❚❚' : '▶'}
              </button>
              <ControlButton label="Next" onClick={handleNext}>
                ▶▶
              </ControlButton>
            </div>
          </>
        ) : (
          <IdlePlayer profileName={profile?.displayName} />
        )}
      </div>

      {/* Inline keyframes for gradient animation */}
      <style>{`
        @keyframes spotify-gradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>
    </div>
  );
}

function ControlButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
    >
      {children}
    </button>
  );
}

function IdlePlayer({ profileName }: { profileName?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2">
      <div
        className="flex size-10 items-center justify-center rounded-full"
        style={{ backgroundColor: 'rgba(29, 185, 84, 0.15)' }}
      >
        <span className="text-lg">♫</span>
      </div>
      <span className="text-xs text-[var(--text-muted)]">
        {profileName ? `Hi, ${profileName}` : 'Nothing playing'}
      </span>
      <span className="text-[10px] text-[var(--text-muted)] opacity-60">
        Play a track to see it here
      </span>
    </div>
  );
}

function NotConnected() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-3">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1db954]/20 to-[#191414]/40">
        <span className="text-xl">♫</span>
      </div>
      <span className="text-xs text-[var(--text-muted)]">Spotify not connected</span>
      <span className="text-[10px] text-[var(--text-muted)] opacity-60">
        Open the Spotify app to connect
      </span>
    </div>
  );
}

export default SpotifyWidget;
