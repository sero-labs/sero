import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ModelPickerBody, ProviderLogo } from './model-picker-body';

const GROUPS = [
  {
    provider: 'openai',
    displayName: 'OpenAI',
    logo: 'https://models.dev/logos/openai.svg',
    models: [
      { provider: 'openai', modelId: 'gpt-5', name: 'GPT-5', reasoning: true },
      { provider: 'openai', modelId: 'gpt-5-mini', name: 'GPT-5 Mini', reasoning: false },
    ],
  },
  {
    provider: 'anthropic',
    displayName: 'Anthropic',
    logo: '',
    models: [
      { provider: 'anthropic', modelId: 'claude-opus-5', name: 'Claude Opus 5', reasoning: true },
    ],
  },
];

describe('ProviderLogo', () => {
  it('renders nothing when the provider has no logo', () => {
    const html = renderToStaticMarkup(<ProviderLogo logo="" displayName="Anthropic" />);

    // An empty src renders a broken image, which looks like a fault.
    expect(html).toBe('');
  });

  it('hides itself when the logo fails to load', () => {
    // Logos are remote models.dev URLs. A phone on the local network may
    // have no route to the internet, and must not show broken images.
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    act(() => {
      root.render(<ProviderLogo logo="https://models.dev/logos/openai.svg" displayName="OpenAI" />);
    });
    const img = host.querySelector('img');
    expect(img).not.toBeNull();

    act(() => {
      img?.dispatchEvent(new Event('error', { bubbles: false }));
    });
    expect(host.querySelector('img')).toBeNull();

    act(() => root.unmount());
    host.remove();
  });
});

describe('ModelPickerBody', () => {
  it('lists every provider group and its models', () => {
    const html = renderToStaticMarkup(
      <ModelPickerBody groups={GROUPS} value="openai/gpt-5" onChange={vi.fn()} />,
    );

    expect(html).toContain('OpenAI');
    expect(html).toContain('Anthropic');
    expect(html).toContain('GPT-5 Mini');
    expect(html).toContain('Claude Opus 5');
  });

  it('shows no logos when the caller turns them off', () => {
    const withLogos = renderToStaticMarkup(
      <ModelPickerBody groups={GROUPS} value="" onChange={vi.fn()} />,
    );
    const withoutLogos = renderToStaticMarkup(
      <ModelPickerBody groups={GROUPS} value="" onChange={vi.fn()} showProviderLogos={false} />,
    );

    expect(withLogos).toContain('<img');
    expect(withoutLogos).not.toContain('<img');
  });

  it('says so when the host has no models at all', () => {
    const html = renderToStaticMarkup(
      <ModelPickerBody
        groups={[]}
        value=""
        onChange={vi.fn()}
        noModelsLabel="No models available"
      />,
    );

    expect(html).toContain('No models available');
  });

  it('hands back the selected model as provider/modelId', () => {
    const onChange = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        <ModelPickerBody
          groups={GROUPS}
          value="openai/gpt-5"
          onChange={onChange}
          autoFocusSearch={false}
        />,
      );
    });

    const button = [...host.querySelectorAll('button')].find(
      (candidate) => candidate.textContent?.includes('Claude Opus 5'),
    );
    act(() => button?.click());

    expect(onChange).toHaveBeenCalledWith('anthropic/claude-opus-5');

    act(() => root.unmount());
    host.remove();
  });

  it('filters the list by the search query', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        <ModelPickerBody groups={GROUPS} value="" onChange={vi.fn()} autoFocusSearch={false} />,
      );
    });

    const input = host.querySelector('input');
    expect(input).not.toBeNull();
    act(() => {
      // React tracks the value, so set it through the native setter.
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      setter?.call(input, 'opus');
      input?.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(host.textContent).toContain('Claude Opus 5');
    expect(host.textContent).not.toContain('GPT-5 Mini');

    act(() => root.unmount());
    host.remove();
  });
});
