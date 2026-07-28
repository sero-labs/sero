/**
 * Throwaway layout preview — NOT part of the shipped plugin.
 *
 * The tray has to work inside the inspector, which is 280px at its narrowest,
 * and a layout decision taken in prose is a layout decision taken blind. This
 * page renders the real components at real widths so the choice can be made by
 * looking at it.
 *
 * Delete before the PR. It is excluded from the federation build — only
 * `ui/index.html` is an input — so it never reaches a user either way.
 */

import { AppProvider } from '@sero-ai/app-runtime';
import { createRoot } from 'react-dom/client';

// The host owns the Sero design tokens; the plugin stylesheet only references
// them. Without this the page renders with no colour at all, which is exactly
// the thing this preview exists to judge.
import './preview.css';
import './styles.css';

import type { DesignAsset, MediaAttempt, MediaProvenance } from '../shared/media';
import { VariantInspector } from './components/design/VariantInspector';

/** A tiny solid PNG, so ready tiles paint something without a provider. */
function swatch(hue: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 48;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createLinearGradient(0, 0, 64, 48);
    gradient.addColorStop(0, `hsl(${hue} 70% 60%)`);
    gradient.addColorStop(1, `hsl(${hue + 40} 60% 30%)`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 48);
  }
  return canvas.toDataURL('image/png').split(',')[1] ?? '';
}

const SWATCHES = [swatch(20), swatch(200), swatch(280)];

// Stand in for the preload bridge so `useAppTools` resolves images. `appState`
// is present because the bridge check requires it, not because this uses it.
(window as unknown as { sero: unknown }).sero = {
  appState: {},
  appAgent: {
    invokeTool: async (_appId: string, _wsId: string, _tool: string, params: Record<string, unknown>) => {
      const index = Number(String(params.assetId).replace(/\D/g, '')) % SWATCHES.length;
      return {
        content: [{ type: 'image', data: SWATCHES[index], mimeType: 'image/png' }],
        details: {},
      };
    },
  },
};

const PROVENANCE: MediaProvenance = {
  providerId: 'fal',
  capability: 'text-to-image',
  model: 'flux',
  prompt: '',
  parameters: {},
  startedAt: 0,
  completedAt: 1,
};

function attempt(overrides: Partial<MediaAttempt> & { id: string }): MediaAttempt {
  return { outcome: 'ready', startedAt: 0, completedAt: 1, ...overrides };
}

const ASSETS: DesignAsset[] = [
  {
    id: 'asset-1',
    kind: 'image',
    reference: 'assets/asset-1.png',
    request: { capability: 'text-to-image', prompt: 'A dark metallic hero surface with quiet gold accents' },
    attempts: [attempt({ id: 'a1', file: 'art.png', provenance: { ...PROVENANCE, costUsd: 0.04 } })],
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'asset-2',
    kind: 'image',
    reference: 'assets/asset-2.png',
    request: { capability: 'image-to-image', prompt: 'The same surface, colder and more editorial' },
    attempts: [attempt({ id: 'a2', file: 'art.png', provenance: { ...PROVENANCE, costUsd: 0.03 } })],
    createdAt: 0,
    updatedAt: 0,
    copiedItemId: 'item-7',
  },
  {
    id: 'asset-3',
    kind: 'image',
    reference: 'assets/asset-3.png',
    request: { capability: 'text-to-image', prompt: 'An abstract noise texture' },
    attempts: [],
    jobId: 'job-1',
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'asset-4',
    kind: 'image',
    reference: 'assets/asset-4.png',
    request: { capability: 'text-to-image', prompt: 'A grain overlay' },
    attempts: [
      attempt({
        id: 'a4',
        outcome: 'failed',
        provenance: { ...PROVENANCE, costUsd: 0.01 },
        error: { code: 'rate-limit', message: 'The provider is rate limiting.', retryable: true },
      }),
    ],
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'asset-5',
    kind: 'video',
    reference: 'assets/asset-5.mp4',
    request: { capability: 'text-to-video', prompt: 'A slow pan across the surface', durationSeconds: 4 },
    attempts: [attempt({ id: 'a5', file: 'clip.mp4', mediaType: 'video/mp4' })],
    createdAt: 0,
    updatedAt: 0,
  },
];

const TWEAKS = {
  manifest: { controls: [] },
  values: {},
  cssValues: {},
  set: () => undefined,
  reset: () => undefined,
  resetAll: () => undefined,
  checkpoint: () => undefined,
  restoreCheckpoint: () => undefined,
  omissions: [],
} as unknown as Parameters<typeof VariantInspector>[0]['tweaks'];

/** The whole inspector, so the five-tab row is judged where it actually lives. */
function Column({ width, label }: { width: number; label: string }) {
  return (
    <div>
      <p style={{ font: '12px/1.6 monospace', marginBottom: 8, color: '#888' }}>{label}</p>
      <div style={{ width, height: 760 }} className="bg-background flex min-h-0 flex-col">
        <VariantInspector
          variant={{
            id: 'variant-1',
            index: 0,
            name: 'Metallic study',
            status: 'ready',
            revisionCount: 2,
            warningCount: 0,
          }}
          revision={undefined}
          revisions={[]}
          brief={undefined}
          references={[]}
          ownReferenceId={undefined}
          tweaks={TWEAKS}
          designId="design-1"
          assets={ASSETS}
          onRetry={() => undefined}
          onCancel={() => undefined}
          onSelectRevision={() => undefined}
          onRetryAsset={() => undefined}
          onCopyAssetToLibrary={() => undefined}
          onDeleteAsset={() => undefined}
          onGenerateAsset={() => undefined}
        />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <div data-sero-plugin="design-library">
    <div className={new URLSearchParams(location.search).get('theme') === 'light' ? '' : 'dark'}>
    <div className="bg-background text-foreground flex gap-8 p-8" style={{ minHeight: '100vh' }}>
      <AppProvider
        value={{
          appId: 'design-library',
          workspaceId: 'preview',
          workspacePath: '/preview',
          stateFilePath: '/preview/state.json',
          themeMode: 'dark',
        }}
      >
        <Column width={280} label="280px — inspector at its narrowest" />
        <Column width={340} label="340px — a typical widened inspector" />
        <Column width={460} label="460px — dragged wide" />
      </AppProvider>
    </div>
    </div>
  </div>,
);
