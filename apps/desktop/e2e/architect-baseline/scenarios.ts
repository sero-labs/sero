/**
 * The five baseline scenarios: a small fix, a debugging task, a substantial
 * feature, collaborative research and an interrupted run.
 *
 * Each is small enough for a cheap model to finish in minutes. The starting
 * workspace is plain ESM JavaScript so `node --test` needs no toolchain. Every
 * scenario's checks must fail on the untouched seed, which is what shows they
 * measure the delivered work and not the starting point. The seed and hidden
 * test sources avoid template literals so they can sit in template strings here.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { BaselineScenario } from '../../../../plugins/sero-architect-plugin/runtime/baseline';
import type { CheckDefinition } from './checks';

export interface ScenarioDefinition {
  id: BaselineScenario;
  /** The user's request, word for word. Both strategies receive exactly this. */
  request: string;
  /** The starting workspace, relative path to content. */
  files: Record<string, string>;
  /** True when the request itself asks for an independent reviewer. */
  requiresIndependentReview: boolean;
  checks: CheckDefinition[];
  /**
   * Files a correct solution adds or replaces. Used only before paid runs, to
   * show the hidden checks can be passed. A candidate never sees them.
   */
  reference: Record<string, string>;
  /** Writes the starting workspace into an empty folder. */
  seed(folder: string): void;
}

export function writeFiles(folder: string, files: Record<string, string>): void {
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(folder, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, 'utf8');
  }
}

function define(input: Omit<ScenarioDefinition, 'seed'>): ScenarioDefinition {
  return { ...input, seed: (folder) => writeFiles(folder, input.files) };
}

const packageJson = (name: string): string => `${JSON.stringify({
  name, version: '0.1.0', private: true, type: 'module', scripts: { test: 'node --test' },
}, null, 2)}\n`;

const NODE_TEST_HEADER = "import test from 'node:test';\nimport assert from 'node:assert/strict';\n";

const smallFix = define({
  id: 'small-fix',
  request: 'In src/text.js, truncate(text, max) is meant to return a string of at most max characters, ending in "..." when it had to cut the text. It sometimes returns something longer than max. Fix it and leave the other behaviour alone.',
  requiresIndependentReview: false,
  files: {
    'package.json': packageJson('textkit'),
    'README.md': '# textkit\n\nSmall text helpers.\n',
    'src/text.js': [
      '// Helpers for list views.',
      'export function truncate(text, max) {',
      '  if (text.length <= max) return text;',
      "  return text.slice(0, max) + '...';",
      '}',
      '',
      'export function capitalize(text) {',
      '  return text.charAt(0).toUpperCase() + text.slice(1);',
      '}',
      '',
    ].join('\n'),
    'test/text.test.js': `${NODE_TEST_HEADER}import { truncate, capitalize } from '../src/text.js';

test('short text is left alone', () => assert.equal(truncate('hi', 5), 'hi'));
test('capitalize raises the first letter', () => assert.equal(capitalize('ab'), 'Ab'));
`,
  },
  checks: [{
    id: 'truncate-respects-max',
    summary: 'truncate never returns more than max characters and ends in "..." when it cut',
    kind: 'node-test',
    files: {
      '__acceptance__/small-fix.test.js': `${NODE_TEST_HEADER}import { truncate, capitalize } from '../src/text.js';

test('a cut result fits in max and ends in an ellipsis', () => {
  assert.equal(truncate('hello world', 8), 'hello...');
  assert.equal(truncate('hello world', 5), 'he...');
});
test('text that already fits is returned unchanged', () => {
  assert.equal(truncate('hello world', 11), 'hello world');
  assert.equal(truncate('abc', 3), 'abc');
});
test('capitalize is unchanged', () => assert.equal(capitalize('ab'), 'Ab'));
`,
    },
  }],
  reference: {
    'src/text.js': [
      'export function truncate(text, max) {',
      '  if (text.length <= max) return text;',
      "  return text.slice(0, max - 3) + '...';",
      '}',
      '',
      'export function capitalize(text) {',
      '  return text.charAt(0).toUpperCase() + text.slice(1);',
      '}',
      '',
    ].join('\n'),
  },
});

