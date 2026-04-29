import { useEffect } from 'react';

const DOC_IMAGE_SELECTOR = '.rspress-doc p > img';

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

export default function NativeImageSize() {
  useEffect(() => {
    syncImages();

    const observer = new MutationObserver(syncImages);
    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener('resize', syncImages);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', syncImages);
    };
  }, []);

  return null;
}
