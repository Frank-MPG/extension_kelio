// Réglages de la popup → chrome.storage.sync (lus par settings.js dans les onglets Kelio, sans rechargement).
const DEF = { enabled: true, theme: 'auto' };
const enabled = document.getElementById('enabled');
const theme = document.getElementById('theme');

function show(s) {
  enabled.checked = !!s.enabled;
  for (const b of theme.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === s.theme));
}

chrome.storage.sync.get(DEF, show);
enabled.addEventListener('change', () => chrome.storage.sync.set({ enabled: enabled.checked }));
theme.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  chrome.storage.sync.set({ theme: b.dataset.v });
  chrome.storage.sync.get(DEF, show);
});