const debugging = define({
  id: 'debugging',
  request: 'Some invoice totals are off by a cent. For one item at 1999 cents, quantity 1, with a 15 percent discount and 8 percent tax, invoiceTotal(order) in src/invoice.js returns 1836 and the right answer is 1835. Every percentage amount is rounded to the nearest cent, halves rounding up. Find the cause and fix it properly.',
  requiresIndependentReview: false,
  files: {
    'package.json': packageJson('orders'),
    'src/money.js': [
      '// Money is whole cents.',
      'export function percentOf(cents, percent) {',
      '  return Math.floor((cents * percent) / 100);',
      '}',
      '',
      'export function sum(values) {',
      '  return values.reduce((total, value) => total + value, 0);',
      '}',
      '',
    ].join('\n'),
    'src/pricing.js': [
      "import { percentOf, sum } from './money.js';",
      '',
      'export function subtotal(items) {',
      '  return sum(items.map((item) => item.priceCents * item.quantity));',
      '}',
      '',
      'export function discountFor(amountCents, discountPercent) {',
      '  return percentOf(amountCents, discountPercent);',
      '}',
      '',
    ].join('\n'),
    'src/tax.js': [
      "import { percentOf } from './money.js';",
      '',
      'export function taxFor(amountCents, taxPercent) {',
      '  return percentOf(amountCents, taxPercent);',
      '}',
      '',
    ].join('\n'),
    'src/invoice.js': [
      "import { subtotal, discountFor } from './pricing.js';",
      "import { taxFor } from './tax.js';",
      '',
      'export function invoiceTotal(order) {',
      '  const base = subtotal(order.items);',
      '  const net = base - discountFor(base, order.discountPercent ?? 0);',
      '  return net + taxFor(net, order.taxPercent ?? 0);',
      '}',
      '',
    ].join('\n'),
    'test/invoice.test.js': `${NODE_TEST_HEADER}import { invoiceTotal } from '../src/invoice.js';

test('a round order totals exactly', () => {
  assert.equal(invoiceTotal({ items: [{ priceCents: 1000, quantity: 2 }], discountPercent: 10, taxPercent: 10 }), 1980);
});
`,
  },
  checks: [{
    id: 'rounding-fixed-at-its-source',
    summary: 'percentage amounts round to the nearest cent everywhere they are used, not only in invoiceTotal',
    kind: 'node-test',
    files: {
      '__acceptance__/debugging.test.js': `${NODE_TEST_HEADER}import { percentOf } from '../src/money.js';
import { discountFor } from '../src/pricing.js';
import { taxFor } from '../src/tax.js';
import { invoiceTotal } from '../src/invoice.js';

test('the reported order totals 1835', () => {
  assert.equal(invoiceTotal({ items: [{ priceCents: 1999, quantity: 1 }], discountPercent: 15, taxPercent: 8 }), 1835);
});
test('percentOf rounds to the nearest cent, halves up', () => {
  assert.equal(percentOf(1999, 15), 300);
  assert.equal(percentOf(5, 50), 3);
  assert.equal(percentOf(1000, 10), 100);
  assert.equal(percentOf(0, 25), 0);
});
test('the other callers get the same rounding', () => {
  assert.equal(discountFor(1999, 15), 300);
  assert.equal(taxFor(1999, 15), 300);
});
test('another order with a half cent', () => {
  assert.equal(invoiceTotal({ items: [{ priceCents: 250, quantity: 3 }], discountPercent: 5, taxPercent: 10 }), 783);
});
`,
    },
  }],
  reference: {
    'src/money.js': [
      'export function percentOf(cents, percent) {',
      '  return Math.round((cents * percent) / 100);',
      '}',
      '',
      'export function sum(values) {',
      '  return values.reduce((total, value) => total + value, 0);',
      '}',
      '',
    ].join('\n'),
  },
});

