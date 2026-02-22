export interface SpotifyAuthState {
  clientId: string;
  redirectUri: string;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: string | null;
  scope: string;
  connectedAt: string | null;
}

export interface SpotifyUserProfile {
  id: string;
  displayName: string;
  email: string | null;
  imageUrl: string | null;
  product: string | null;
  country: string | null;
}

export interface SpotifyTrack {
  id: string;
  uri: string;
  name: string;
  artists: string[];
  albumName: string;
  albumArtUrl: string | null;
  durationMs: number;
  explicit: boolean;
  previewUrl: string | null;
}

export interface SpotifyPlaylist {
  id: string;
  uri: string;
  name: string;
  description: string;
  imageUrl: string | null;
  ownerName: string;
  totalTracks: number;
  snapshotId: string | null;
}

export interface SpotifyPlaybackState {
  deviceId: string | null;
  deviceName: string | null;
  isPaused: boolean;
  volumePercent: number | null;
  progressMs: number;
  currentTrack: SpotifyTrack | null;
  updatedAt: string | null;
}

export interface SpotifyAppState {
  auth: SpotifyAuthState;
  profile: SpotifyUserProfile | null;
  playlists: SpotifyPlaylist[];
  selectedPlaylistId: string | null;
  tracksByPlaylist: Record<string, SpotifyTrack[]>;
  playback: SpotifyPlaybackState;
  lastRecommendations: SpotifyTrack[];
  lastError: string | null;
  updatedAt: string | null;
}

export const DEFAULT_STATE: SpotifyAppState = {
  auth: {
    clientId: '',
    redirectUri: '',
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
    scope: '',
    connectedAt: null,
  },
  profile: null,
  playlists: [],
  selectedPlaylistId: null,
  tracksByPlaylist: {},
  playback: {
    deviceId: null,
    deviceName: null,
    isPaused: true,
    volumePercent: null,
    progressMs: 0,
    currentTrack: null,
    updatedAt: null,
  },
  lastRecommendations: [],
  lastError: null,
  updatedAt: null,
};
