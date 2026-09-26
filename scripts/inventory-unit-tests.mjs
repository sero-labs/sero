#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const loadDesktopDependency = createRequire(path.join(root, 'apps/desktop/package.json'));
const ts = loadDesktopDependency('typescript');
const testFile = /\.test\.[cm]?[jt]sx?$/;
const specFile = /\.spec\.[cm]?[jt]sx?$/;

function testKind(file) {
  if (/(?:^|\/)(?:bench|benchmark|benchmarks)(?:\/|\.)/.test(file)) return 'benchmark';
  if (/(?:^|\/)(?:e2e|end-to-end)(?:\/|\.)/.test(file)) return 'e2e-helper';
  return 'unit';
}

function area(file) {
  if (file.startsWith('apps/desktop/electron/')) return 'apps/desktop/electron';
  if (file.startsWith('apps/desktop/')) return 'apps/desktop/renderer';
  const parts = file.split('/');
  return ['apps', 'plugins', 'packages'].includes(parts[0]) ? parts.slice(0, 2).join('/') : parts[0];
}

function calledName(expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return calledName(expression.expression);
  if (ts.isCallExpression(expression)) return calledName(expression.expression);
  return undefined;
}

function signals(test, source) {
  const body = test.node.getText(source);
  const found = [];
  if (/toHaveTextContent|toContainText|toHaveAccessibleName|\.textContent\b|\.innerText\b|\b(?:value|label|sub):\s*['"`]|toBe\(['"`][^'"`]*\s[^'"`]*['"`]\)/.test(body)) found.push('copy');
  if (/querySelector(?:All)?\(|\.className\b|\.classList\b|\.outerHTML\b|\.innerHTML\b|\.children\b|getAttribute\(['"`]class/.test(body)) found.push('dom-detail');
  if (/\breadFile(?:Sync)?\s*\(/.test(body)) found.push('source-scan');
  if (/toMatch(?:Inline)?Snapshot\s*\(/.test(body)) found.push('snapshot');
  if (/toHaveBeenCalled(?:With|Times)?\s*\(|\.mock\.calls\b/.test(body)) found.push('mock-call');
  return found;
}

function declarations(source) {
  const tests = [];
  function visit(node) {
    if (ts.isCallExpression(node) && ['it', 'test', 'specify'].includes(calledName(node.expression))) {
      const title = node.arguments[0];
      if (title && !(ts.isCallExpression(node.parent) && node.parent.expression === node)) {
        const name = ts.isStringLiteral(title) || ts.isNoSubstitutionTemplateLiteral(title)
          ? title.text : `<dynamic: ${title.getText(source).slice(0, 60)}>`;
        tests.push({ name, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, node });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return tests;
}

const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, maxBuffer: 16 * 1024 * 1024 })
  .toString('utf8').split('\0').filter(Boolean).sort();
const report = { totals: { files: 0, declarations: 0, lines: 0 }, kinds: {}, areas: {}, specs: { files: 0 }, files: [], candidates: [] };

for (const file of tracked) {
  if (specFile.test(file)) report.specs.files++;
  if (!testFile.test(file)) continue;
  const text = readFileSync(path.join(root, file), 'utf8');
  let scriptKind = ts.ScriptKind.TS;
  if (/\.[cm]?[jt]sx$/.test(file)) scriptKind = ts.ScriptKind.TSX;
  else if (/\.[cm]?js$/.test(file)) scriptKind = ts.ScriptKind.JS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind);
  const tests = declarations(source);
  const fileLines = text.split('\n');
  const lines = fileLines.length - Number(text.endsWith('\n'));
  const kind = testKind(file);
  const owner = area(file);
  const entry = { file, kind, area: owner, lines, declarations: tests.length };
  report.files.push(entry);
  for (const test of tests) {
    const found = signals(test, source);
    if (found.length) report.candidates.push({ file, line: test.line, name: test.name, signals: found,
      excerpt: fileLines[test.line - 1]?.trim().slice(0, 160) ?? '' });
  }
  for (const bucket of [report.totals, report.kinds[kind] ??= { files: 0, declarations: 0, lines: 0 },
    report.areas[owner] ??= { files: 0, declarations: 0, lines: 0 }]) {
    bucket.files++;
    bucket.declarations += tests.length;
    bucket.lines += lines;
  }
}

if (process.argv.includes('--candidates')) console.log(JSON.stringify(report.candidates, null, 2));
else if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`Tracked .test.*: ${report.totals.files} files, ${report.totals.declarations} static declarations, ${report.totals.lines} lines`);
  console.log(`Tracked .spec.* (separate): ${report.specs.files} files`);
  console.log(`Review leads: ${report.candidates.length} test declarations (signals do not authorize deletion)`);
  for (const [kind, count] of Object.entries(report.kinds).sort()) console.log(`${kind}: ${count.files} files, ${count.declarations} declarations`);
  for (const [owner, count] of Object.entries(report.areas).sort()) console.log(`${owner}: ${count.files} files, ${count.declarations} declarations, ${count.lines} lines`);
}
