import { createHash } from 'node:crypto';
import { createJsonFile } from '../state/json-file';
import { getMcpSkillsPath } from '../state/paths';
import type { SkillEntry } from './skills-client';

/** A skill that a server serves. Its identity is the server label and the URI, never the URI alone. */
export interface RemoteSkill {
  serverName: string;
  uri: string;
  entry: SkillEntry;
  /** The digest of the entry's file list: every URI and digest. "dynamic" for a dynamic skill. */
  manifestDigest: string;
  /** Off until the user turns the skill on. */
  enabled: boolean;
  /** True after the file list changed or a read failed verification. */
  changed: boolean;
  refreshedAt: string;
}

/** An approval to run code for one skill. It holds only for the manifest that the user approved. */
interface SkillApproval {
  serverName: string;
  uri: string;
  manifestDigest: string;
}

interface SkillsFile {
  version: 1;
  skills: RemoteSkill[];
  approvals: SkillApproval[];
}

export function computeManifestDigest(entry: SkillEntry): string {
  if (entry.resources === 'dynamic') return 'dynamic';
  const lines = entry.resources.map((resource) => `${resource.uri} ${resource.digest}`).sort();
  return `sha256:${createHash('sha256').update(lines.join('\n')).digest('hex')}`;
}

/** The path that tells same-name skills of one server apart: the URI without scheme and `/SKILL.md`. */
export function skillPath(uri: string): string {
  return uri.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/\/SKILL\.md$/, '');
}

const same = (skill: { serverName: string; uri: string }, serverName: string, uri: string) =>
  skill.serverName === serverName && skill.uri === uri;

/** The remote skills of every server, with enablement and approvals, in `skills.json`. */
export class RemoteSkillRegistry {
  private readonly file;

  constructor(filePath = getMcpSkillsPath()) {
    this.file = createJsonFile<SkillsFile>(filePath, readSkillsFile);
  }

  async list(): Promise<RemoteSkill[]> {
    return (await this.file.read()).skills;
  }

  async get(serverName: string, uri: string): Promise<RemoteSkill | undefined> {
    return (await this.list()).find((skill) => same(skill, serverName, uri));
  }

  /**
   * Takes a server's listing. A new skill starts off. A skill with a changed file list
   * loses its approval. A skill missing from the listing is kept only if `getSkill` still finds it.
   */
  async refresh(serverName: string, listed: SkillEntry[], getSkill: (uri: string) => Promise<SkillEntry | null>): Promise<void> {
    const current = (await this.list()).filter((skill) => skill.serverName === serverName);
    const entries = new Map(listed.map((entry) => [entry.uri, entry]));
    for (const skill of current) {
      if (!entries.has(skill.uri)) {
        const entry = await getSkill(skill.uri);
        if (entry) entries.set(skill.uri, entry);
      }
    }
    const now = new Date().toISOString();
    await this.file.update((file) => {
      const others = file.skills.filter((skill) => skill.serverName !== serverName);
      const revoked = new Set<string>();
      const refreshed = [...entries.values()].map((entry): RemoteSkill => {
        const previous = file.skills.find((skill) => same(skill, serverName, entry.uri));
        const manifestDigest = computeManifestDigest(entry);
        const changed = previous !== undefined && previous.manifestDigest !== manifestDigest;
        if (changed) revoked.add(entry.uri);
        return {
          serverName,
          uri: entry.uri,
          entry,
          manifestDigest,
          enabled: previous?.enabled ?? false,
          changed: changed || (previous?.changed ?? false),
          refreshedAt: now,
        };
      });
      const approvals = file.approvals.filter((approval) => (
        approval.serverName !== serverName || (entries.has(approval.uri) && !revoked.has(approval.uri))
      ));
      return { value: { version: 1, skills: [...others, ...refreshed], approvals }, result: undefined };
    });
  }

  setEnabled(serverName: string, uri: string, enabled: boolean): Promise<RemoteSkill | undefined> {
    return this.change(serverName, uri, (skill) => ({ ...skill, enabled }));
  }

