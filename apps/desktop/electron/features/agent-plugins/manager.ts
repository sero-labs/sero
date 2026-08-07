import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  AgentPluginCliSettingsRequest,
  AgentPluginInspection,
  AgentPluginInstallRequest,
  AgentPluginMcpSource,
  AgentPluginMcpServer,
  AgentPluginRemoveRequest,
  AgentPluginUpdatePreview,
  AgentPluginUpdateRequest,
  InstalledAgentPlugin,
} from '@sero-ai/common';
import { getCliRegistry } from '@electron/cli';
import {
  AGENT_PLUGIN_DATA_DIR,
  AGENT_PLUGINS_DIR,
  AGENT_PLUGIN_STAGING_DIR,
} from './constants';
import {
  readAgentPluginRegistry,
  readAgentPluginRegistrySync,
  writeAgentPluginRegistry,
} from './registry';
import {
  cleanupStagedAgentPlugin,
  stageAgentPluginSource,
  type StagedAgentPluginSource,
} from './source';
import { inspectAgentPluginRoot, type ValidatedAgentPlugin } from './validation';

const VALID_NAMESPACE = /^(?!.*--)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
const RESERVED_CLI_ROOTS = new Set([
  'admin', 'agent', 'app', 'appstate', 'artifact', 'auth', 'browser', 'devserver',
  'editor', 'github', 'help', 'layout', 'mcp', 'model', 'net', 'safeStorage',
  'session', 'terminal', 'vcs', 'workspace',
]);

let mutationLock: Promise<void> = Promise.resolve();

function serializeMutation<T>(operation: () => Promise<T>): Promise<T> {
  const previous = mutationLock;
  let release!: () => void;
  mutationLock = new Promise((resolve) => { release = resolve; });
  return previous.then(operation).finally(release);
}

async function ensureRoots(): Promise<void> {
  await Promise.all([
    fs.mkdir(AGENT_PLUGINS_DIR, { recursive: true }),
    fs.mkdir(AGENT_PLUGIN_DATA_DIR, { recursive: true }),
    fs.mkdir(AGENT_PLUGIN_STAGING_DIR, { recursive: true }),
  ]);
}

function namespaceFor(
  requested: string | undefined,
  fallback: string,
  plugins: InstalledAgentPlugin[],
  currentId?: string,
): string {
  const namespace = (requested ?? fallback).trim();
  const root = namespace.split('/')[0] ?? '';
  if (!VALID_NAMESPACE.test(namespace) || namespace.includes('/')) {
    throw new Error('Agent Plugin CLI namespace must use lowercase letters, numbers, periods, and hyphens.');
  }
  if (RESERVED_CLI_ROOTS.has(root)) {
    throw new Error(`Agent Plugin CLI namespace is reserved: ${namespace}`);
  }
  const nativeCollision = getCliRegistry().list().find((command) => (
    command.source !== 'agent-plugin' && command.name.split(/[ /]/, 1)[0] === root
  ));
  if (nativeCollision) {
    throw new Error(`Agent Plugin CLI namespace conflicts with Sero command: ${nativeCollision.name}`);
  }
  const collision = plugins.find((plugin) => plugin.id !== currentId && plugin.cli.enabled && plugin.cli.namespace === namespace);
  if (collision) throw new Error(`Agent Plugin CLI namespace is already used by ${collision.manifest.name}.`);
  return namespace;
}

function cliCommands(
  namespace: string,
  skills: InstalledAgentPlugin['skills'],
  servers: AgentPluginMcpServer[],
): InstalledAgentPlugin['cli'] {
  return {
    enabled: true,
    namespace,
    skillCommands: skills.filter((skill) => skill.valid && skill.exposedToCli).map((skill) => `${namespace}/${skill.name}`),
    mcpCommands: servers.filter((server) => server.valid && server.exposedToCli).map((server) => `${namespace}/${server.name}/<tool>`),
  };
}

async function inspectStaged(
  staged: StagedAgentPluginSource,
  source: string,
  installId = 'inspection',
  dataPath = path.join(AGENT_PLUGIN_DATA_DIR, installId),
): Promise<ValidatedAgentPlugin> {
  return inspectAgentPluginRoot({
    root: staged.root,
    dataPath,
    installId,
    source,
    sourceKind: staged.sourceKind,
  });
}

