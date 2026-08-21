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

/**
 * The approved write: the content AND whether it may replace an existing skill.
 *
 * Must match the host's `skillContentHash` byte for byte — same fields, same
 * order, same JSON framing.
 */
export interface ApprovedSkillWrite {
  name: string;
  description: string;
  body: string;
  overwrite?: boolean;
}

async function contentHash(input: ApprovedSkillWrite): Promise<string> {
  const canonical = JSON.stringify([input.name, input.description, input.body, input.overwrite === true]);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function approveSkillWrite(scope: string, content: ApprovedSkillWrite): Promise<void> {
  const bridge = skillsBridge();
  if (!bridge?.approveSkillWrite) throw new Error('This Sero build cannot approve a skill write.');
  await bridge.approveSkillWrite(scope, await contentHash(content));
}