const feature = define({
  id: 'substantial-feature',
  request: [
    'Add tags to the task list in this package.',
    '- store.add(title, { tags }) accepts an optional array of tags. Tags are trimmed and lower-cased, duplicates are dropped, and every task has a tags array, empty when none were given.',
    '- store.list({ tag }) returns only the tasks that have that tag, matched without regard to case. store.list() still returns every task.',
    '- formatTask in src/format.js appends the tags as " #tag" after the title, for example "[ ] 1 Buy milk #home #errand". A task with no tags prints as before.',
    '- In the CLI (src/cli.js), "add Buy milk --tag home --tag errand" adds a task with those tags, and "list --tag home" lists only that tag. An unknown option throws an Error whose message is "Unknown option: --x", and a --tag with no value throws "--tag needs a value".',
    'Before you finish, someone other than whoever wrote the change must review it, and their written findings go in REVIEW.md.',
  ].join('\n'),
  requiresIndependentReview: true,
  files: {
    'package.json': packageJson('tasks'),
    'src/store.js': [
      '// An in-memory task store.',
      'export function createStore() {',
      '  const tasks = [];',
      '  let nextId = 1;',
      '  return {',
      '    add(title) {',
      '      const task = { id: nextId++, title, done: false };',
      '      tasks.push(task);',
      '      return { ...task };',
      '    },',
      '    complete(id) {',
      '      const task = tasks.find((item) => item.id === id);',
      "      if (!task) throw new Error('No task ' + id);",
      '      task.done = true;',
      '      return { ...task };',
      '    },',
      '    list() {',
      '      return tasks.map((task) => ({ ...task }));',
      '    },',
      '  };',
      '}',
      '',
    ].join('\n'),
    'src/format.js': [
      'export function formatTask(task) {',
      "  return (task.done ? '[x]' : '[ ]') + ' ' + task.id + ' ' + task.title;",
      '}',
      '',
    ].join('\n'),
    'src/cli.js': [
      "import { formatTask } from './format.js';",
      '',
      '// Runs one command and returns the lines to print.',
      'export function run(store, argv) {',
      '  const [command, ...rest] = argv;',
      "  if (command === 'add') return [formatTask(store.add(rest.join(' ')))];",
      "  if (command === 'done') return [formatTask(store.complete(Number(rest[0])))];",
      "  if (command === 'list') return store.list().map(formatTask);",
      "  throw new Error('Unknown command: ' + command);",
      '}',
      '',
    ].join('\n'),
    'test/store.test.js': `${NODE_TEST_HEADER}import { createStore } from '../src/store.js';

test('add and complete', () => {
  const store = createStore();
  const task = store.add('Buy milk');
  assert.equal(store.complete(task.id).done, true);
});
`,
  },
  checks: [
    {
      id: 'tags-work-across-store-format-and-cli',
      summary: 'tags are stored, filtered, printed and accepted by the CLI as described',
      kind: 'node-test',
      files: {
        '__acceptance__/feature.test.js': `${NODE_TEST_HEADER}import { createStore } from '../src/store.js';
import { formatTask } from '../src/format.js';
import { run } from '../src/cli.js';

test('tags are normalised and always present', () => {
  const store = createStore();
  assert.deepEqual(store.add('a').tags, []);
  assert.deepEqual(store.add('b', { tags: [' Home ', 'home', 'Errand'] }).tags, ['home', 'errand']);
});
test('list filters by tag without regard to case', () => {
  const store = createStore();
  store.add('a', { tags: ['home'] });
  store.add('b', { tags: ['work'] });
  store.add('c');
  assert.deepEqual(store.list({ tag: 'HOME' }).map((task) => task.title), ['a']);
  assert.equal(store.list().length, 3);
});
test('format appends tags and leaves untagged tasks alone', () => {
  assert.equal(formatTask({ id: 1, title: 'Buy milk', done: false, tags: ['home', 'errand'] }), '[ ] 1 Buy milk #home #errand');
  assert.equal(formatTask({ id: 2, title: 'Rest', done: true, tags: [] }), '[x] 2 Rest');
  assert.equal(formatTask({ id: 3, title: 'Old', done: false }), '[ ] 3 Old');
});
test('the CLI adds tagged tasks and lists by tag', () => {
  const store = createStore();
  assert.deepEqual(run(store, ['add', 'Buy', 'milk', '--tag', 'home', '--tag', 'errand']), ['[ ] 1 Buy milk #home #errand']);
  run(store, ['add', '--tag', 'work', 'Write', 'report']);
  assert.deepEqual(run(store, ['list', '--tag', 'work']), ['[ ] 2 Write report #work']);
  assert.equal(run(store, ['list']).length, 2);
});
test('the CLI rejects bad options', () => {
  const store = createStore();
  assert.throws(() => run(store, ['add', 'x', '--color', 'red']), { message: 'Unknown option: --color' });
  assert.throws(() => run(store, ['add', 'x', '--tag']), { message: '--tag needs a value' });
});
`,
      },
    },
    { id: 'review-report-written', summary: 'REVIEW.md exists', kind: 'file-exists', path: 'REVIEW.md' },
  ],
  reference: {
    'REVIEW.md': 'Reviewed by a separate agent.\n',
    'src/store.js': [
      'export function createStore() {',
      '  const tasks = [];',
      '  let nextId = 1;',
      '  return {',
      '    add(title, options = {}) {',
      "      const tags = [...new Set((options.tags ?? []).map((tag) => tag.trim().toLowerCase()))];",
      '      const task = { id: nextId++, title, done: false, tags };',
      '      tasks.push(task);',
      '      return { ...task, tags: [...tags] };',
      '    },',
      '    complete(id) {',
      '      const task = tasks.find((item) => item.id === id);',
      "      if (!task) throw new Error('No task ' + id);",
      '      task.done = true;',
      '      return { ...task };',
      '    },',
      '    list(filter = {}) {',
      '      const wanted = filter.tag?.toLowerCase();',
      '      return tasks.filter((task) => !wanted || task.tags.includes(wanted)).map((task) => ({ ...task }));',
      '    },',
      '  };',
      '}',
      '',
    ].join('\n'),
    'src/format.js': [
      'export function formatTask(task) {',
      "  const tags = (task.tags ?? []).map((tag) => ' #' + tag).join('');",
      "  return (task.done ? '[x]' : '[ ]') + ' ' + task.id + ' ' + task.title + tags;",
      '}',
      '',
    ].join('\n'),
    'src/cli.js': [
      "import { formatTask } from './format.js';",
      '',
      'function parse(args) {',
      '  const words = [];',
      '  const tags = [];',
      '  for (let index = 0; index < args.length; index += 1) {',
      '    const arg = args[index];',
      "    if (arg === '--tag') {",
      '      const value = args[index + 1];',
      "      if (value === undefined || value.startsWith('--')) throw new Error('--tag needs a value');",
      '      tags.push(value);',
      '      index += 1;',
      "    } else if (arg.startsWith('--')) {",
      "      throw new Error('Unknown option: ' + arg);",
      '    } else {',
      '      words.push(arg);',
      '    }',
      '  }',
      '  return { words, tags };',
      '}',
      '',
      'export function run(store, argv) {',
      '  const [command, ...rest] = argv;',
      '  const { words, tags } = parse(rest);',
      "  if (command === 'add') return [formatTask(store.add(words.join(' '), { tags }))];",
      "  if (command === 'done') return [formatTask(store.complete(Number(words[0])))];",
      "  if (command === 'list') return store.list({ tag: tags[0] }).map(formatTask);",
      "  throw new Error('Unknown command: ' + command);",
      '}',
      '',
    ].join('\n'),
  },
});