export async function inspectAgentPluginSource(source: string): Promise<AgentPluginInspection> {
  let staged: StagedAgentPluginSource | null = null;
  try {
    staged = await stageAgentPluginSource(source);
    const { approvalHash: _, ...inspection } = await inspectStaged(staged, source);
    return inspection;
  } finally {
    await cleanupStagedAgentPlugin(staged);
  }
}

export async function listInstalledAgentPlugins(): Promise<InstalledAgentPlugin[]> {
  return (await readAgentPluginRegistry()).plugins;
}

export function installAgentPlugin(request: AgentPluginInstallRequest): Promise<InstalledAgentPlugin> {
  return serializeMutation(async () => {
    await ensureRoots();
    let staged: StagedAgentPluginSource | null = null;
    try {
      staged = await stageAgentPluginSource(request.source);
      const preview = await inspectStaged(staged, request.source);
      if (!preview.valid || !preview.manifest) throw new Error(preview.diagnostics[0]?.message ?? 'Invalid Agent Plugin.');
      const registry = await readAgentPluginRegistry();
      const id = `ap-${randomUUID()}`;
      const packagePath = path.join(AGENT_PLUGINS_DIR, id);
      const dataPath = path.join(AGENT_PLUGIN_DATA_DIR, id);
      const namespace = request.exposeToCli
        ? namespaceFor(request.namespaceAlias, preview.manifest.name, registry.plugins)
        : (request.namespaceAlias ?? preview.manifest.name).trim();
      await fs.mkdir(dataPath, { recursive: true });
      await fs.rename(staged.root, packagePath);
      const approvedHash = request.approveExecutableComponents ? preview.approvalHash : null;
      const inspection = await inspectAgentPluginRoot({
        root: packagePath,
        dataPath,
        installId: id,
        source: request.source,
        sourceKind: staged.sourceKind,
        approvedHash,
        cliSkillNames: request.exposeToCli ? new Set(preview.skills.filter((skill) => skill.valid).map((skill) => skill.name)) : new Set(),
        cliServerNames: request.exposeToCli ? new Set(preview.mcpServers.filter((server) => server.valid).map((server) => server.name)) : new Set(),
      });
      const now = new Date().toISOString();
      const plugin: InstalledAgentPlugin = {
        id,
        manifest: inspection.manifest!,
        source: request.source,
        sourceKind: staged.sourceKind,
        installedAt: now,
        updatedAt: now,
        packagePath,
        dataPath,
        enabled: true,
        executableApprovalHash: approvedHash,
        skills: inspection.skills,
        mcpServers: inspection.mcpServers,
        diagnostics: inspection.diagnostics,
        cli: request.exposeToCli
          ? cliCommands(namespace, inspection.skills, inspection.mcpServers)
          : { enabled: false, namespace, skillCommands: [], mcpCommands: [] },
      };
      await writeAgentPluginRegistry([...registry.plugins, plugin]);
      return plugin;
    } finally {
      await cleanupStagedAgentPlugin(staged);
    }
  });
}

function componentMap(inspection: Pick<AgentPluginInspection, 'skills' | 'mcpServers'>): Map<string, string> {
  return new Map([
    ...inspection.skills.map((skill) => [`skill:${skill.name}`, JSON.stringify(skill)] as const),
    ...inspection.mcpServers.map((server) => [`mcp:${server.name}`, JSON.stringify(server)] as const),
  ]);
}

function componentDiff(
  current: InstalledAgentPlugin,
  next: ValidatedAgentPlugin,
): Pick<AgentPluginUpdatePreview, 'addedComponents' | 'removedComponents' | 'changedComponents'> {
  const before = componentMap(current);
  const after = componentMap(next);
  return {
    addedComponents: [...after.keys()].filter((key) => !before.has(key)),
    removedComponents: [...before.keys()].filter((key) => !after.has(key)),
    changedComponents: [...after.keys()].filter((key) => before.has(key) && before.get(key) !== after.get(key)),
  };
}

async function inspectUpdate(plugin: InstalledAgentPlugin): Promise<{ staged: StagedAgentPluginSource; inspection: ValidatedAgentPlugin }> {
  const staged = await stageAgentPluginSource(plugin.source);
  const inspection = await inspectAgentPluginRoot({
    root: staged.root,
    dataPath: plugin.dataPath,
    installId: plugin.id,
    source: plugin.source,
    sourceKind: staged.sourceKind,
    approvedHash: plugin.executableApprovalHash,
    cliSkillNames: new Set(plugin.skills.filter((skill) => skill.exposedToCli).map((skill) => skill.name)),
    cliServerNames: new Set(plugin.mcpServers.filter((server) => server.exposedToCli).map((server) => server.name)),
  });
  return { staged, inspection };
}

