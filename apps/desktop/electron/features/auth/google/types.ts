export interface GoogleAuthStatus {
  configured: boolean;
  authenticated: boolean;
  email?: string;
}

export interface GoogleAuthProgress {
  type: 'browser' | 'waiting' | 'success' | 'error';
  message: string;
  email?: string;
}

export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}