const research = define({
  id: 'collaborative-research',
  request: [
    'I need answers about this codebase, not changes to it. Find out which files under src/ call retryWithBackoff, what number of attempts it uses by default, and which callers override the number of attempts and with what value.',
    'Write what you find to FINDINGS.md. End the file with one fenced json block of exactly this shape, with paths relative to the repository root:',
    '{"callers": ["src/a.js"], "defaultAttempts": 3, "attemptOverrides": {"src/a.js": 2}}',
    'Do not change any source file.',
  ].join('\n'),
  requiresIndependentReview: false,
  files: {
    'package.json': packageJson('gateway'),
    'src/config.js': 'export const DEFAULTS = { attempts: 5, baseDelayMs: 250 };\n',
    'src/net/retry.js': [
      "import { DEFAULTS } from '../config.js';",
      '',
      'export async function retryWithBackoff(task, options = {}) {',
      '  const attempts = options.attempts ?? DEFAULTS.attempts;',
      '  const baseDelayMs = options.baseDelayMs ?? DEFAULTS.baseDelayMs;',
      '  let lastError;',
      '  for (let attempt = 0; attempt < attempts; attempt += 1) {',
      '    try {',
      '      return await task();',
      '    } catch (error) {',
      '      lastError = error;',
      '      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** attempt));',
      '    }',
      '  }',
      '  throw lastError;',
      '}',
      '',
    ].join('\n'),
    // Same prefix, different function: a reader who greps loosely will count it.
    'src/net/retry-sync.js': [
      'export function retryWithBackoffSync(task, attempts = 1) {',
      '  for (let attempt = 1; attempt < attempts; attempt += 1) {',
      '    try { return task(); } catch { /* try again */ }',
      '  }',
      '  return task();',
      '}',
      '',
    ].join('\n'),
    'src/sync/pull.js': [
      "import { retryWithBackoff } from '../net/retry.js';",
      '',
      'export function pull(fetchPage, cursor) {',
      '  return retryWithBackoff(() => fetchPage(cursor));',
      '}',
      '',
    ].join('\n'),
    'src/sync/push.js': [
      "import { retryWithBackoff } from '../net/retry.js';",
      '',
      'export function push(send, batch) {',
      '  return retryWithBackoff(() => send(batch), { baseDelayMs: 100 });',
      '}',
      '',
    ].join('\n'),
    'src/billing/charge.js': [
      "import { retryWithBackoff } from '../net/retry.js';",
      '',
      'export function charge(gateway, order) {',
      '  return retryWithBackoff(() => gateway.charge(order), { attempts: 2 });',
      '}',
      '',
    ].join('\n'),
    'src/billing/refund.js': [
      "import { retryWithBackoff } from '../net/retry.js';",
      '',
      'export function refund(gateway, order) {',
      '  return retryWithBackoff(() => gateway.refund(order), { attempts: 3 });',
      '}',
      '',
    ].join('\n'),
    // Mentions the name only in a comment, so it is not a caller.
    'src/legacy/old-sync.js': [
      '// This used to wrap its network call in retryWithBackoff before the sync rewrite.',
      'export function oldSync(send) {',
      '  return send();',
      '}',
      '',
    ].join('\n'),
  },
  checks: [{
    id: 'findings-match-the-codebase',
    summary: 'the json block in FINDINGS.md names the real callers, the default attempts and the overrides',
    kind: 'findings-block',
    path: 'FINDINGS.md',
    expected: {
      callers: ['src/billing/charge.js', 'src/billing/refund.js', 'src/sync/pull.js', 'src/sync/push.js'],
      defaultAttempts: 5,
      attemptOverrides: { 'src/billing/charge.js': 2, 'src/billing/refund.js': 3 },
    },
  }],
  reference: {
    'FINDINGS.md': [
      '# Findings',
      '',
      '```json',
      '{"callers": ["src/sync/push.js", "src/sync/pull.js", "src/billing/refund.js", "src/billing/charge.js"], "defaultAttempts": 5, "attemptOverrides": {"src/billing/refund.js": 3, "src/billing/charge.js": 2}}',
      '```',
      '',
    ].join('\n'),
  },
});

