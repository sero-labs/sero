#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';

const [, , rawTag, outputPath = 'release-notes.md', changelogPath = 'CHANGELOG.md'] = process.argv;

if (!rawTag) {
  throw new Error('Usage: extract-changelog-release-notes.mjs <tag> [output-path]');
}

const version = rawTag.replace(/^v/, '');
const changelog = await readFile(changelogPath, 'utf8');
const headingPattern = /^##\s+\[([^\]]+)\].*$/gm;
let match;
let start = -1;
let end = changelog.length;

while ((match = headingPattern.exec(changelog)) !== null) {
  if (match[1] === version) {
    start = headingPattern.lastIndex;
    const next = headingPattern.exec(changelog);
    end = next?.index ?? changelog.length;
    break;
  }
}

if (start === -1) {
  throw new Error(`No CHANGELOG.md entry found for ${rawTag}`);
}

const notes = changelog.slice(start, end).trim();

await writeFile(outputPath, `${notes || `Release ${rawTag}`}\n`);