export async function previewAgentPluginUpdate(id: string): Promise<AgentPluginUpdatePreview> {
  const plugin = (await readAgentPluginRegistry()).plugins.find((candidate) => candidate.id === id);
  if (!plugin) throw new Error(`Agent Plugin not found: ${id}`);
  let staged: StagedAgentPluginSource | null = null;
  try {
    const update = await inspectUpdate(plugin);
    staged = update.staged;
    if (!update.inspection.valid || !update.inspection.manifest) throw new Error(update.inspection.diagnostics[0]?.message ?? 'Invalid update.');
    const diff = componentDiff(plugin, update.inspection);
    const nextCli = cliCommands(plugin.cli.namespace, update.inspection.skills, update.inspection.mcpServers);
    return {
      pluginId: id,
      previousVersion: plugin.manifest.version,
      nextVersion: update.inspection.manifest.version,
      ...diff,
      addedCliCommands: nextCli.skillCommands.concat(nextCli.mcpCommands).filter((command) => !plugin.cli.skillCommands.includes(command) && !plugin.cli.mcpCommands.includes(command)),
      removedCliCommands: plugin.cli.skillCommands.concat(plugin.cli.mcpCommands).filter((command) => !nextCli.skillCommands.includes(command) && !nextCli.mcpCommands.includes(command)),
      requiresExecutableApproval: update.inspection.approvalHash !== plugin.executableApprovalHash,
    };
  } finally {
    await cleanupStagedAgentPlugin(staged);
  }
}

export function updateAgentPlugin(request: AgentPluginUpdateRequest): Promise<InstalledAgentPlugin> {
  return serializeMutation(async () => {
    const registry = await readAgentPluginRegistry();
    const index = registry.plugins.findIndex((plugin) => plugin.id === request.id);
    if (index < 0) throw new Error(`Agent Plugin not found: ${request.id}`);
    const current = registry.plugins[index]!;
    let staged: StagedAgentPluginSource | null = null;
    const backupPath = path.join(AGENT_PLUGIN_STAGING_DIR, `${current.id}-backup-${Date.now()}`);
    try {
      const update = await inspectUpdate(current);
      staged = update.staged;
      if (!update.inspection.valid || !update.inspection.manifest) throw new Error(update.inspection.diagnostics[0]?.message ?? 'Invalid update.');
      const executableChanged = update.inspection.approvalHash !== current.executableApprovalHash;
      if (executableChanged && !request.approveExecutableChanges) {
        throw new Error('This update changes executable MCP components and needs approval.');
      }
      await fs.rename(current.packagePath, backupPath);
      await fs.rename(staged.root, current.packagePath);
      const approvedHash = executableChanged ? update.inspection.approvalHash : current.executableApprovalHash;
      const inspection = await inspectAgentPluginRoot({
        root: current.packagePath,
        dataPath: current.dataPath,
        installId: current.id,
        source: current.source,
        sourceKind: staged.sourceKind,
        approvedHash,
        cliSkillNames: new Set(current.skills.filter((skill) => skill.exposedToCli).map((skill) => skill.name)),
        cliServerNames: new Set(current.mcpServers.filter((server) => server.exposedToCli).map((server) => server.name)),
      });
      const updated: InstalledAgentPlugin = {
        ...current,
        manifest: inspection.manifest!,
        sourceKind: staged.sourceKind,
        updatedAt: new Date().toISOString(),
        executableApprovalHash: approvedHash,
        skills: inspection.skills,
        mcpServers: inspection.mcpServers,
        diagnostics: inspection.diagnostics,
        cli: current.cli.enabled
          ? cliCommands(current.cli.namespace, inspection.skills, inspection.mcpServers)
          : current.cli,
      };
      registry.plugins[index] = updated;
      await writeAgentPluginRegistry(registry.plugins);
      await fs.rm(backupPath, { recursive: true, force: true });
      return updated;
    } catch (error) {
      const backupExists = await fs.stat(backupPath).then(() => true, () => false);
      const currentExists = await fs.stat(current.packagePath).then(() => true, () => false);
      if (backupExists && !currentExists) await fs.rename(backupPath, current.packagePath);
      throw error;
    } finally {
      await cleanupStagedAgentPlugin(staged);
    }
  });
}

