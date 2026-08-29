#!/usr/bin/env node

const path = require('node:path');
const { pathToFileURL } = require('node:url');

const promptfooEntry = require.resolve('promptfoo');
const promptfooRoot = path.resolve(path.dirname(promptfooEntry), '../..');
const manifest = require(path.join(promptfooRoot, 'package.json'));
const declaredBin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.promptfoo;
const userArgs = process.argv.slice(2);

if (!declaredBin) {
  throw new Error('The installed Promptfoo package does not declare a CLI entry point.');
}

const cliEntry = path.resolve(promptfooRoot, declaredBin);
delete process.versions.electron;
process.argv = [process.execPath, cliEntry, ...userArgs];

import(pathToFileURL(cliEntry).href).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
