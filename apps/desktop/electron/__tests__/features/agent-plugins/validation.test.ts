import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AGENT_PLUGIN_MCP_SCHEMA, AGENT_PLUGIN_SCHEMA } from '@electron/features/agent-plugins/constants';
import {
  expandPluginVariables,
  inspectAgentPluginRoot,
} from '@electron/features/agent-plugins/validation';

const tempRoots: string[] = [];

async function makeRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sero-agent-plugin-'));
  tempRoots.push(root);
  await fs.writeFile(path.join(root, 'plugin.json'), JSON.stringify({
    $schema: AGENT_PLUGIN_SCHEMA,
    name: 'test-plugin',
  }));
  return root;
}

async function inspect(root: string, approvedHash?: string | null) {
  const dataPath = path.join(root, '.data');
  await fs.mkdir(dataPath, { recursive: true });
  return inspectAgentPluginRoot({
    root,
    dataPath,
    installId: 'fixture',
    source: root,
    sourceKind: 'local',
    contentDigest: 'fixture-digest',
    approvedHash,
  });
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('Agent Plugins v1 validation', () => {
  it('loads the official example fixture as a manifest-only Pi-independent package', async () => {
    const root = path.resolve(process.cwd(), 'electron/__tests__/fixtures/agent-plugins/official-example');
    const result = await inspect(root);
    expect(result.valid).toBe(true);
    expect(result.manifest?.name).toBe('agent-plugins-example');
    expect(result.skills.map((skill) => skill.name)).toEqual(['migrate-agent-plugin']);
  });

  it('keeps valid sibling skills when one immediate child is invalid', async () => {
    const root = await makeRoot();
    await fs.mkdir(path.join(root, 'skills', 'valid'), { recursive: true });
    await fs.mkdir(path.join(root, 'skills', 'broken'), { recursive: true });
    await fs.writeFile(path.join(root, 'skills', 'valid', 'SKILL.md'), '---\nname: valid\ndescription: Valid skill.\n---\n# Valid\n');
    await fs.writeFile(path.join(root, 'skills', 'broken', 'SKILL.md'), '---\nname: wrong-name\n---\n# Broken\n');
    const result = await inspect(root);
    expect(result.skills.find((skill) => skill.name === 'valid')?.valid).toBe(true);
    expect(result.skills.find((skill) => skill.directoryName === 'broken')?.valid).toBe(false);
    expect(result.valid).toBe(true);
  });

  it('maps exact placeholders and requires approval for stdio execution', async () => {
    const root = await makeRoot();
    await fs.mkdir(path.join(root, 'bin'));
    await fs.writeFile(path.join(root, 'bin', 'server'), '#!/bin/sh\n');
    await fs.writeFile(path.join(root, 'mcp.json'), JSON.stringify({
      $schema: AGENT_PLUGIN_MCP_SCHEMA,
      mcpServers: {
        local: {
          type: 'stdio',
          command: './bin/server',
          args: ['--root', '${PLUGIN_ROOT}', '--data', '${PLUGIN_DATA}/cache'],
          env: { CONFIG: '${PLUGIN_ROOT}/config.json' },
          cwd: '${PLUGIN_DATA}/work',
        },
      },
    }));
    const preview = await inspect(root);
    expect(preview.requiresExecutableApproval).toBe(true);
    expect(preview.mcpServers[0]).toMatchObject({ transport: 'stdio', valid: true, approved: false });
    const approved = await inspect(root, preview.approvalHash);
    expect(approved.mcpServers[0]?.approved).toBe(true);
    expect(approved.mcpServers[0]?.env).toMatchObject({
      PLUGIN_ROOT: await fs.realpath(root),
    });
  });

  it('isolates invalid remote entries and blocks insecure non-loopback HTTP', async () => {
    const root = await makeRoot();
    await fs.writeFile(path.join(root, 'mcp.json'), JSON.stringify({
      $schema: AGENT_PLUGIN_MCP_SCHEMA,
      mcpServers: {
        secure: { type: 'streamable-http', url: 'https://example.com/mcp' },
        insecure: { type: 'streamable-http', url: 'http://example.com/mcp' },
      },
    }));
    const result = await inspect(root);
    expect(result.mcpServers.find((server) => server.name === 'secure')?.valid).toBe(true);
    expect(result.mcpServers.find((server) => server.name === 'insecure')?.valid).toBe(false);
    expect(result.valid).toBe(true);
  });

  it('allows exact IPv4 and IPv6 loopback hosts but rejects a lookalike host', async () => {
    const root = await makeRoot();
    await fs.writeFile(path.join(root, 'mcp.json'), JSON.stringify({
      $schema: AGENT_PLUGIN_MCP_SCHEMA,
      mcpServers: {
        ipv4: { type: 'streamable-http', url: 'http://127.0.0.8/mcp' },
        ipv6: { type: 'streamable-http', url: 'http://[::1]:3000/mcp' },
        lookalike: { type: 'streamable-http', url: 'http://127.0.0.1.evil.example/mcp' },
      },
    }));

    const result = await inspect(root);

    expect(result.mcpServers.find((server) => server.name === 'ipv4')?.valid).toBe(true);
    expect(result.mcpServers.find((server) => server.name === 'ipv6')?.valid).toBe(true);
    expect(result.mcpServers.find((server) => server.name === 'lookalike')?.valid).toBe(false);
  });

  it('requires renewed approval when a remote endpoint changes', async () => {
    const root = await makeRoot();
    const mcpPath = path.join(root, 'mcp.json');
    await fs.writeFile(mcpPath, JSON.stringify({
      $schema: AGENT_PLUGIN_MCP_SCHEMA,
      mcpServers: { remote: { type: 'streamable-http', url: 'https://trusted.example/mcp' } },
    }));
    const preview = await inspect(root);
    expect(preview.requiresExecutableApproval).toBe(true);
    expect(preview.mcpServers[0]?.approved).toBe(false);
    expect((await inspect(root, preview.approvalHash)).mcpServers[0]?.approved).toBe(true);

    await fs.writeFile(mcpPath, JSON.stringify({
      $schema: AGENT_PLUGIN_MCP_SCHEMA,
      mcpServers: { remote: { type: 'streamable-http', url: 'https://changed.example/mcp' } },
    }));
    const changed = await inspect(root, preview.approvalHash);
    expect(changed.requiresExecutableApproval).toBe(true);
    expect(changed.mcpServers[0]?.approved).toBe(false);
  });

  it('keeps skills active when the MCP schema version is unsupported', async () => {
    const root = await makeRoot();
    await fs.mkdir(path.join(root, 'skills', 'valid'), { recursive: true });
    await fs.writeFile(path.join(root, 'skills', 'valid', 'SKILL.md'), '---\nname: valid\ndescription: Valid skill.\n---\n# Valid\n');
    await fs.writeFile(path.join(root, 'mcp.json'), JSON.stringify({
      $schema: 'https://agent-plugins.org/schemas/2.0.0/mcp.schema.json',
      mcpServers: { future: { type: 'streamable-http', url: 'https://example.com/mcp' } },
    }));
    const result = await inspect(root);
    expect(result.valid).toBe(true);
    expect(result.skills[0]?.valid).toBe(true);
    expect(result.mcpServers).toEqual([]);
    expect(result.diagnostics.some((item) => item.component === 'mcp' && item.message.includes('matching'))).toBe(true);
  });

  it('ignores unknown client extension contents without validation', async () => {
    const root = await makeRoot();
    await fs.writeFile(path.join(root, 'plugin.json'), JSON.stringify({
      $schema: AGENT_PLUGIN_SCHEMA,
      name: 'test-plugin',
      extensions: { 'com.example.client': 'client-owned' },
    }));
    const result = await inspect(root);
    expect(result.valid).toBe(true);
    expect(result.manifest?.extensions?.['com.example.client']).toBe('client-owned');
  });

  it('does not request approval for an invalid executable entry', async () => {
    const root = await makeRoot();
    await fs.writeFile(path.join(root, 'mcp.json'), JSON.stringify({
      $schema: AGENT_PLUGIN_MCP_SCHEMA,
      mcpServers: { invalid: { type: 'stdio', command: '../outside' } },
    }));
    const result = await inspect(root);
    expect(result.mcpServers[0]?.valid).toBe(false);
    expect(result.requiresExecutableApproval).toBe(false);
  });

  it('rejects post-expansion working directory escapes', async () => {
    const root = await makeRoot();
    await fs.writeFile(path.join(root, 'mcp.json'), JSON.stringify({
      $schema: AGENT_PLUGIN_MCP_SCHEMA,
      mcpServers: {
        escaped: { type: 'stdio', command: 'node', cwd: '${PLUGIN_DATA}/../outside' },
      },
    }));
    const result = await inspect(root);
    expect(result.mcpServers[0]?.valid).toBe(false);
    expect(result.diagnostics.some((item) => item.message.includes('outside'))).toBe(true);
  });

  it('rejects a working directory that crosses an intermediate symlink', async () => {
    const root = await makeRoot();
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'sero-agent-plugin-outside-'));
    tempRoots.push(outside);
    await fs.symlink(outside, path.join(root, 'escaped-directory'));
    await fs.writeFile(path.join(root, 'mcp.json'), JSON.stringify({
      $schema: AGENT_PLUGIN_MCP_SCHEMA,
      mcpServers: {
        escaped: { type: 'stdio', command: 'node', cwd: './escaped-directory/work' },
      },
    }));
    const result = await inspect(root);
    expect(result.mcpServers[0]?.valid).toBe(false);
    expect(result.diagnostics.some((item) => item.message.includes('outside'))).toBe(true);
  });

  it('rejects package symlinks that resolve outside the root', async () => {
    const root = await makeRoot();
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'sero-agent-plugin-outside-'));
    tempRoots.push(outside);
    await fs.writeFile(path.join(outside, 'server'), '#!/bin/sh\n');
    await fs.symlink(path.join(outside, 'server'), path.join(root, 'escaped-server'));
    await fs.writeFile(path.join(root, 'mcp.json'), JSON.stringify({
      $schema: AGENT_PLUGIN_MCP_SCHEMA,
      mcpServers: { escaped: { type: 'stdio', command: './escaped-server' } },
    }));
    const result = await inspect(root);
    expect(result.mcpServers[0]?.valid).toBe(false);
    expect(result.diagnostics.some((item) => item.message.includes('outside'))).toBe(true);
  });

  it('uses single-pass non-recursive variable expansion', () => {
    expect(expandPluginVariables('${PLUGIN_ROOT}', '/root/${PLUGIN_DATA}', '/data')).toBe('/root/${PLUGIN_DATA}');
  });
});
