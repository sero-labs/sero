// @vitest-environment jsdom

import { act, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sero-ai/ui/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: ReactNode; open: boolean }) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h1>{children}</h1>,
}));

vi.mock('@sero-ai/ui/components/ui/input', () => ({
  Input: (props: ComponentPropsWithoutRef<'input'>) => <input {...props} />,
}));

vi.mock('@sero-ai/ui/components/ui/button', () => ({
  Button: ({ children, ...props }: ComponentPropsWithoutRef<'button'>) => <button {...props}>{children}</button>,
}));

vi.mock('@sero-ai/ui/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@sero-ai/ui/components/ui/tabs', () => ({
  Tabs: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: ReactNode }) => <button>{children}</button>,
  TabsContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@sero-ai/ui/components/ui/plugin-safety-disclaimer', () => ({
  PluginSafetyDisclaimer: () => null,
}));

vi.mock('./AppStoreCard', () => ({ AppStoreCard: () => null }));
vi.mock('./DiscoverPluginCard', () => ({ DiscoverPluginCard: () => null }));

import { AppStoreDialog } from './AppStoreDialog';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const installFromFolder = vi.fn();
const originalSeroDescriptor = Object.getOwnPropertyDescriptor(window, 'sero');

function findButton(label: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.includes(label),
  );
  if (!button) throw new Error(`Expected button containing "${label}"`);
  return button;
}

describe('AppStoreDialog folder installation', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  const onOpenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    installFromFolder.mockResolvedValue({ id: 'release-checklist', name: 'Release Checklist' });
    Object.defineProperty(window, 'sero', {
      configurable: true,
      value: { plugins: { installFromFolder, search: vi.fn() } },
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
    }
    root = null;
    container.remove();
    if (originalSeroDescriptor) {
      Object.defineProperty(window, 'sero', originalSeroDescriptor);
    } else {
      Reflect.deleteProperty(window, 'sero');
    }
  });

  async function renderDialog(): Promise<void> {
    await act(async () => {
      root?.render(
        <AppStoreDialog
          open
          onOpenChange={onOpenChange}
          apps={[]}
          activeApp="orchestration"
          isFavourite={() => false}
          onToggleFavourite={vi.fn()}
          onActivateApp={vi.fn()}
        />,
      );
    });
  }

  it('installs the selected folder and closes after success', async () => {
    await renderDialog();

    await act(async () => {
      findButton('Install from folder').click();
      await Promise.resolve();
    });

    expect(installFromFolder).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('keeps the store open and shows an installation error', async () => {
    installFromFolder.mockRejectedValue(new Error('package.json is missing'));
    await renderDialog();

    await act(async () => {
      findButton('Install from folder').click();
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain("Couldn't install plugin");
    expect(document.body.textContent).toContain('package.json is missing');
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
