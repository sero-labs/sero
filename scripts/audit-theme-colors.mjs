#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const strict = process.argv.includes('--strict');

const scanRoots = ['apps/desktop/src', 'apps/web-remote/src', 'packages/ui/src', 'plugins'];
const exts = new Set(['.ts', '.tsx', '.css']);
const ignoredParts = [
  `${path.sep}dist${path.sep}`,
  `${path.sep}node_modules${path.sep}`,
  `${path.sep}.turbo${path.sep}`,
  `${path.sep}theme${path.sep}types.ts`,
  `${path.sep}theme${path.sep}apply-theme.ts`,
  `${path.sep}styles${path.sep}globals.css`,
  `${path.sep}styles${path.sep}plugin.css`,
];

const checks = [
  {
    name: 'Hardcoded Tailwind palette utilities',
    pattern: /\b(?:bg|text|border|ring|outline|shadow|fill|stroke|from|to|via|decoration)-(?:emerald|purple|indigo|violet|green|blue|red|orange|yellow|rose|pink|cyan|sky|slate|zinc|neutral|gray|stone)-\d{2,3}\b/g,
    hint: 'Use semantic tokens such as text-brand-primary, bg-brand-secondary/10, or text-status-success.',
  },
  {
    name: 'Raw CSS colour literals',
    pattern: /#[0-9a-fA-F]{3,8}|rgba?\(|oklch\(|hsla?\(/g,
    hint: 'Move colours to theme tokens unless this is a local data visualisation or syntax palette.',
  },
  {
    name: '--status-success usage',
    pattern: /var\(--status-success(?:-[a-z]+)?\)/g,
    hint: 'Use status-success only for success/pass/running states. Use brand-primary for Sero green accents.',
  },
  {
    name: '--accent-code usage',
    pattern: /var\(--accent-code\)/g,
    hint: 'Use accent-code only for syntax/code. Use brand-secondary for purple UI accents.',
  },
];

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (ignoredParts.some((part) => full.includes(part))) continue;
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (exts.has(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

function lineForOffset(source, offset) {
  return source.slice(0, offset).split('\n').length;
}

function sourceLine(source, line) {
  return source.split('\n')[line - 1] ?? '';
}

const findings = new Map(checks.map((check) => [check.name, []]));

for (const scanRoot of scanRoots) {
  for (const file of walk(path.join(root, scanRoot))) {
    const source = fs.readFileSync(file, 'utf8');
    for (const check of checks) {
      for (const match of source.matchAll(check.pattern)) {
        const line = lineForOffset(source, match.index ?? 0);
        const text = sourceLine(source, line);
        if (check.name === '--accent-code usage' && text.includes('<code')) continue;
        findings.get(check.name)?.push({
          file: path.relative(root, file),
          line,
          value: match[0],
        });
      }
    }
  }
}

let total = 0;
console.log('Theme colour audit');
console.log('==================');

for (const check of checks) {
  const entries = findings.get(check.name) ?? [];
  total += entries.length;
  console.log(`\n${check.name}: ${entries.length}`);
  if (entries.length > 0) console.log(`  ${check.hint}`);
  for (const entry of entries.slice(0, 25)) {
    console.log(`  ${entry.file}:${entry.line}  ${entry.value}`);
  }
  if (entries.length > 25) console.log(`  ...and ${entries.length - 25} more`);
}

if (strict && total > 0) {
  console.error('\nTheme audit failed in --strict mode.');
  process.exit(1);
}

console.log(`\nTotal findings: ${total}`);