async function updateRecord(id: string, mutate: (plugin: InstalledAgentPlugin, all: InstalledAgentPlugin[]) => Promise<InstalledAgentPlugin> | InstalledAgentPlugin): Promise<InstalledAgentPlugin> {
  const registry = await readAgentPluginRegistry();
  const index = registry.plugins.findIndex((plugin) => plugin.id === id);
  if (index < 0) throw new Error(`Agent Plugin not found: ${id}`);
  const updated = await mutate(registry.plugins[index]!, registry.plugins);
  registry.plugins[index] = updated;
  await writeAgentPluginRegistry(registry.plugins);
  return updated;
}

export function setAgentPluginEnabled(id: string, enabled: boolean): Promise<InstalledAgentPlugin> {
  return serializeMutation(() => updateRecord(id, (plugin) => ({ ...plugin, enabled, updatedAt: new Date().toISOString() })));
}

export function setAgentPluginCliExposure(request: AgentPluginCliSettingsRequest): Promise<InstalledAgentPlugin> {
  return serializeMutation(() => updateRecord(request.id, (plugin, all) => {
    const namespace = namespaceFor(request.namespaceAlias, plugin.cli.namespace || plugin.manifest.name, all, plugin.id);
    const skillNames = new Set(request.skillNames ?? plugin.skills.filter((skill) => skill.valid).map((skill) => skill.name));
    const serverNames = new Set(request.serverNames ?? plugin.mcpServers.filter((server) => server.valid).map((server) => server.name));
    const skills = plugin.skills.map((skill) => ({ ...skill, exposedToCli: request.enabled && skill.valid && skillNames.has(skill.name) }));
    const servers = plugin.mcpServers.map((server) => ({ ...server, exposedToCli: request.enabled && server.valid && serverNames.has(server.name) }));
    return {
      ...plugin,
      skills,
      mcpServers: servers,
      cli: request.enabled ? cliCommands(namespace, skills, servers) : { enabled: false, namespace, skillCommands: [], mcpCommands: [] },
      updatedAt: new Date().toISOString(),
    };
  }));
}

export function approveAgentPluginComponents(id: string): Promise<InstalledAgentPlugin> {
  return serializeMutation(() => updateRecord(id, async (plugin) => {
    const inspection = await inspectAgentPluginRoot({
      root: plugin.packagePath,
      dataPath: plugin.dataPath,
      installId: plugin.id,
      source: plugin.source,
      sourceKind: plugin.sourceKind,
      approvedHash: undefined,
      cliSkillNames: new Set(plugin.skills.filter((skill) => skill.exposedToCli).map((skill) => skill.name)),
      cliServerNames: new Set(plugin.mcpServers.filter((server) => server.exposedToCli).map((server) => server.name)),
    });
    const approvedHash = inspection.approvalHash;
    return {
      ...plugin,
      executableApprovalHash: approvedHash,
      mcpServers: inspection.mcpServers.map((server) => ({ ...server, approved: server.transport !== 'stdio' || approvedHash !== null })),
      diagnostics: inspection.diagnostics,
      updatedAt: new Date().toISOString(),
    };
  }));
}

export function removeAgentPlugin(request: AgentPluginRemoveRequest): Promise<void> {
  return serializeMutation(async () => {
    const registry = await readAgentPluginRegistry();
    const plugin = registry.plugins.find((candidate) => candidate.id === request.id);
    if (!plugin) throw new Error(`Agent Plugin not found: ${request.id}`);
    await fs.rm(plugin.packagePath, { recursive: true, force: true });
    if (!request.retainData) await fs.rm(plugin.dataPath, { recursive: true, force: true });
    await writeAgentPluginRegistry(registry.plugins.filter((candidate) => candidate.id !== request.id));
  });
}

export function getAgentPluginMcpSources(): AgentPluginMcpSource[] {
  const plugins = readAgentPluginRegistrySync().plugins;
  return plugins.flatMap((plugin) => (
    plugin.enabled
      ? plugin.mcpServers.filter((server) => server.valid && server.approved).map((server) => ({
        pluginId: plugin.id,
        pluginName: plugin.manifest.name,
        server,
      }))
      : []
  ));
}
