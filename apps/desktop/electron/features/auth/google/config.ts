import { readPluginConfig } from '@electron/features/plugin-config';

export const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
export const LOOPBACK = '127.0.0.1';
export const GOOGLE_PLUGIN_ID = 'sero-google-plugin';

export const SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/calendar',
].join(' ');

export interface GoogleCredentials {
  clientId: string;
  clientSecret: string;
}

export function getGoogleCredentials(): GoogleCredentials {
  const cfg = readPluginConfig(GOOGLE_PLUGIN_ID);
  const clientId = (cfg?.clientId as string) || process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = (cfg?.clientSecret as string) || process.env.GOOGLE_CLIENT_SECRET || '';
  return { clientId, clientSecret };
}
