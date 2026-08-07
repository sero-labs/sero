import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { loadSkillsFromDir } from '@earendil-works/pi-coding-agent';
import type {
  AgentPluginDiagnostic,
  AgentPluginInspection,
  AgentPluginManifest,
  AgentPluginMcpServer,
  AgentPluginSourceKind,
  AgentPluginSkill,
} from '@sero-ai/common';
import { AGENT_PLUGIN_MCP_SCHEMA, AGENT_PLUGIN_SCHEMA } from './constants';
import { resolveContainedFuturePath, resolveContainedPath } from './path-safety';

const MANIFEST_FIELDS = new Set([
  '$schema', 'name', 'version', 'description', 'author', 'homepage',
  'repository', 'license', 'keywords', 'extensions',
]);
const STDIO_FIELDS = new Set(['type', 'command', 'args', 'env', 'cwd']);
const REMOTE_FIELDS = new Set(['type', 'url', 'headers']);
const AGENT_PLUGIN_NAME = /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
const AGENT_SKILL_NAME = /^(?!.*--)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export interface ValidatedAgentPlugin extends AgentPluginInspection {
  approvalHash: string | null;
}

interface InspectOptions {
  root: string;
  dataPath: string;
  installId: string;
  source: string;
  sourceKind: AgentPluginSourceKind;
  contentDigest: string;
  approvedHash?: string | null;
  cliSkillNames?: Set<string>;
  cliServerNames?: Set<string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function stringMap(value: unknown): Record<string, string> | null {
  if (!isRecord(value)) return null;
  return Object.values(value).every((item) => typeof item === 'string')
    ? value as Record<string, string>
    : null;
}

function diagnostic(
  component: AgentPluginDiagnostic['component'],
  message: string,
  componentName?: string,
  level: AgentPluginDiagnostic['level'] = 'error',
): AgentPluginDiagnostic {
  return { component, componentName, message, level };
}

async function readJsonObject(filePath: string): Promise<Record<string, unknown>> {
  const text = await fs.readFile(filePath, 'utf8');
  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed)) throw new Error(`${path.basename(filePath)} must contain a JSON object.`);
  return parsed;
}

function normalizeManifest(raw: Record<string, unknown>, diagnostics: AgentPluginDiagnostic[]): AgentPluginManifest | null {
  for (const field of Object.keys(raw)) {
    if (!MANIFEST_FIELDS.has(field)) {
      diagnostics.push(diagnostic('manifest', `Ignored unknown plugin.json field: ${field}`, undefined, 'warning'));
    }
  }
  if (raw.$schema !== AGENT_PLUGIN_SCHEMA) {
    diagnostics.push(diagnostic('manifest', `Unsupported Agent Plugins schema: ${String(raw.$schema ?? 'missing')}`));
    return null;
  }
  if (typeof raw.name !== 'string' || raw.name.length > 64 || !AGENT_PLUGIN_NAME.test(raw.name)) {
    diagnostics.push(diagnostic('manifest', 'plugin.json name does not satisfy the Agent Plugins v1 naming rules.'));
    return null;
  }
  const stringFields = ['version', 'description', 'homepage', 'repository', 'license'] as const;
  for (const field of stringFields) {
    if (raw[field] !== undefined && typeof raw[field] !== 'string') {
      diagnostics.push(diagnostic('manifest', `plugin.json ${field} must be a string.`));
      return null;
    }
  }
  if (raw.keywords !== undefined && !isStringArray(raw.keywords)) {
    diagnostics.push(diagnostic('manifest', 'plugin.json keywords must be an array of strings.'));
    return null;
  }
  let author: AgentPluginManifest['author'];
  if (raw.author !== undefined) {
    if (!isRecord(raw.author) || Object.keys(raw.author).some((key) => !['name', 'email', 'url'].includes(key))) {
      diagnostics.push(diagnostic('manifest', 'plugin.json author must contain only name, email, and url.'));
      return null;
    }
    if (Object.values(raw.author).some((value) => typeof value !== 'string')) {
      diagnostics.push(diagnostic('manifest', 'plugin.json author values must be strings.'));
      return null;
    }
    author = raw.author as AgentPluginManifest['author'];
  }
  let extensions: AgentPluginManifest['extensions'];
  if (raw.extensions !== undefined) {
    if (!isRecord(raw.extensions)) {
      diagnostics.push(diagnostic('manifest', 'Ignored non-object plugin.json extensions field.', undefined, 'warning'));
    } else {
      extensions = raw.extensions;
    }
  }
  return {
    $schema: AGENT_PLUGIN_SCHEMA,
    name: raw.name,
    ...(raw.version !== undefined ? { version: raw.version as string } : {}),
    ...(raw.description !== undefined ? { description: raw.description as string } : {}),
    ...(author ? { author } : {}),
    ...(raw.homepage !== undefined ? { homepage: raw.homepage as string } : {}),
    ...(raw.repository !== undefined ? { repository: raw.repository as string } : {}),
    ...(raw.license !== undefined ? { license: raw.license as string } : {}),
    ...(raw.keywords !== undefined ? { keywords: raw.keywords as string[] } : {}),
    ...(extensions ? { extensions } : {}),
  };
}

