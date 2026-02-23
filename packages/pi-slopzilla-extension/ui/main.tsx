/**
 * Standalone entry point for SlopZilla dev mode.
 *
 * When running `pnpm dev`, Vite serves this as the root entry so
 * the app can be previewed in a browser at localhost:5183.
 * In production the host loads SlopZilla via Module Federation.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SlopZilla } from './SlopZilla';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <SlopZilla />
  </StrictMode>,
);
