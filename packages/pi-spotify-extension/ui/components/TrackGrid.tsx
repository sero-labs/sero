import type { SpotifyPlaylist, SpotifyTrack } from '../../shared/types';
import { formatDuration } from '../lib/spotify-api';

interface TrackGridProps {
  playlist: SpotifyPlaylist | null;
  tracks: SpotifyTrack[];
  recommendations: SpotifyTrack[];
  searchResults: SpotifyTrack[];
  searchQuery: string;
  loadingTracks: boolean;
  searching: boolean;
  suggesting: boolean;
  onSearchQueryChange: (value: string) => void;
  onSearch: () => void;
  onSuggest: () => void;
  onPlayTrack: (trackUri: string) => void;
  onPlayPlaylist: () => void;
  onAgentCreatePlaylist: () => void;
  onAgentSuggestSongs: () => void;
}

export function TrackGrid(props: TrackGridProps) {
  const {
    playlist,
    tracks,
    recommendations,
    searchResults,
    searchQuery,
    loadingTracks,
    searching,
    suggesting,
    onSearchQueryChange,
    onSearch,
    onSuggest,
    onPlayTrack,
    onPlayPlaylist,
    onAgentCreatePlaylist,
    onAgentSuggestSongs,
  } = props;

  return (
    <section className="sp-main-panel">
      <header className="sp-main-head">
        <div>
          <p className="sp-kicker">Now Browsing</p>
          <h1>{playlist?.name ?? 'Select a playlist'}</h1>
          <p className="sp-muted">
            {playlist
              ? `${playlist.totalTracks} tracks · ${playlist.ownerName}`
              : 'Pick a playlist from the left rail to start playback.'}
          </p>
        </div>

        <div className="sp-main-actions">
          <button className="sp-primary-button" onClick={onPlayPlaylist} disabled={!playlist}>
            Play Playlist
          </button>
          <button className="sp-ghost-button" onClick={onAgentCreatePlaylist}>
            Agent: Make Playlist
          </button>
          <button className="sp-ghost-button" onClick={onAgentSuggestSongs}>
            Agent: Suggest Songs
          </button>
        </div>
      </header>

      <div className="sp-search-row">
        <input
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder="Search tracks, artists, moods"
        />
        <button className="sp-ghost-button" onClick={onSearch} disabled={searching || !searchQuery.trim()}>
          {searching ? 'Searching…' : 'Search'}
        </button>
        <button className="sp-ghost-button" onClick={onSuggest} disabled={suggesting || !searchQuery.trim()}>
          {suggesting ? 'Thinking…' : 'Suggest from vibe'}
        </button>
      </div>

      <div className="sp-grid-layout">
        <div className="sp-track-column">
          <div className="sp-section-head">
            <h3>Playlist Tracks</h3>
            {loadingTracks ? <small>Loading…</small> : <small>{tracks.length} tracks</small>}
          </div>
          <div className="sp-track-list">
            {tracks.map((track) => (
              <TrackCard
                key={track.uri}
                track={track}
                onPlay={() => onPlayTrack(track.uri)}
              />
            ))}
            {!loadingTracks && tracks.length === 0 ? (
              <EmptyMessage text="No tracks loaded for this playlist yet." />
            ) : null}
          </div>
        </div>

        <div className="sp-side-column">
          <section>
            <div className="sp-section-head">
              <h3>Search Results</h3>
              <small>{searchResults.length}</small>
            </div>
            <div className="sp-mini-list">
              {searchResults.slice(0, 8).map((track) => (
                <MiniRow key={`search-${track.uri}`} track={track} onPlay={() => onPlayTrack(track.uri)} />
              ))}
              {searchResults.length === 0 ? <EmptyMessage text="Search to quickly jump to any song." /> : null}
            </div>
          </section>

          <section>
            <div className="sp-section-head">
              <h3>Recommendations</h3>
              <small>{recommendations.length}</small>
            </div>
            <div className="sp-mini-list">
              {recommendations.slice(0, 8).map((track) => (
                <MiniRow key={`reco-${track.uri}`} track={track} onPlay={() => onPlayTrack(track.uri)} />
              ))}
              {recommendations.length === 0 ? <EmptyMessage text="Use “Suggest from vibe” for tailored picks." /> : null}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}

function TrackCard({ track, onPlay }: { track: SpotifyTrack; onPlay: () => void }) {
  return (
    <button className="sp-track-card" onClick={onPlay}>
      {track.albumArtUrl ? <img src={track.albumArtUrl} alt="" loading="lazy" /> : <div className="sp-image-fallback">♪</div>}
      <span>
        <strong>{track.name}</strong>
        <small>{track.artists.join(', ')}</small>
      </span>
      <em>{formatDuration(track.durationMs)}</em>
    </button>
  );
}

function MiniRow({ track, onPlay }: { track: SpotifyTrack; onPlay: () => void }) {
  return (
    <button className="sp-mini-row" onClick={onPlay}>
      {track.albumArtUrl ? <img src={track.albumArtUrl} alt="" loading="lazy" /> : <div className="sp-image-fallback mini">♪</div>}
      <span>
        <strong>{track.name}</strong>
        <small>{track.artists.join(', ')}</small>
      </span>
    </button>
  );
}

function EmptyMessage({ text }: { text: string }) {
  return (
    <div className="sp-empty-block compact">
      <small>{text}</small>
    </div>
  );
}
