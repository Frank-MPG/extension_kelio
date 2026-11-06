// Pages internes Kelio (JSP dans l'iframe du portail). L'essentiel est en CSS (pages.css) ;
// ici, quelques retouches de structure qui ne sont pas possibles en CSS seul.
(() => {
  if (window.__kxPages) return;
  window.__kxPages = true;

  function tidy() {
    const html = document.documentElement;
    html.classList.add('kx-jsp');
    // Attributs de présentation hérités (bgcolor, width fixes) qui priment sur le thème
    for (const el of document.querySelectorAll('#tableContenu [bgcolor], .presenceBordered [bgcolor], dl.soldes [bgcolor]')) {
      el.dataset.kxBgcolor = el.getAttribute('bgcolor');
      el.removeAttribute('bgcolor');
    }
    // Tableau des déclarations : 1 à 2 <tr> par jour (cellules en rowspan). On marque le début de
    // chaque jour (séparateur), l'alternance (fond), le week-end (atténué) et aujourd'hui.
    const today = new Date().toLocaleDateString('fr-FR');
    for (const t of document.querySelectorAll('table.presenceBordered')) {
      let odd = true, left = 0, cls = [];
      for (const tr of t.querySelectorAll(':scope > tbody > tr')) {
        if (tr.querySelector(':scope > td.headerColonne')) continue;
        if (left <= 0) {
          odd = !odd;
          const span = Math.max(1, ...[...tr.children].map((td) => td.rowSpan || 1));
          left = span;
          const txt = tr.textContent;
          cls = [odd && 'kx-odd', /\b(Sa|Di)\b/.test([...tr.querySelectorAll('div.etatGtp')].map((d) => d.textContent.trim()).join(' ')) && 'kx-we', txt.includes(today) && 'kx-today'].filter(Boolean);
          tr.classList.add('kx-day');
        }
        tr.classList.add(...cls);
        left--;
      }
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tidy);
  else tidy();
})();
