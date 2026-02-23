/**
 * Spotify Extension — agent tools for managing Spotify playback and playlists.
 */

import { StringEnum } from '@mariozechner/pi-ai';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Text } from '@mariozechner/pi-tui';
import { Type } from '@sinclair/typebox';

import {
  executeSpotifyAction,
  type SpotifyToolAction,
} from './lib/action-handlers';
import { readState, resolveStatePath } from './lib/state';

const ACTIONS = [
  'connection_status',
  'list_playlists',
  'search_tracks',
  'suggest_songs',
  'create_playlist',
  'add_tracks',
  'start_playlist',
  'pause_playback',
  'next_track',
  'previous_track',
] as const;

const SpotifyParams = Type.Object({
  action: StringEnum(ACTIONS),
  query: Type.Optional(Type.String({ description: 'Search query or vibe for recommendations' })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50 })),
  playlistId: Type.Optional(Type.String({ description: 'Spotify playlist ID' })),
  playlistName: Type.Optional(Type.String({ description: 'Name for a new playlist' })),
  playlistDescription: Type.Optional(Type.String({ description: 'Description for a new playlist' })),
  makePublic: Type.Optional(Type.Boolean({ description: 'Whether the new playlist is public' })),
  trackUris: Type.Optional(
    Type.Array(Type.String({ description: 'Spotify track URI, e.g. spotify:track:...' })),
  ),
  deviceId: Type.Optional(Type.String({ description: 'Spotify playback device ID' })),
});

export default function spotifyExtension(pi: ExtensionAPI): void {
  let statePath = '';

  pi.on('session_start', async (_event, ctx) => {
    statePath = resolveStatePath(ctx.cwd);
  });

  pi.on('session_switch', async (_event, ctx) => {
    statePath = resolveStatePath(ctx.cwd);
  });

  pi.registerTool({
    name: 'spotify',
    label: 'Spotify',
    description:
      'Control Spotify and manage playlists. Actions: connection_status, list_playlists, search_tracks, suggest_songs, create_playlist, add_tracks, start_playlist, pause_playback, next_track, previous_track.',
    parameters: SpotifyParams,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const resolvedPath = ctx ? resolveStatePath(ctx.cwd) : statePath;
      if (!resolvedPath) {
        return {
          content: [{ type: 'text', text: 'Error: no workspace context available' }],
          details: {},
          isError: true,
        };
      }

      statePath = resolvedPath;
      const state = await readState(statePath);

      return executeSpotifyAction({
        params: {
          action: params.action as SpotifyToolAction,
          query: params.query,
          limit: params.limit,
          playlistId: params.playlistId,
          playlistName: params.playlistName,
          playlistDescription: params.playlistDescription,
          makePublic: params.makePublic,
          trackUris: params.trackUris,
          deviceId: params.deviceId,
        },
        state,
        statePath,
      });
    },

    renderCall(args, theme) {
      let text = theme.fg('toolTitle', theme.bold('spotify '));
      text += theme.fg('muted', args.action);
      if (args.query) text += ` ${theme.fg('dim', `"${args.query}"`)}`;
      if (args.playlistName) text += ` ${theme.fg('accent', args.playlistName)}`;
      if (args.playlistId) text += ` ${theme.fg('dim', `#${args.playlistId}`)}`;
      return new Text(text, 0, 0);
    },

    renderResult(result, _options, theme) {
      const msg = result.content?.[0]?.type === 'text' ? result.content[0].text : '';
      if (msg.startsWith('Error:')) {
        return new Text(theme.fg('error', msg), 0, 0);
      }
      return new Text(theme.fg('success', '♫ ') + theme.fg('muted', msg), 0, 0);
    },
  });

  pi.registerCommand('spotify', {
    description: 'Check Spotify status and playlists',
    handler: async () => {
      pi.sendUserMessage(
        'Use the spotify tool with action connection_status. If connected, list my playlists and suggest_songs for "focused coding electronic".',
      );
    },
  });
}
