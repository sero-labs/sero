import type { SpotifyPlaylist, SpotifyUserProfile } from '../../shared/types';

interface PlaylistRailProps {
  profile: SpotifyUserProfile | null;
  playlists: SpotifyPlaylist[];
  selectedPlaylistId: string | null;
  onSelectPlaylist: (playlistId: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
  recommendationCount: number;
}

export function PlaylistRail(props: PlaylistRailProps) {
  const {
    profile,
    playlists,
    selectedPlaylistId,
    onSelectPlaylist,
    onRefresh,
    refreshing,
    recommendationCount,
  } = props;

  return (
    <aside className="sp-playlist-rail">
      <div className="sp-rail-head">
        <div>
          <p className="sp-kicker">Library</p>
          <h2>{profile?.displayName ?? 'Spotify'}</h2>
          <p className="sp-muted tiny">{playlists.length} playlists synced</p>
        </div>

        <button className="sp-ghost-button" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? 'Syncing…' : 'Sync'}
        </button>
      </div>

      <div className="sp-reco-pill">
        <span>Agent suggestions</span>
        <strong>{recommendationCount}</strong>
      </div>

      <div className="sp-playlist-list">
        {playlists.map((playlist) => {
          const selected = playlist.id === selectedPlaylistId;
          return (
            <button
              key={playlist.id}
              className={`sp-playlist-item ${selected ? 'selected' : ''}`}
              onClick={() => onSelectPlaylist(playlist.id)}
            >
              {playlist.imageUrl ? (
                <img src={playlist.imageUrl} alt="" loading="lazy" />
              ) : (
                <div className="sp-image-fallback">♫</div>
              )}

              <span>
                <strong>{playlist.name}</strong>
                <small>{playlist.totalTracks} tracks</small>
              </span>
            </button>
          );
        })}

        {playlists.length === 0 ? (
          <div className="sp-empty-block">
            <p>No playlists yet</p>
            <small>Create one in Spotify to start here.</small>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
