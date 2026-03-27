import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'fs/promises';
import path from 'path';
import os from 'os';
import { discoverAgents } from '../../../features/subagent/runtime/discovery';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'subagent-discovery-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

function writeMd(name: string, content: string) {
  return writeFile(path.join(tmpDir, name), content, 'utf-8');
}

describe('discoverAgents', () => {
  it('parses a valid .md file with full JSON frontmatter', async () => {
    await writeMd('analyst.md', [
      '```json',
      '{ "name": "analyst", "description": "Codebase analysis", "model": "claude-sonnet-4-6", "thinking": "medium", "timeoutMs": 300000, "tools": ["read", "bash"] }',
      '```',
      '',
      'You are a senior analyst.',
    ].join('\n'));

    const agents = await discoverAgents(tmpDir);
    expect(agents).toHaveLength(1);
    expect(agents[0].name).toBe('analyst');
    expect(agents[0].description).toBe('Codebase analysis');
    expect(agents[0].model).toBe('claude-sonnet-4-6');
    expect(agents[0].thinking).toBe('medium');
    expect(agents[0].timeoutMs).toBe(300000);
    expect(agents[0].tools).toEqual(['read', 'bash']);
    expect(agents[0].systemPrompt).toBe('You are a senior analyst.');
    expect(agents[0].source).toBe('global');
    expect(agents[0].filePath).toBe(path.join(tmpDir, 'analyst.md'));
  });

  it('parses a file with only required frontmatter fields', async () => {
    await writeMd('simple.md', [
      '```json',
      '{ "name": "simple", "description": "A simple agent" }',
      '```',
      '',
      'Do something simple.',
    ].join('\n'));

    const agents = await discoverAgents(tmpDir);
    expect(agents).toHaveLength(1);
    expect(agents[0].name).toBe('simple');
    expect(agents[0].model).toBeUndefined();
    expect(agents[0].thinking).toBeUndefined();
  });

  it('parses --- delimited JSON frontmatter', async () => {
    await writeMd('dashed.md', [
      '---',
      '{ "name": "dashed", "description": "Dashed style" }',
      '---',
      '',
      'Body content.',
    ].join('\n'));

    const agents = await discoverAgents(tmpDir);
    expect(agents).toHaveLength(1);
    expect(agents[0].name).toBe('dashed');
  });

  it('skips a file with no frontmatter', async () => {
    await writeMd('nofm.md', 'Just a plain markdown file.');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const agents = await discoverAgents(tmpDir);
    expect(agents).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('skips a file with missing name', async () => {
    await writeMd('noname.md', [
      '```json',
      '{ "description": "No name field" }',
      '```',
      'Body.',
    ].join('\n'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const agents = await discoverAgents(tmpDir);
    expect(agents).toHaveLength(0);
    warnSpy.mockRestore();
  });

  it('logs warning for unknown model', async () => {
    await writeMd('badmodel.md', [
      '```json',
      '{ "name": "badmodel", "description": "Bad model ref", "model": "nonexistent-model" }',
      '```',
      'Body.',
    ].join('\n'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const agents = await discoverAgents(tmpDir, {
      isValidModel: (m) => m === 'claude-sonnet-4-6',
    });
    expect(agents).toHaveLength(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("model 'nonexistent-model' not found"),
    );
    warnSpy.mockRestore();
  });

  it('returns empty array when directory does not exist', async () => {
    const agents = await discoverAgents('/nonexistent/path/to/agents');
    expect(agents).toHaveLength(0);
  });

  it('returns multiple agents from multiple files', async () => {
    await writeMd('a.md', '```json\n{ "name": "a", "description": "Agent A" }\n```\nA body.');
    await writeMd('b.md', '```json\n{ "name": "b", "description": "Agent B" }\n```\nB body.');
    await writeMd('c.md', '```json\n{ "name": "c", "description": "Agent C" }\n```\nC body.');

    const agents = await discoverAgents(tmpDir);
    expect(agents).toHaveLength(3);
    const names = agents.map((a) => a.name).sort();
    expect(names).toEqual(['a', 'b', 'c']);
  });

  it('ignores non-.md files', async () => {
    await writeMd('agent.md', '```json\n{ "name": "valid", "description": "ok" }\n```\nBody.');
    await writeFile(path.join(tmpDir, 'notes.txt'), 'not an agent');

    const agents = await discoverAgents(tmpDir);
    expect(agents).toHaveLength(1);
  });
});
