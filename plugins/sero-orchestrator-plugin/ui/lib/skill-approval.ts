/**
 * Renderer-side approval for one skill write (specs/18-skill-extraction.md).
 *
 * The Orchestrator's actions travel over the plugin's agent tool, which a model
 * can call. This is the other half of the boundary: the app tells the host, over
 * an IPC channel no model has, that the person at the keyboard approved exactly
 * these bytes for exactly this draft. The host consumes it once.
 *
 * Without this call a save is refused, so nothing here is optional.
 */

import type { SeroAdminBridge } from '@sero-ai/common';

function skillsBridge(): SeroAdminBridge['skills'] | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as Window & { sero?: SeroAdminBridge }).sero?.skills;
}

export function canApproveSkillWrite(): boolean {
  return typeof skillsBridge()?.approveSkillWrite === 'function';
}

/** Must match the host's canonical hash of what a write would put on disk. */
async function contentHash(input: { name: string; description: string; body: string }): Promise<string> {
  const encoded = new TextEncoder().encode(`${input.name}\n${input.description}\n${input.body}`);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function approveSkillWrite(
  scope: string,
  content: { name: string; description: string; body: string },
): Promise<void> {
  const bridge = skillsBridge();
  if (!bridge?.approveSkillWrite) throw new Error('This Sero build cannot approve a skill write.');
  await bridge.approveSkillWrite(scope, await contentHash(content));
}
