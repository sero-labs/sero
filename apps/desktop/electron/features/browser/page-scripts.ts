export function buildExtractPageScript(): string {
  return `(() => {
    try {
      const title = document.title || '';
      const url = location.href;
      const body = document.body ? document.body.cloneNode(true) : null;
      if (!body) return { title, url, text: '' };
      const drop = ['script','style','noscript','nav','header','footer','aside','iframe','svg','canvas','form'];
      for (const sel of drop) {
        for (const el of body.querySelectorAll(sel)) el.remove();
      }
      // innerText is better than textContent — respects visibility and block breaks.
      const raw = body.innerText || '';
      const text = raw
        .split('\n')
        .map((l) => l.trim())
        .filter((l, i, a) => !(l === '' && a[i - 1] === ''))
        .join('\n')
        .trim();
      return { title, url, text };
    } catch (err) {
      return { title: document.title || '', url: location.href, text: '' };
    }
  })()`;
}

export function buildScrollPageScript(amount: number): string {
  return `(() => {
    const amount = ${JSON.stringify(amount)};
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const state = () => ({
      scrollX: Math.round(window.scrollX || 0),
      scrollY: Math.round(window.scrollY || 0),
      maxY: Math.max(0, Math.round((document.scrollingElement?.scrollHeight || 0) - window.innerHeight)),
    });
    const before = state();
    window.scrollBy({ top: amount, left: 0, behavior: 'auto' });
    const afterWindow = state();
    if (afterWindow.scrollY !== before.scrollY) return afterWindow;

    const elements = Array.from(document.querySelectorAll('*'));
    const scrollable = elements
      .filter((el) => el instanceof HTMLElement)
      .map((el) => ({ el, max: el.scrollHeight - el.clientHeight }))
      .filter((item) => item.max > 0)
      .sort((a, b) => b.max - a.max)[0];
    if (!scrollable) return afterWindow;

    scrollable.el.scrollTop = clamp(scrollable.el.scrollTop + amount, 0, scrollable.max);
    return {
      scrollX: Math.round(window.scrollX || 0),
      scrollY: Math.round(scrollable.el.scrollTop),
      maxY: Math.round(scrollable.max),
    };
  })()`;
}
