interface ConnectionPanelProps {
  clientId: string;
  redirectUri: string;
  remoteOrigin: string;
  onClientIdChange: (value: string) => void;
  onRedirectUriChange: (value: string) => void;
  onConnect: () => void;
  connecting: boolean;
  error: string | null;
}

export function ConnectionPanel(props: ConnectionPanelProps) {
  const {
    clientId,
    redirectUri,
    remoteOrigin,
    onClientIdChange,
    onRedirectUriChange,
    onConnect,
    connecting,
    error,
  } = props;

  return (
    <div className="sp-connect-shell">
      <div className="sp-connect-card">
        <p className="sp-kicker">Spotify x Sero</p>
        <h1>Bring your music into Sero</h1>
        <p className="sp-muted">
          Connect once, then browse playlists, play tracks, and let Sero Agent build mixes for you.
        </p>

        <div className="sp-field-grid">
          <label>
            Spotify Client ID
            <input
              value={clientId}
              onChange={(event) => onClientIdChange(event.target.value)}
              placeholder="Paste from Spotify Developer Dashboard"
              autoComplete="off"
            />
          </label>

          <label>
            Redirect URI
            <input
              value={redirectUri}
              onChange={(event) => onRedirectUriChange(event.target.value)}
              placeholder={`${remoteOrigin}/spotify-auth-callback.html`}
              autoComplete="off"
            />
          </label>
        </div>

        <button
          className="sp-primary-button"
          onClick={onConnect}
          disabled={connecting || !clientId.trim() || !redirectUri.trim()}
        >
          {connecting ? 'Connecting…' : 'Connect Spotify'}
        </button>

        {error ? <p className="sp-error">{error}</p> : null}

        <ol className="sp-steps">
          <li>Create an app at developer.spotify.com/dashboard.</li>
          <li>Add the same Redirect URI shown above in the app settings.</li>
          <li>Enable users and playback scopes when asked by Spotify login.</li>
        </ol>
      </div>
    </div>
  );
}
