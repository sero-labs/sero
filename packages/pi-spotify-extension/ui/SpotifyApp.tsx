import { useCallback, useState } from 'react';
import { ConnectionPanel } from './components/ConnectionPanel';
import { ErrorBanner } from './components/ErrorBanner';
import { PlaybackDock } from './components/PlaybackDock';
import { PlaylistRail } from './components/PlaylistRail';
import { TrackGrid } from './components/TrackGrid';
import { useSpotifyController } from './lib/use-spotify-controller';
import './styles.css';

export function SpotifyApp() {
  const controller = useSpotifyController();
  const [dismissedErrors, setDismissedErrors] = useState<Set<string>>(() => new Set());

  const dismiss = useCallback((key: string) => {
    setDismissedErrors((prev) => new Set(prev).add(key));
  }, []);

  if (!controller.connected) {
    return (
      <ConnectionPanel
        clientId={controller.clientIdDraft}
        redirectUri={controller.redirectUriDraft}
        remoteOrigin={controller.remoteOrigin}
        onClientIdChange={controller.setClientIdDraft}
        onRedirectUriChange={controller.setRedirectUriDraft}
        onConnect={() => void controller.connectSpotify()}
        connecting={controller.connecting}
        error={controller.uiError}
      />
    );
  }

  // Player error is informational when it's just missing Widevine.
  const isPlayerInfoOnly =
    controller.player.error?.toLowerCase().includes('widevine') ||
    controller.player.error?.toLowerCase().includes('web playback sdk disabled');

  return (
    <div className="sp-root">
      <div
        className="sp-backdrop"
        style={controller.artBackdrop ? { backgroundImage: `url(${controller.artBackdrop})` } : undefined}
      />
      <div className="sp-gradient-mesh" />

      <main className="sp-shell">
        <PlaylistRail
          profile={controller.state.profile}
          playlists={controller.state.playlists}
          selectedPlaylistId={controller.state.selectedPlaylistId}
          onSelectPlaylist={controller.selectPlaylist}
          onRefresh={() => void controller.syncLibrary()}
          refreshing={controller.syncingLibrary}
          recommendationCount={controller.state.lastRecommendations.length}
        />

        <TrackGrid
          playlist={controller.selectedPlaylist}
          tracks={controller.selectedTracks}
          recommendations={controller.state.lastRecommendations}
          searchResults={controller.searchResults}
          searchQuery={controller.searchQuery}
          loadingTracks={controller.loadingTracks}
          searching={controller.searching}
          suggesting={controller.suggesting}
          onSearchQueryChange={controller.setSearchQuery}
          onSearch={() => void controller.runSearch()}
          onSuggest={() => void controller.runSuggest()}
          onPlayTrack={(trackUri) => void controller.playTrack(trackUri)}
          onPlayPlaylist={() => void controller.playSelectedPlaylist()}
          onAgentCreatePlaylist={controller.askAgentCreatePlaylist}
          onAgentSuggestSongs={controller.askAgentSuggestSongs}
        />
      </main>

      <div className="sp-error-stack">
        {controller.uiError && !dismissedErrors.has('ui') ? (
          <ErrorBanner
            variant="error"
            message={controller.uiError}
            onDismiss={() => dismiss('ui')}
          />
        ) : null}

        {controller.player.error && !dismissedErrors.has('player') ? (
          <ErrorBanner
            variant={isPlayerInfoOnly ? 'info' : 'error'}
            message={
              isPlayerInfoOnly
                ? 'In-app playback unavailable (Widevine DRM not found). Use Spotify desktop or mobile as the playback device instead.'
                : controller.player.error
            }
            onDismiss={() => dismiss('player')}
          />
        ) : null}
      </div>

      <PlaybackDock
        ready={controller.player.ready}
        deviceName={controller.state.playback.deviceName}
        track={controller.player.playback.track ?? controller.state.playback.currentTrack}
        isPaused={
          controller.player.playback.track
            ? controller.player.playback.isPaused
            : controller.state.playback.isPaused
        }
        positionMs={controller.player.playback.positionMs}
        durationMs={controller.player.playback.durationMs}
        onToggle={controller.togglePlayback}
        onNext={controller.nextTrack}
        onPrevious={controller.previousTrack}
      />
    </div>
  );
}

export default SpotifyApp;
