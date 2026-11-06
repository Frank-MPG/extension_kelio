// Réglages communs (tous les cadres) : active la refonte (html.kx-on) et le thème (html[data-kx-theme]).
// Réglages : chrome.storage.sync { enabled, theme: 'auto' | 'light' | 'dark' }, modifiés depuis la popup.
// Copie en localStorage du site pour appliquer le bon thème dès document_start (pas de flash).
(() => {
  if (window.__kxSettings) return;
  window.__kxSettings = true;
  const DEF = { enabled: true, theme: 'auto' };
  const KEY = 'kx-settings';
  const html = document.documentElement;
  const mq = matchMedia('(prefers-color-scheme: dark)');
  let s = { ...DEF };
  try { Object.assign(s, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch {}

  function apply() {
    const dark = s.theme === 'dark' || (s.theme !== 'light' && mq.matches);
    html.classList.toggle('kx-on', !!s.enabled);
    html.dataset.kxTheme = dark ? 'dark' : 'light';
    window.dispatchEvent(new CustomEvent('kx-settings'));
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} }

  apply();
  try {
    chrome.storage.sync.get(DEF, (v) => { s = { ...DEF, ...v }; save(); apply(); });
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area !== 'sync') return;
      for (const k of Object.keys(ch)) if (k in DEF) s[k] = ch[k].newValue ?? DEF[k];
      save();
      apply();
    });
  } catch {}
  mq.addEventListener('change', apply);
})();
