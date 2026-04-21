import type * as React from 'react';

declare global {
  interface WebviewNavigationEvent extends Event {
    url: string;
    preventDefault(): void;
  }

  interface WebviewLoadErrorEvent extends Event {
    errorDescription: string;
    validatedURL?: string;
  }

  interface HTMLWebViewElement extends HTMLElement {
    src: string;
    partition: string;
    stop(): void;
    reload(): void;
    loadURL(url: string): void;
    addEventListener(type: 'will-navigate', listener: (event: WebviewNavigationEvent) => void): void;
    addEventListener(type: 'did-start-loading', listener: () => void): void;
    addEventListener(type: 'did-stop-loading', listener: () => void): void;
    addEventListener(type: 'did-fail-load', listener: (event: WebviewLoadErrorEvent) => void): void;
    removeEventListener(type: 'will-navigate', listener: (event: WebviewNavigationEvent) => void): void;
    removeEventListener(type: 'did-start-loading', listener: () => void): void;
    removeEventListener(type: 'did-stop-loading', listener: () => void): void;
    removeEventListener(type: 'did-fail-load', listener: (event: WebviewLoadErrorEvent) => void): void;
  }

  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLWebViewElement>, HTMLWebViewElement> & {
        src?: string;
        partition?: string;
        allowpopups?: 'true' | 'false';
        webpreferences?: string;
      };
    }
  }
}

export {};
