/**
 * Standalone entry point for Count Slopula dev mode.
 *
 * When running `pnpm dev`, Vite serves this as the root entry so
 * the app can be previewed in a browser at localhost:5186.
 * In production the host loads Count Slopula via Module Federation.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CountSlopula } from './CountSlopula';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <CountSlopula />
  </StrictMode>,
);
