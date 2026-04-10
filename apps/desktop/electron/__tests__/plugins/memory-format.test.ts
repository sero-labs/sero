import { describe, expect, it } from 'vitest';

import {
  MEMORY_V2_MARKER,
  formatMemoryEntry,
  hasMemoryV2Marker,
  normalizeEntryType,
  normalizeLegacyMemory,
  normalizeManagedMarkdown,
  parseMemoryEntries,
  renderMemoryForRead,
  serializeMemoryEntries,
  stripEntryIdComments,
  stripManagedFileMetadata,
  type MemoryEntry,
} from '@plugins/sero-memory-plugin/extension/memory-format';

// ── Helpers ────────────────────────────────────────────────────

function makeEntry(overrides: Partial<MemoryEntry> & { text: string }): MemoryEntry {
  return {
    id: overrides.id ?? 'mem-aaa000',
    hasId: true,
    type: overrides.type ?? 'fact',
    text: overrides.text,
    line: overrides.line ?? 0,
    raw: overrides.raw ?? '',
  };
}

const V2_DOC = [
  '<!-- last updated: 2026-04-01 12:00 -->',
  MEMORY_V2_MARKER,
  '# Memory',
  '',
  '§ [fact] Project uses TypeScript <!-- id: mem-aaa111 -->',
  '§ [decision] Chose Clerk for auth <!-- id: mem-bbb222 -->',
  '§ [preference] Always use pnpm <!-- id: mem-ccc333 -->',
].join('\n');

// ── parseMemoryEntries ─────────────────────────────────────────

describe('parseMemoryEntries', () => {
  it('parses v2 structured entries with § prefix, type tag, and ID comment', () => {
    const entries = parseMemoryEntries(V2_DOC);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({
      id: 'mem-aaa111',
      hasId: true,
      type: 'fact',
      text: 'Project uses TypeScript',
    });
    expect(entries[1]).toMatchObject({
      id: 'mem-bbb222',
      type: 'decision',
      text: 'Chose Clerk for auth',
    });
    expect(entries[2]).toMatchObject({
      id: 'mem-ccc333',
      type: 'preference',
      text: 'Always use pnpm',
    });
  });

  it('assigns generated IDs to entries missing <!-- id: ... -->', () => {
    const doc = [
      '# Memory',
      '',
      '§ [fact] No ID on this entry',
    ].join('\n');
    const entries = parseMemoryEntries(doc);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.id).toMatch(/^mem-[a-f0-9]+$/);
    expect(entries[0]!.hasId).toBe(false);
  });

  it('ignores headings, blank lines, and HTML comments', () => {
    const doc = [
      '# Memory',
      '',
      '<!-- some comment -->',
      '## Section',
      '',
      '§ [fact] Only real entry <!-- id: mem-abc123 -->',
    ].join('\n');
    const entries = parseMemoryEntries(doc);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toBe('Only real entry');
  });

  it('returns empty array for legacy entries without § prefix', () => {
    const doc = [
      '# Memory',
      '',
      '- Project uses TypeScript',
      '- Chose Clerk for auth',
    ].join('\n');
    const entries = parseMemoryEntries(doc);
    expect(entries).toHaveLength(0);
  });
});

// ── normalizeLegacyMemory ──────────────────────────────────────

describe('normalizeLegacyMemory', () => {
  it('converts bullet lists under headings into typed entries', () => {
    const content = [
      '# Memory',
      '',
      '## Decisions',
      '- Chose Clerk for auth',
      '- Deploy on fly.io',
    ].join('\n');
    const entries = normalizeLegacyMemory(content);
    expect(entries).toHaveLength(2);
    expect(entries[0]!.type).toBe('decision');
    expect(entries[0]!.text).toBe('Chose Clerk for auth');
    expect(entries[1]!.type).toBe('decision');
  });

  it('infers type from heading keywords', () => {
    const content = [
      '## Preferences',
      '- Always use pnpm',
      '## Lessons',
      '- Never trust user input',
    ].join('\n');
    const entries = normalizeLegacyMemory(content);
    expect(entries[0]!.type).toBe('preference');
    expect(entries[1]!.type).toBe('lesson');
  });

  it('deduplicates entries with identical text and type', () => {
    const content = [
      '## Facts',
      '- Project uses TypeScript',
      '- Project uses TypeScript',
    ].join('\n');
    const entries = normalizeLegacyMemory(content);
    expect(entries).toHaveLength(1);
  });

  it('strips standalone timestamp comments', () => {
    const content = [
      '# Memory',
      '<!-- 2026-04-01 12:00 -->',
      '- Some fact',
    ].join('\n');
    const entries = normalizeLegacyMemory(content);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toBe('Some fact');
  });

  it('handles plain paragraphs (joins into a single fact entry)', () => {
    const content = [
      '# Memory',
      '',
      'The project started in January.',
      'We use a monorepo structure.',
    ].join('\n');
    const entries = normalizeLegacyMemory(content);
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries[0]!.type).toBe('fact');
  });

  it('assigns generated IDs to all entries', () => {
    const content = '- First fact\n- Second fact';
    const entries = normalizeLegacyMemory(content);
    for (const entry of entries) {
      expect(entry.id).toMatch(/^mem-[a-f0-9]+$/);
      expect(entry.hasId).toBe(true);
    }
  });
});

// ── serializeMemoryEntries ─────────────────────────────────────

