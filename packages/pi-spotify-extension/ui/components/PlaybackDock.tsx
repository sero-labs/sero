import { formatDuration } from '../lib/spotify-api';
import type { SpotifyTrack } from '../../shared/types';

interface PlaybackDockProps {
  ready: boolean;
  deviceName: string | null;
  track: SpotifyTrack | null;
  isPaused: boolean;
  positionMs: number;
  durationMs: number;
  onToggle: () => void;
  onNext: () => void;
  onPrevious: () => void;
}

export function PlaybackDock(props: PlaybackDockProps) {
  const {
    ready,
    deviceName,
    track,
    isPaused,
    positionMs,
    durationMs,
    onToggle,
    onNext,
    onPrevious,
  } = props;

  const progress = durationMs > 0 ? Math.min(100, (positionMs / durationMs) * 100) : 0;

  return (
    <footer className="sp-playback-dock">
      <div className="sp-dock-track">
        {track?.albumArtUrl ? <img src={track.albumArtUrl} alt="" /> : <div className="sp-image-fallback">♫</div>}
        <span>
          <strong>{track?.name ?? 'Nothing playing yet'}</strong>
          <small>{track ? track.artists.join(', ') : 'Select a playlist and press play'}</small>
        </span>
      </div>

      <div className="sp-dock-controls">
        <button className="sp-ghost-button" onClick={onPrevious}>◀◀</button>
        <button className="sp-primary-button" onClick={onToggle} disabled={!ready}>
          {isPaused ? 'Play' : 'Pause'}
        </button>
        <button className="sp-ghost-button" onClick={onNext}>▶▶</button>
      </div>

      <div className="sp-dock-meta">
        <p>{ready ? `Device: ${deviceName ?? 'Sero Player'}` : 'Web Playback SDK not ready'}</p>
        <div className="sp-progress-shell">
          <div className="sp-progress-bar" style={{ width: `${progress}%` }} />
        </div>
        <small>
          {formatDuration(positionMs)} / {formatDuration(durationMs)}
        </small>
      </div>
    </footer>
  );
}
