/* Review controls only. The app surfaces above are static mark-up. */

const root = document.documentElement;

document.getElementById('theme-controls').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-theme]');
  if (!button) return;
  for (const other of event.currentTarget.querySelectorAll('button')) {
    other.classList.toggle('active', other === button);
  }
  root.classList.toggle('dark', button.dataset.theme === 'dark');
});

document.getElementById('view-controls').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-view]');
  if (!button) return;
  for (const other of event.currentTarget.querySelectorAll('button')) {
    other.classList.toggle('active', other === button);
  }
  const view = button.dataset.view;
  document.getElementById('wrap-desktop').hidden = view === 'mobile';
  document.getElementById('wrap-mobile').hidden = view === 'desktop';
});
