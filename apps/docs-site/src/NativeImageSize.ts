import { useEffect } from 'react';

const DOC_IMAGE_SELECTOR = '.rspress-doc p > img';
const TOC_HIDDEN_CLASS = 'sero-toc-hidden';
const TOC_TOGGLE_CLASS = 'sero-toc-toggle';

function applyNativeLogicalSize(image: HTMLImageElement) {
  if (!image.complete || image.naturalWidth === 0) return;

  const scale = Math.max(1, Math.round(window.devicePixelRatio || 1));
  const width = Math.round(image.naturalWidth / scale);

  image.style.width = `${width}px`;
  image.style.maxWidth = '100%';
  image.style.height = 'auto';
}

function syncImages() {
  const images = document.querySelectorAll<HTMLImageElement>(DOC_IMAGE_SELECTOR);
  for (const image of images) {
    applyNativeLogicalSize(image);
    image.addEventListener('load', () => applyNativeLogicalSize(image), { once: true });
  }
}

function ensureTocToggle() {
  const existing = document.querySelector<HTMLButtonElement>(`.${TOC_TOGGLE_CLASS}`);
  if (existing) return existing;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = TOC_TOGGLE_CLASS;
  button.setAttribute('aria-pressed', 'false');

  const syncLabel = () => {
    const isHidden = document.body.classList.contains(TOC_HIDDEN_CLASS);
    button.textContent = isHidden ? 'Show index' : 'Hide index';
    button.setAttribute('aria-pressed', String(isHidden));
  };

  button.addEventListener('click', () => {
    document.body.classList.toggle(TOC_HIDDEN_CLASS);
    syncLabel();
  });

  syncLabel();
  document.body.appendChild(button);
  return button;
}

export default function NativeImageSize() {
  useEffect(() => {
    syncImages();
    ensureTocToggle();

    const observer = new MutationObserver(syncImages);
    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener('resize', syncImages);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', syncImages);
      document.querySelector<HTMLButtonElement>(`.${TOC_TOGGLE_CLASS}`)?.remove();
      document.body.classList.remove(TOC_HIDDEN_CLASS);
    };
  }, []);

  return null;
}