  /** Marks a skill whose content failed verification, and revokes its approval. */
  async markChanged(serverName: string, uri: string): Promise<void> {
    await this.file.update((file) => ({
      value: {
        ...file,
        skills: file.skills.map((skill) => (same(skill, serverName, uri) ? { ...skill, changed: true } : skill)),
        approvals: file.approvals.filter((approval) => !same(approval, serverName, uri)),
      },
      result: undefined,
    }));
  }

  /** Approves code execution for the skill's current manifest. A dynamic skill cannot be approved. */
  async approve(skill: RemoteSkill): Promise<void> {
    if (skill.manifestDigest === 'dynamic') return;
    await this.file.update((file) => ({
      value: {
        ...file,
        skills: file.skills.map((entry) => (same(entry, skill.serverName, skill.uri) ? { ...entry, changed: false } : entry)),
        approvals: [
          ...file.approvals.filter((approval) => !same(approval, skill.serverName, skill.uri)),
          { serverName: skill.serverName, uri: skill.uri, manifestDigest: skill.manifestDigest },
        ],
      },
      result: undefined,
    }));
  }

  async isApproved(skill: RemoteSkill): Promise<boolean> {
    if (skill.manifestDigest === 'dynamic') return false;
    const { approvals } = await this.file.read();
    return approvals.some((approval) => same(approval, skill.serverName, skill.uri) && approval.manifestDigest === skill.manifestDigest);
  }

  async removeServer(serverName: string): Promise<void> {
    await this.file.update((file) => ({
      value: {
        version: 1,
        skills: file.skills.filter((skill) => skill.serverName !== serverName),
        approvals: file.approvals.filter((approval) => approval.serverName !== serverName),
      },
      result: undefined,
    }));
  }

  /**
   * Finds a skill of one server by URI, by path, or by name. A name that two
   * skills share is refused with their paths, so neither is chosen silently.
   */
  async resolve(serverName: string, key: string): Promise<RemoteSkill | { error: string }> {
    const skills = (await this.list()).filter((skill) => skill.serverName === serverName);
    const byUri = skills.find((skill) => skill.uri === key || skillPath(skill.uri) === key);
    if (byUri) return byUri;
    const byName = skills.filter((skill) => skill.entry.frontmatter.name === key);
    if (byName.length === 1) return byName[0]!;
    if (byName.length > 1) {
      return { error: `Server "${serverName}" has ${byName.length} skills named "${key}". Use a path: ${byName.map((skill) => skillPath(skill.uri)).join(', ')}.` };
    }
    return { error: `Server "${serverName}" has no skill "${key}".` };
  }

  private change(serverName: string, uri: string, apply: (skill: RemoteSkill) => RemoteSkill): Promise<RemoteSkill | undefined> {
    return this.file.update((file) => {
      const index = file.skills.findIndex((skill) => same(skill, serverName, uri));
      if (index < 0) return undefined;
      const updated = apply(file.skills[index]!);
      const skills = [...file.skills];
      skills[index] = updated;
      return { value: { ...file, skills }, result: updated };
    });
  }
}

function readSkillsFile(value: unknown): SkillsFile {
  const record = value && typeof value === 'object' ? value as Partial<SkillsFile> : {};
  const skills = Array.isArray(record.skills) ? record.skills.filter(isRemoteSkill) : [];
  const approvals = Array.isArray(record.approvals) ? record.approvals.filter(isApproval) : [];
  return { version: 1, skills, approvals };
}

function isRemoteSkill(value: unknown): value is RemoteSkill {
  if (!value || typeof value !== 'object') return false;
  const skill = value as Partial<RemoteSkill>;
  return typeof skill.serverName === 'string' && typeof skill.uri === 'string' && typeof skill.manifestDigest === 'string'
    && typeof skill.enabled === 'boolean' && !!skill.entry && typeof skill.entry === 'object';
}

function isApproval(value: unknown): value is SkillApproval {
  if (!value || typeof value !== 'object') return false;
  const approval = value as Partial<SkillApproval>;
  return typeof approval.serverName === 'string' && typeof approval.uri === 'string' && typeof approval.manifestDigest === 'string';
}