describe('serializeMemoryEntries', () => {
  it('round-trips: parse → serialize → parse produces identical entries', () => {
    const original = parseMemoryEntries(V2_DOC);
    const serialized = serializeMemoryEntries(original, '2026-04-01 12:00');
    const reparsed = parseMemoryEntries(serialized);
    expect(reparsed).toHaveLength(original.length);
    for (let i = 0; i < original.length; i++) {
      expect(reparsed[i]!.id).toBe(original[i]!.id);
      expect(reparsed[i]!.type).toBe(original[i]!.type);
      expect(reparsed[i]!.text).toBe(original[i]!.text);
    }
  });

  it('includes v2 marker and last-updated comment', () => {
    const entries = [makeEntry({ text: 'hello', id: 'mem-aaa000' })];
    const serialized = serializeMemoryEntries(entries, '2026-04-01 12:00');
    expect(serialized).toContain(MEMORY_V2_MARKER);
    expect(serialized).toContain('<!-- last updated: 2026-04-01 12:00 -->');
  });

  it('formats each entry as § [type] text <!-- id: mem-xxxx -->', () => {
    const entries = [
      makeEntry({ text: 'Uses TypeScript', type: 'fact', id: 'mem-abc123' }),
    ];
    const serialized = serializeMemoryEntries(entries, '2026-04-01 12:00');
    expect(serialized).toContain('§ [fact] Uses TypeScript <!-- id: mem-abc123 -->');
  });

  it('handles empty entries array', () => {
    const serialized = serializeMemoryEntries([], '2026-04-01 12:00');
    expect(serialized).toContain(MEMORY_V2_MARKER);
    expect(serialized).not.toContain('§');
  });
});

// ── normalizeEntryType ─────────────────────────────────────────

describe('normalizeEntryType', () => {
  it('maps valid types to themselves', () => {
    for (const type of ['fact', 'decision', 'preference', 'lesson', 'question', 'hypothesis']) {
      expect(normalizeEntryType(type)).toBe(type);
    }
  });

  it('maps unknown strings to fact', () => {
    expect(normalizeEntryType('bogus')).toBe('fact');
    expect(normalizeEntryType('note')).toBe('fact');
  });

  it('maps undefined to fact', () => {
    expect(normalizeEntryType(undefined)).toBe('fact');
  });

  it('handles uppercase/mixed case', () => {
    expect(normalizeEntryType('DECISION')).toBe('decision');
    expect(normalizeEntryType('Preference')).toBe('preference');
  });
});

// ── renderMemoryForRead ────────────────────────────────────────

describe('renderMemoryForRead', () => {
  it('with_ids=false strips ID comments from output', () => {
    const rendered = renderMemoryForRead(V2_DOC, false);
    expect(rendered).not.toContain('<!-- id:');
    expect(rendered).toContain('Project uses TypeScript');
  });

  it('with_ids=true preserves ID comments', () => {
    const rendered = renderMemoryForRead(V2_DOC, true);
    expect(rendered).toContain('<!-- id: mem-aaa111 -->');
  });

  it('strips file metadata headers either way', () => {
    const withIds = renderMemoryForRead(V2_DOC, true);
    const withoutIds = renderMemoryForRead(V2_DOC, false);
    expect(withIds).not.toContain('<!-- last updated:');
    expect(withIds).not.toContain(MEMORY_V2_MARKER);
    expect(withoutIds).not.toContain('<!-- last updated:');
    expect(withoutIds).not.toContain(MEMORY_V2_MARKER);
  });
});

// ── normalizeManagedMarkdown ───────────────────────────────────

describe('normalizeManagedMarkdown', () => {
  it('adds last-updated header', () => {
    const result = normalizeManagedMarkdown('Some content');
    expect(result).toMatch(/^<!-- last updated: .+ -->/);
  });

  it('strips existing metadata headers', () => {
    const input = [
      '<!-- last updated: 2026-01-01 00:00 -->',
      MEMORY_V2_MARKER,
      'Actual content',
    ].join('\n');
    const result = normalizeManagedMarkdown(input);
    // Should have exactly one last-updated header (the new one)
    const matches = result.match(/<!-- last updated:/g);
    expect(matches).toHaveLength(1);
    expect(result).toContain('Actual content');
  });

  it('removes standalone timestamp lines', () => {
    const input = [
      '<!-- 2026-04-01 12:00 -->',
      'Real content',
      '<!-- 2026-03-28 09:30:00 -->',
    ].join('\n');
    const result = normalizeManagedMarkdown(input);
    expect(result).not.toMatch(/<!-- 2026-04-01/);
    expect(result).not.toMatch(/<!-- 2026-03-28/);
    expect(result).toContain('Real content');
  });

  it('returns minimal output for empty content', () => {
    const result = normalizeManagedMarkdown('');
    expect(result).toMatch(/^<!-- last updated: .+ -->\n$/);
  });
});

// ── Misc helpers ───────────────────────────────────────────────

describe('utility helpers', () => {
  it('hasMemoryV2Marker detects the v2 marker', () => {
    expect(hasMemoryV2Marker(V2_DOC)).toBe(true);
    expect(hasMemoryV2Marker('plain content')).toBe(false);
  });

  it('stripManagedFileMetadata removes headers', () => {
    const result = stripManagedFileMetadata(V2_DOC);
    expect(result).not.toContain('<!-- last updated:');
    expect(result).not.toContain(MEMORY_V2_MARKER);
    expect(result).toContain('§ [fact]');
  });

  it('stripEntryIdComments removes IDs', () => {
    const result = stripEntryIdComments('§ [fact] Hello <!-- id: mem-abc123 -->');
    expect(result).toBe('§ [fact] Hello');
  });

  it('formatMemoryEntry produces the canonical format', () => {
    const result = formatMemoryEntry({ id: 'mem-abc123', type: 'decision', text: 'Use pnpm' });
    expect(result).toBe('§ [decision] Use pnpm <!-- id: mem-abc123 -->');
  });
});
