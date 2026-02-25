/**
 * CLI commands for the artifact registry.
 *
 * Allows agents to list and manage verification artifacts (screenshots,
 * logs, videos) collected during agent sessions.
 */

import { artifactRegistry } from '../../ipc/shared-infra';
import type { CliRegistry } from '../registry';
import type { CliCommandContext } from '../types';
import { fail, ok, parseFlags, requireFlagString } from './utils';

async function handleArtifacts(args: string[], ctx: CliCommandContext) {
  const [action, ...rest] = args;

  try {
    switch (action) {
      case 'list': {
        const { flags } = parseFlags(rest);
        const sessionId = requireFlagString(flags, 'session') ?? undefined;
        const artifacts = artifactRegistry.list(sessionId);
        if (artifacts.length === 0) return ok('No artifacts recorded.');
        return ok(
          artifacts
            .map(
              (a) =>
                `${a.id} [${a.type}] ${a.title} (${a.timestamp})` +
                (a.containerPath ? ` — ${a.containerPath}` : ''),
            )
            .join('\n'),
        );
      }

      case 'save': {
        const { flags } = parseFlags(rest);
        const title = requireFlagString(flags, 'title');
        const type = requireFlagString(flags, 'type') as
          | 'screenshot'
          | 'log'
          | 'video'
          | null;
        const containerPath = requireFlagString(flags, 'path') ?? undefined;

        if (!title || !type) {
          return fail(
            'Usage: sero artifacts save --title <title> --type <screenshot|log|video> [--path <container-path>]',
          );
        }

        if (!['screenshot', 'log', 'video'].includes(type)) {
          return fail(`Invalid type: ${type}. Must be screenshot, log, or video.`);
        }

        const mimeMap: Record<string, string> = {
          screenshot: 'image/png',
          log: 'text/plain',
          video: 'video/webm',
        };

        const artifact = artifactRegistry.add({
          sessionId: ctx.invocation.sessionId ?? 'unknown',
          workspaceId: ctx.workspaceId,
          type,
          title,
          containerPath,
          mimeType: mimeMap[type] ?? 'application/octet-stream',
        });

        return ok(`Artifact saved: ${artifact.title} (${artifact.id})`);
      }

      case 'remove': {
        const artifactId = rest[0];
        if (!artifactId) return fail('Usage: sero artifacts remove <id>');
        const removed = artifactRegistry.remove(artifactId);
        if (!removed) return fail(`Artifact not found: ${artifactId}`);
        return ok(`Removed artifact: ${artifactId}`);
      }

      case 'summary': {
        const { flags } = parseFlags(rest);
        const sessionId =
          requireFlagString(flags, 'session') ??
          ctx.invocation.sessionId ??
          undefined;
        if (!sessionId) return fail('Usage: sero artifacts summary --session <id>');
        const summary = artifactRegistry.buildPrSummary(sessionId);
        if (!summary) return ok('No artifacts to summarize.');
        return ok(summary);
      }

      default:
        return fail('Usage: sero artifacts <list|save|remove|summary>');
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Artifacts command failed';
    return fail(message);
  }
}

export function registerArtifactCliCommands(registry: CliRegistry): void {
  registry.register({
    name: 'artifacts',
    summary: 'Manage agent verification artifacts (list, save, remove, summary)',
    help:
      'artifacts — Agent verification artifacts\n\n' +
      'Usage: sero artifacts <action> [args]\n\n' +
      'Actions:\n' +
      '  list [--session <id>]               — List all artifacts\n' +
      '  save --title <t> --type <type> [--path <p>] — Save an artifact\n' +
      '  remove <id>                         — Remove an artifact\n' +
      '  summary [--session <id>]            — Generate PR summary\n',
    source: 'ipc',
    group: 'Artifacts',
    execute: handleArtifacts,
  });
}
