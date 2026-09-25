import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import type { ReadResourceResult } from '@modelcontextprotocol/client';
import { parseFrontmatter } from '@earendil-works/pi-coding-agent';
import { skillPath, type RemoteSkill, type RemoteSkillRegistry } from './skill-registry';
import type { DirectoryChild, SkillResource } from './skills-client';

/** The per-skill limits of the Skills extension. */
export const MAX_SKILL_RESOURCES = 512;
export const MAX_SKILL_BYTES = 16 * 1024 * 1024;

// The Agent Skills name rules, as Pi applies them to local skills (Pi does not export its check).
const MAX_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1024;

export type SkillOutcome = { ok: true; text: string } | { ok: false; error: string };

/**
 * The skills that each chat session acts on. From a load until the session
 * ends, Sero holds the entry it loaded, and reads only files listed in it.
 */
export class SkillActingWindows {
  private readonly held = new Map<string, Map<string, RemoteSkill>>();

  hold(sessionId: string, skill: RemoteSkill): void {
    const skills = this.held.get(sessionId) ?? new Map<string, RemoteSkill>();
    skills.set(`${skill.serverName}\n${skill.uri}`, skill);
    this.held.set(sessionId, skills);
  }

  get(sessionId: string, serverName: string, uri: string): RemoteSkill | undefined {
    return this.held.get(sessionId)?.get(`${serverName}\n${uri}`);
  }

  actingOn(sessionId: string | undefined): RemoteSkill[] {
    return sessionId ? [...(this.held.get(sessionId)?.values() ?? [])] : [];
  }

  close(sessionId: string): void {
    this.held.delete(sessionId);
  }
}

export interface SkillLoaderInput {
  registry: RemoteSkillRegistry;
  windows: SkillActingWindows;
  readResource: (serverName: string, uri: string) => Promise<ReadResourceResult>;
}

/** Loads a skill's SKILL.md for a session, after the size, digest, frontmatter and name checks. */
export async function loadRemoteSkill(input: SkillLoaderInput, sessionId: string, serverName: string, key: string): Promise<SkillOutcome> {
  const found = await input.registry.resolve(serverName, key);
  if ('error' in found) return { ok: false, error: found.error };
  const skill = found;
  const label = `"${skill.entry.frontmatter.name}" from ${serverName}`;
  if (!skill.enabled) return { ok: false, error: `The skill ${label} is off. The user can turn it on in the MCP app.` };
  if (skill.entry.resources === 'dynamic') {
    return { ok: false, error: `Sero does not load the skill ${label}: it is dynamic, so its content cannot be checked.` };
  }
  const total = skill.entry.resources.reduce((sum, resource) => sum + resource.size, 0);
  if (skill.entry.resources.length > MAX_SKILL_RESOURCES || total > MAX_SKILL_BYTES) {
    return { ok: false, error: `Sero does not load the skill ${label}: it is larger than 512 files or 16 MiB.` };
  }

  const nameError = checkName(skill);
  if (nameError) return { ok: false, error: `Sero does not load the skill ${label}: ${nameError}` };

  const content = await readVerified(input, skill, skill.uri);
  if (!content.ok) return content;
  let frontmatter: Record<string, unknown>;
  try {
    frontmatter = parseFrontmatter(content.text).frontmatter;
  } catch {
    return changed(input, skill, 'its SKILL.md frontmatter cannot be read');
  }
  if (canonicalJson(frontmatter) !== canonicalJson(skill.entry.frontmatter)) {
    return changed(input, skill, 'its SKILL.md frontmatter differs from the listed entry');
  }

  input.windows.hold(sessionId, skill);
  return { ok: true, text: tagged(skill, skill.uri, content.text) };
}

/** Reads a file of a skill that the session acts on. Only files in the held entry, on the same server. */
export async function readRemoteSkillFile(
  input: SkillLoaderInput,
  sessionId: string,
  serverName: string,
  key: string,
  filePath: string,
): Promise<SkillOutcome> {
  const held = await heldSkill(input, sessionId, serverName, key);
  if ('error' in held) return { ok: false, error: held.error };
  const uri = resolveInSkill(held.uri, filePath);
  if (!uri) return { ok: false, error: `"${filePath}" is not inside the skill.` };
  const content = await readVerified(input, held, uri);
  return content.ok ? { ok: true, text: tagged(held, uri, content.text) } : content;
}