async function discoverSkills(
  root: string,
  pluginName: string,
  exposedNames: Set<string>,
  diagnostics: AgentPluginDiagnostic[],
): Promise<AgentPluginSkill[]> {
  const skillsPath = path.join(root, 'skills');
  let skillsRoot: string;
  try {
    const stat = await fs.lstat(skillsPath);
    if (!stat.isDirectory() && !stat.isSymbolicLink()) throw new Error('skills is not a directory.');
    skillsRoot = await resolveContainedPath(root, skillsPath);
    if (!(await fs.stat(skillsRoot)).isDirectory()) throw new Error('skills is not a directory.');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    diagnostics.push(diagnostic('skill', error instanceof Error ? error.message : 'Invalid skills directory.'));
    return [];
  }

  const results: AgentPluginSkill[] = [];
  for (const entry of await fs.readdir(skillsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const childPath = path.join(skillsRoot, entry.name);
    const skillPath = path.join(childPath, 'SKILL.md');
    try {
      await resolveContainedPath(root, childPath);
      const resolvedSkillPath = await resolveContainedPath(root, skillPath);
      if (!(await fs.stat(resolvedSkillPath)).isFile()) continue;
      const loaded = loadSkillsFromDir({ dir: childPath, source: `agent-plugin:${pluginName}` });
      const skill = loaded.skills.find((candidate) => candidate.filePath === resolvedSkillPath || candidate.filePath === skillPath);
      const errors = loaded.diagnostics.map((item) => item.message);
      if (!skill) errors.push('SKILL.md is not a valid Agent Skill.');
      if (skill && (skill.name !== entry.name || !AGENT_SKILL_NAME.test(skill.name))) {
        errors.push('Skill name must match its immediate directory and use the Agent Skills naming rules.');
      }
      if (errors.length > 0 || !skill) {
        diagnostics.push(...errors.map((message) => diagnostic('skill', message, entry.name)));
        results.push({
          name: skill?.name ?? entry.name,
          description: skill?.description ?? '',
          directoryName: entry.name,
          filePath: resolvedSkillPath,
          valid: false,
          exposedToCli: false,
        });
        continue;
      }
      results.push({
        name: skill.name,
        description: skill.description,
        directoryName: entry.name,
        filePath: resolvedSkillPath,
        valid: true,
        exposedToCli: exposedNames.has(skill.name),
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      diagnostics.push(diagnostic('skill', error instanceof Error ? error.message : 'Invalid skill path.', entry.name));
    }
  }
  return results;
}

export function expandPluginVariables(value: string, pluginRoot: string, pluginData: string): string {
  return value.replace(/\$\{PLUGIN_(ROOT|DATA)\}/g, (_match, kind: 'ROOT' | 'DATA') => (
    kind === 'ROOT' ? pluginRoot : pluginData
  ));
}

async function resolveStdioServer(
  raw: Record<string, unknown>,
  name: string,
  root: string,
  dataPath: string,
  runtimeName: string,
  exposed: boolean,
): Promise<AgentPluginMcpServer> {
  if (Object.keys(raw).some((field) => !STDIO_FIELDS.has(field))) {
    throw new Error('Stdio server contains an unknown or transport-specific field.');
  }
  if (typeof raw.command !== 'string' || raw.command.length === 0) {
    throw new Error('Stdio server command is required.');
  }
  const args = raw.args === undefined ? [] : isStringArray(raw.args) ? raw.args : null;
  const env = raw.env === undefined ? {} : stringMap(raw.env);
  if (!args || !env) throw new Error('Stdio args and env values must be strings.');
  if (Object.keys(env).some((key) => key.toUpperCase() === 'PLUGIN_ROOT' || key.toUpperCase() === 'PLUGIN_DATA')) {
    throw new Error('Stdio env cannot override PLUGIN_ROOT or PLUGIN_DATA.');
  }
  let command = raw.command;
  if (command.startsWith('./')) {
    command = await resolveContainedPath(root, path.resolve(root, command));
  } else if (/[\s/\\;&|`$]/.test(command)) {
    throw new Error('Stdio command must be one bare executable token or a ./ package path.');
  }
  let cwd = root;
  if (raw.cwd !== undefined) {
    if (typeof raw.cwd !== 'string') throw new Error('Stdio cwd must be a string.');
    const expanded = expandPluginVariables(raw.cwd, root, dataPath);
    if (raw.cwd.startsWith('./') || raw.cwd.startsWith('${PLUGIN_ROOT}')) {
      cwd = await resolveContainedFuturePath(
        root,
        raw.cwd.startsWith('./') ? path.resolve(root, expanded) : expanded,
      );
    } else if (raw.cwd.startsWith('${PLUGIN_DATA}')) {
      cwd = await resolveContainedFuturePath(dataPath, expanded);
    } else {
      throw new Error('Stdio cwd must be package-relative or use PLUGIN_ROOT or PLUGIN_DATA.');
    }
  }
  return {
    name,
    runtimeName,
    transport: 'stdio',
    valid: true,
    approved: false,
    exposedToCli: exposed,
    command,
    args: args.map((value) => expandPluginVariables(value, root, dataPath)),
    env: {
      ...Object.fromEntries(Object.entries(env).map(([key, value]) => [key, expandPluginVariables(value, root, dataPath)])),
      PLUGIN_ROOT: root,
      PLUGIN_DATA: dataPath,
    },
    cwd,
  };
}

function isLoopback(hostname: string): boolean {
  const normalized = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;
  if (normalized === 'localhost' || normalized === '::1') return true;
  const octets = normalized.split('.');
  return octets.length === 4
    && octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255)
    && Number(octets[0]) === 127;
}

function resolveRemoteServer(
  raw: Record<string, unknown>,
  name: string,
  runtimeName: string,
  exposed: boolean,
): AgentPluginMcpServer {
  if (Object.keys(raw).some((field) => !REMOTE_FIELDS.has(field))) {
    throw new Error('Remote server contains an unknown or transport-specific field.');
  }
  if (raw.type !== 'streamable-http' && raw.type !== 'sse') throw new Error('Unsupported MCP transport.');
  if (typeof raw.url !== 'string') throw new Error('Remote server URL is required.');
  const url = new URL(raw.url);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new Error('Remote MCP URL must be an absolute HTTP URL without user information or a fragment.');
  }
  if (url.protocol !== 'https:' && !isLoopback(url.hostname)) {
    throw new Error('Non-loopback remote MCP endpoints must use HTTPS.');
  }
  const headers = raw.headers === undefined ? {} : stringMap(raw.headers);
  if (!headers) throw new Error('Remote MCP headers must contain string values.');
  const normalizedHeaders = new Set<string>();
  for (const [key, value] of Object.entries(headers)) {
    const normalized = key.toLowerCase();
    if (normalizedHeaders.has(normalized)) throw new Error(`Duplicate header name with different casing: ${key}`);
    normalizedHeaders.add(normalized);
    if (!key.trim() || /[\r\n]/.test(key) || /[\r\n]/.test(value)) throw new Error(`Invalid HTTP header: ${key}`);
  }
  return {
    name,
    runtimeName,
    transport: raw.type,
    valid: true,
    approved: false,
    exposedToCli: exposed,
    url: url.toString(),
    headers,
  };
}

async function discoverMcp(
  options: InspectOptions,
  diagnostics: AgentPluginDiagnostic[],
): Promise<{ servers: AgentPluginMcpServer[]; approvalHash: string | null }> {
  const mcpPath = path.join(options.root, 'mcp.json');
  let raw: Record<string, unknown>;
  try {
    const resolved = await resolveContainedPath(options.root, mcpPath);
    if (!(await fs.stat(resolved)).isFile()) throw new Error('mcp.json is not a regular file.');
    raw = await readJsonObject(resolved);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { servers: [], approvalHash: null };
    diagnostics.push(diagnostic('mcp', error instanceof Error ? error.message : 'Invalid mcp.json.'));
    return { servers: [], approvalHash: null };
  }
  if (raw.$schema !== AGENT_PLUGIN_MCP_SCHEMA || Object.keys(raw).some((key) => !['$schema', 'mcpServers'].includes(key)) || !isRecord(raw.mcpServers)) {
    diagnostics.push(diagnostic('mcp', 'mcp.json must use the matching Agent Plugins v1 schema and closed top-level shape.'));
    return { servers: [], approvalHash: null };
  }
  const approvalDefinitions: Array<[string, Record<string, unknown>]> = [];
  const servers: AgentPluginMcpServer[] = [];
  for (const [name, value] of Object.entries(raw.mcpServers)) {
    const runtimeName = `agent-plugin:${options.installId}:${name}`;
    if (!isRecord(value) || typeof value.type !== 'string') {
      diagnostics.push(diagnostic('mcp', 'MCP server must be an object with a transport type.', name));
      continue;
    }
    try {
      if (value.type === 'stdio') {
        const server = await resolveStdioServer(value, name, options.root, options.dataPath, runtimeName, options.cliServerNames?.has(name) ?? false);
        approvalDefinitions.push([name, value]);
        servers.push(server);
      } else {
        const server = resolveRemoteServer(value, name, runtimeName, options.cliServerNames?.has(name) ?? false);
        approvalDefinitions.push([name, value]);
        servers.push(server);
      }
    } catch (error) {
      diagnostics.push(diagnostic('mcp', error instanceof Error ? error.message : 'Invalid MCP server.', name));
      servers.push({
        name,
        runtimeName,
        transport: value.type === 'stdio' || value.type === 'sse' ? value.type : 'streamable-http',
        valid: false,
        approved: false,
        exposedToCli: false,
      });
    }
  }
  const approvalHash = approvalDefinitions.length === 0
    ? null
    : createHash('sha256').update(JSON.stringify(approvalDefinitions)).digest('hex');
  for (const server of servers) {
    if (server.valid) server.approved = approvalHash === options.approvedHash;
  }
  return { servers, approvalHash };
}

export async function inspectAgentPluginRoot(options: InspectOptions): Promise<ValidatedAgentPlugin> {
  const diagnostics: AgentPluginDiagnostic[] = [];
  let root: string;
  try {
    root = await fs.realpath(options.root);
    const manifestPath = await resolveContainedPath(root, path.join(root, 'plugin.json'));
    if (!(await fs.stat(manifestPath)).isFile()) throw new Error('plugin.json is not a regular file.');
    const manifest = normalizeManifest(await readJsonObject(manifestPath), diagnostics);
    if (!manifest) {
      return emptyInspection(options, diagnostics);
    }
    const resolvedOptions = { ...options, root };
    const [skills, mcp] = await Promise.all([
      discoverSkills(root, manifest.name, options.cliSkillNames ?? new Set(), diagnostics),
      discoverMcp(resolvedOptions, diagnostics),
    ]);
    return {
      manifest,
      source: options.source,
      sourceKind: options.sourceKind,
      contentDigest: options.contentDigest,
      valid: true,
      skills,
      mcpServers: mcp.servers,
      diagnostics,
      approvalHash: mcp.approvalHash,
      requiresExecutableApproval: mcp.approvalHash !== null && mcp.approvalHash !== options.approvedHash,
      suggestedNamespace: manifest.name,
    };
  } catch (error) {
    diagnostics.push(diagnostic('manifest', error instanceof Error ? error.message : 'Invalid Agent Plugin package.'));
    return emptyInspection(options, diagnostics);
  }
}

function emptyInspection(options: InspectOptions, diagnostics: AgentPluginDiagnostic[]): ValidatedAgentPlugin {
  return {
    manifest: null,
    source: options.source,
    sourceKind: options.sourceKind,
    contentDigest: options.contentDigest,
    valid: false,
    skills: [],
    mcpServers: [],
    diagnostics,
    approvalHash: null,
    requiresExecutableApproval: false,
    suggestedNamespace: null,
  };
}