const interruption = define({
  id: 'interruption',
  request: [
    'Implement parseCsv(text) and toObjects(rows) in src/csv.js.',
    '- parseCsv returns an array of rows, each an array of strings. Fields are separated by commas. A field wrapped in double quotes may contain commas and line breaks, and "" inside it means one double quote.',
    '- Lines end with \\n or \\r\\n. A final line break does not add an empty row, and empty text gives [].',
    '- toObjects takes parsed rows whose first row is the header and returns one object per remaining row, keyed by the header. A short row gets empty strings for its missing columns.',
  ].join('\n'),
  requiresIndependentReview: false,
  files: {
    'package.json': packageJson('csvkit'),
    'src/csv.js': [
      "export function parseCsv(text) {",
      "  throw new Error('not implemented');",
      '}',
      '',
      'export function toObjects(rows) {',
      "  throw new Error('not implemented');",
      '}',
      '',
    ].join('\n'),
  },
  checks: [{
    id: 'csv-behaviour',
    summary: 'parseCsv and toObjects behave as described, including quoting, line endings and short rows',
    kind: 'node-test',
    files: {
      '__acceptance__/csv.test.js': `${NODE_TEST_HEADER}import { parseCsv, toObjects } from '../src/csv.js';

test('plain rows and both line endings', () => {
  assert.deepEqual(parseCsv('a,b\\n1,2\\n'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv('a,b\\r\\n1,2'), [['a', 'b'], ['1', '2']]);
});
test('empty text and empty fields', () => {
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('a,,c\\n'), [['a', '', 'c']]);
});
test('quoted fields', () => {
  assert.deepEqual(parseCsv('a,"b,c"\\n'), [['a', 'b,c']]);
  assert.deepEqual(parseCsv('"he said ""hi"""\\n'), [['he said "hi"']]);
  assert.deepEqual(parseCsv('"x\\ny",z'), [['x\\ny', 'z']]);
});
test('toObjects keys rows by the header and pads short rows', () => {
  assert.deepEqual(toObjects([['n', 'v'], ['a', '1'], ['b']]), [{ n: 'a', v: '1' }, { n: 'b', v: '' }]);
  assert.deepEqual(toObjects([['n', 'v']]), []);
});
`,
    },
  }],
  reference: {
    'src/csv.js': [
      'export function parseCsv(text) {',
      '  const rows = [];',
      '  let row = [];',
      "  let field = '';",
      '  let quoted = false;',
      '  let started = false;',
      '  for (let index = 0; index < text.length; index += 1) {',
      '    const char = text[index];',
      '    started = true;',
      '    if (quoted) {',
      "      if (char === '\"' && text[index + 1] === '\"') { field += '\"'; index += 1; }",
      "      else if (char === '\"') quoted = false;",
      '      else field += char;',
      "    } else if (char === '\"') quoted = true;",
      "    else if (char === ',') { row.push(field); field = ''; }",
      "    else if (char === '\\n' || char === '\\r') {",
      "      if (char === '\\r' && text[index + 1] === '\\n') index += 1;",
      "      row.push(field); rows.push(row); row = []; field = ''; started = false;",
      '    } else field += char;',
      '  }',
      '  if (started) { row.push(field); rows.push(row); }',
      '  return rows;',
      '}',
      '',
      'export function toObjects(rows) {',
      '  const [header = [], ...body] = rows;',
      "  return body.map((row) => Object.fromEntries(header.map((name, index) => [name, row[index] ?? ''])));",
      '}',
      '',
    ].join('\n'),
  },
});

export const SCENARIOS: readonly ScenarioDefinition[] = [smallFix, debugging, feature, research, interruption];