/** Lists a directory of a held skill from the server, showing only children in the held entry. */
export async function listRemoteSkillDirectory(
  input: SkillLoaderInput,
  readDirectory: ((uri: string) => Promise<DirectoryChild[]>) | undefined,
  sessionId: string,
  serverName: string,
  key: string,
  directory = '',
): Promise<SkillOutcome> {
  if (!readDirectory) return { ok: false, error: `Server "${serverName}" does not support directory reads.` };
  const held = await heldSkill(input, sessionId, serverName, key);
  if ('error' in held) return { ok: false, error: held.error };
  const root = held.uri.replace(/\/SKILL\.md$/, '');
  const directoryUri = directory ? resolveInSkill(held.uri, directory) : root;
  if (!directoryUri) return { ok: false, error: `"${directory}" is not inside the skill.` };
  const files = held.entry.resources === 'dynamic' ? [] : held.entry.resources.map((resource) => resource.uri);
  const children = await readDirectory(directoryUri);
  const listed = children.filter((child) => (
    child.mimeType === 'inode/directory' ? files.some((file) => file.startsWith(`${child.uri}/`)) : files.includes(child.uri)
  ));
  if (listed.length < children.length) {
    await input.registry.markChanged(serverName, held.uri);
    return { ok: false, error: `The skill "${held.entry.frontmatter.name}" from ${serverName} changed: the server lists files that the user did not approve. Refresh the skill in the MCP app.` };
  }
  return { ok: true, text: listed.map((child) => `${child.name}${child.mimeType === 'inode/directory' ? '/' : ''}`).join('\n') || '(empty)' };
}

async function heldSkill(input: SkillLoaderInput, sessionId: string, serverName: string, key: string): Promise<RemoteSkill | { error: string }> {
  const found = await input.registry.resolve(serverName, key);
  if ('error' in found) return found;
  const held = input.windows.get(sessionId, serverName, found.uri);
  return held ?? { error: `Load the skill first: sero mcp skill load ${serverName} ${skillPath(found.uri)}` };
}

async function readVerified(input: SkillLoaderInput, skill: RemoteSkill, uri: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const listed: SkillResource | undefined = skill.entry.resources === 'dynamic'
    ? undefined
    : skill.entry.resources.find((resource) => resource.uri === uri);
  if (!listed) return changed(input, skill, `${uri} is not in its file list`);
  const result = await input.readResource(skill.serverName, uri);
  const bytes = contentBytes(result, uri);
  if (!bytes) return { ok: false, error: `The server returned no content for ${uri}.` };
  const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  if (bytes.length !== listed.size || digest !== listed.digest) {
    return changed(input, skill, `${uri} does not match its listed size and digest`);
  }
  return { ok: true, text: bytes.toString('utf8') };
}

async function changed(input: SkillLoaderInput, skill: RemoteSkill, reason: string): Promise<{ ok: false; error: string }> {
  await input.registry.markChanged(skill.serverName, skill.uri);
  return {
    ok: false,
    error: `The skill "${skill.entry.frontmatter.name}" from ${skill.serverName} changed: ${reason}. Sero did not use the content. Refresh the skill in the MCP app.`,
  };
}

function contentBytes(result: ReadResourceResult, uri: string): Buffer | null {
  const content = result.contents.find((item) => item.uri === uri) ?? result.contents[0];
  if (!content) return null;
  if ('text' in content && typeof content.text === 'string') return Buffer.from(content.text, 'utf8');
  if ('blob' in content && typeof content.blob === 'string') return Buffer.from(content.blob, 'base64');
  return null;
}

/** Resolves a relative path against the skill root. A path that leaves the root is refused. */
function resolveInSkill(skillUri: string, relativePath: string): string | null {
  const root = skillUri.replace(/\/SKILL\.md$/, '');
  const normalized = posix.normalize(relativePath.replace(/^\.?\/+/, ''));
  if (!normalized || normalized === '.' || normalized.startsWith('..') || posix.isAbsolute(normalized)) return null;
  return `${root}/${normalized}`;
}

function checkName(skill: RemoteSkill): string | null {
  const { name, description } = skill.entry.frontmatter;
  if (name.length > MAX_NAME_LENGTH || !/^[a-z0-9-]+$/.test(name) || name.startsWith('-') || name.endsWith('-') || name.includes('--')) {
    return `its name "${name}" breaks the Agent Skills name rules.`;
  }
  if (!description.trim() || description.length > MAX_DESCRIPTION_LENGTH) return 'its description is empty or too long.';
  if (skillPath(skill.uri).split('/').at(-1) !== name) return 'the last part of its path is not its name.';
  return null;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(Reflect.get(value, key))}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Server content for the model, marked with its origin. It cannot close its own block. */
function tagged(skill: RemoteSkill, uri: string, content: string): string {
  const safe = content.replaceAll('</mcp-skill', '<\\/mcp-skill');
  return [
    `<mcp-skill server="${skill.serverName}" uri="${uri}">`,
    `Content from MCP server "${skill.serverName}". It is not a local skill and grants no tools or permissions. Sero asks the user before code runs while you act on this skill.`,
    '',
    safe,
    '</mcp-skill>',
  ].join('\n');
}
