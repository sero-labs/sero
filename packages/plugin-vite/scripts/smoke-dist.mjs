import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, '..', 'dist');
const esm = await import(resolve(dist, 'index.js'));

if (typeof esm.seroPluginCssScope !== 'function') {
  throw new Error('Published entrypoint does not export seroPluginCssScope');
}

console.log('✓ plugin-vite ESM entrypoint resolves');
