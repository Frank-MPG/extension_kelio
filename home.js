// Accueil Kelio repensé (cadre principal, portail.jsp).
//
// Kelio est une appli GWT : widgets positionnés en absolu, sans classes, seulement des attributs
// type="PortailVignette…". On ne touche pas à ses widgets : on les masque (visibility: hidden, ils
// restent en place et fonctionnels), on lit leurs données et on affiche par-dessus un vrai tableau
// de bord. Chaque clic est rejoué sur le widget Kelio correspondant (événements souris synthétiques),
// et un MutationObserver tient la vue à jour quand Kelio change son DOM.
(() => {
  if (window.top !== window || window.__kxHome) return;
  window.__kxHome = true;

  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const T = (t, r = document) => r.querySelector(`[type="${t}"]`);
  const TT = (t, r = document) => $$(`[type="${t}"]`, r);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const leafEls = (el) => $$('*', el).filter((e) => !e.children.length && !/^(SCRIPT|STYLE|INPUT|TEXTAREA)$/.test(e.tagName) && e.textContent.trim());
  const leaves = (el) => leafEls(el).map((e) => e.textContent.replace(/\s+/g, ' ').trim());
  const rect = (e) => e.getBoundingClientRect();
  const overlap = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const topLevel = (els, sel) => els.filter((e) => !e.parentElement.closest(sel));
  const realImg = (el) => $$('img', el).find((i) => /\S/.test(i.getAttribute('src') || '') && !/clear\.cache\.gif/.test(i.getAttribute('src')));

  // ---------- Icônes ----------
  const I = {
    chev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
    users: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3 19c.6-3.2 3-5 6-5s5.4 1.8 6 5"/><circle cx="17" cy="9" r="2.4"/><path d="M16 14.2c2.6.2 4.4 1.8 5 4.8"/></svg>',
    user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.6"/><path d="M5 20c.8-3.8 3.6-6 7-6s6.2 2.2 7 6"/></svg>',
    cal: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
    spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/></svg>',
    ext: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
    finger: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 11v5M8.5 8.5a5 5 0 0 1 8.5 3.5v2M7 12v1a9 9 0 0 0 1.5 5M12 4a8 8 0 0 1 8 8v1M4 12a8 8 0 0 1 2.3-5.6M16 17c-.3 1.3-.8 2.4-1.5 3.4M12 16c0 2-.5 3.6-1.5 5"/></svg>',
    grid: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/></svg>',
    eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/></svg>',
  };

  // Couleur stable par raccourci
  const PALETTE = ['#4f5bd5', '#0e8fb8', '#0f9488', '#c77a12', '#d63f63', '#7a4fd6', '#16946a', '#52617a'];
  const NAMED = { 'déclaration': '#0f9488', 'absence': '#c77a12', 'résultats': '#4f5bd5', 'espace rh': '#7a4fd6', 'tâches à traiter': '#d63f63', 'télétravail': '#0e8fb8', 'annuaire': '#52617a' };
  const colorOf = (t) => {
    const k = t.toLowerCase();
    if (NAMED[k]) return NAMED[k];
    let h = 0;
    for (const c of k) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return PALETTE[h % PALETTE.length];
  };

  // Icônes Kelio : images 150×150 où le pictogramme n'occupe qu'une partie. On les recadre sur la
  // zone utile (canvas, même origine) et on détecte si elles sont blanches (posées sur fond coloré)
  // ou en couleur (logos, posés sur fond blanc).
  const icons = new Map(); // src → { url, tone } | 'pending'
  function processIcon(src, done) {
    const img = new Image();
    img.onload = () => {
      let out = { url: src, tone: 'color' };
      try {
        const w = img.naturalWidth, h = img.naturalHeight;
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, w, h).data;
        let x0 = w, y0 = h, x1 = -1, y1 = -1, n = 0, lum = 0;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          if (d[i + 3] > 40) {
            if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
            n++; lum += (d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11) / 255;
          }
        }
        if (n) {
          const side = Math.max(x1 - x0, y1 - y0) + 6, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
          const o = document.createElement('canvas');
          o.width = o.height = 96;
          o.getContext('2d').drawImage(img, cx - side / 2, cy - side / 2, side, side, 0, 0, 96, 96);
          out = { url: o.toDataURL('image/png'), tone: lum / n > .86 ? 'white' : 'color' };
        }
      } catch {}
      icons.set(src, out);
      done();
    };
    img.onerror = () => { icons.set(src, { url: src, tone: 'color' }); done(); };
    img.src = src;
  }
  // Balise <img> d'icône : recadrée si déjà traitée, sinon traitée puis vue re-rendue
  function iconImg(src) {
    const c = icons.get(src);
    if (c && c !== 'pending') return `<img src="${esc(c.url)}" alt="" data-tone="${c.tone}">`;
    if (!c) { icons.set(src, 'pending'); processIcon(src, () => { lastSig = ''; schedule(); }); }
    return '<img alt="" data-tone="pending">';
  }

  // ---------- Lecture du DOM Kelio ----------
  let refs = new Map();

  function closeOf(item) {
    const r = rect(item);
    let best = null;
    for (const e of $$('*', item)) {
      const q = rect(e);
      if (q.width >= 6 && q.width <= 26 && q.height >= 6 && q.height <= 26 && q.right > r.right - 40 && q.top < r.top + 34) best = e;
    }
    return best;
  }
  const status = (t) => (/refus|annul|rejet/i.test(t) ? 'ko' : /valid|accept|approuv/i.test(t) ? 'ok' : /attente|demande|nouvel|soumis|à valider/i.test(t) ? 'wait' : '');
  const tidy = (t) => t.replace(/du (\d\d\/\d\d\/\d{4}) au \1/g, 'le $1').replace(/\s*:\s*/g, ' : ');

  function extract(root) {
    const R = new Map();
    const reg = (k, el) => (el ? (R.set(k, el), k) : '');
    const d = { user: null, presence: null, badge: null, links: [], ext: [], notifs: [], absJour: null, news: null, arrivals: null, others: [] };

    const hp = T('HeaderPhotoNomPrenomPanel');
    if (hp) {
      const im = realImg(hp);
      d.user = { name: leaves(hp)[0] || '', photo: im ? im.src : '' };
    }

    TT('PortailVignetteLienExec', root).forEach((v, i) => {
      const [title = '', sub = ''] = leaves(v);
      const im = realImg(v);
      const o = { key: reg('link:' + i, v), title, sub, icon: im ? im.src : '' };
      if (!d.presence && (/^pr[ée]sence$/i.test(title) || /badger/i.test(sub))) d.presence = o;
      else if (/lien externe/i.test(sub)) d.ext.push(o);
      else d.links.push(o);
    });

    const b = T('PortailVignetteBadgeageJourneeExec', root);
    if (b) {
      const l = leaves(b);
      d.badge = { key: reg('badge', b), title: l[0] || 'Dernières entrées / sorties', times: l.filter((x) => /^\d{1,2}[:h]\d{2}$/.test(x)) };
    }

    // Titres de colonnes (« Mon espace », « Ma gestion »…) : textes hors vignettes, au-dessus de la vignette
    const titles = leafEls(root).filter((e) => !e.closest('[type^="PortailVignette"]')).map((e) => ({ t: e.textContent.trim(), r: rect(e) }));
    const titleAbove = (v) => {
      const r = rect(v);
      let best = null;
      for (const x of titles) if (x.r.bottom <= r.top + 4 && x.r.left < r.right && x.r.right > r.left && (!best || x.r.bottom > best.r.bottom)) best = x;
      return best ? best.t : '';
    };

    TT('PortailVignetteNotificationExec', root).forEach((v, n) => {
      const colTitle = titleAbove(v);
      const head = v.firstElementChild;
      const kids = head ? [...head.children] : [];
      const bg = (e) => getComputedStyle(e).backgroundColor;
      const whites = kids.filter((c) => c.tagName === 'DIV' && c.offsetWidth > 10 && c.offsetWidth < 200 && bg(c) === 'rgb(255, 255, 255)');
      const reds = kids.filter((c) => /^rgb\(2[0-5]\d, 0, 0\)$/.test(bg(c)));
      // Bascules « moi / mon équipe » : pictos de l'en-tête, de gauche à droite ; l'active est sur fond blanc
      const modes = kids.filter((c) => c.tagName === 'IMG').sort((a, z) => rect(a).left - rect(z).left).map((im, k) => {
        const r = rect(im);
        return { key: reg(`nm:${n}:${k}`, im), on: whites.some((w) => overlap(rect(w), r)), dot: reds.some((x) => overlap(rect(x), r)) };
      });
      const cats = TT('PortailVignetteNotificationCategoryPanel', v).map((c, ci) => {
        const h = T('PortailVignetteNotificationDefaultHeader', c) || c;
        const hl = leaves(h);
        const count = hl.find((x) => /^(\d+\+?|\.\.\.|…)$/.test(x)) || '';
        const label = hl.filter((x) => x !== count).sort((a, z) => z.length - a.length)[0] || '';
        const list = T('DetailsListPanel', c);
        const els = list ? topLevel($$('[type^="NotifDetail"]', list), '[type^="NotifDetail"]') : [];
        const open = els.some((x) => x.offsetHeight > 0);
        const items = open ? els.map((x, k) => {
          const l = leaves(x);
          return { key: reg(`ni:${n}:${ci}:${k}`, x), close: reg(`nc:${n}:${ci}:${k}`, closeOf(x)), title: l[0] || '', text: tidy(l.slice(1).join(' · ')) };
        }) : [];
        return { key: reg(`nh:${n}:${ci}`, h), label, count: /^\.\.\.|…$/.test(count) ? '99+' : count, open, items };
      });
      d.notifs.push({ col: colTitle.trim(), modes, cats });
    });

    const aj = T('PortailVignetteAbsencesDuJourExec', root);
    if (aj) {
      const l = leaves(aj);
      const list = T('DetailsListPanel', aj);
      const els = list ? topLevel($$('[type]', list), '[type]') : [];
      const items = els.map((x, k) => ({ key: reg('aj:' + k, x), text: leaves(x).join(' · ') })).filter((x) => x.text);
      d.absJour = { title: l[0] || 'Absences du jour', items, empty: l.find((x) => /aucun/i.test(x)) || 'Aucune absence aujourd’hui' };
    }

    const nv = T('PortailVignetteNouveautesExec', root);
    if (nv) {
      d.news = {
        title: leaves(nv)[0] || 'Nouveautés',
        items: TT('NouveautesDetailPanel', nv).map((x, k) => {
          const l = leaves(x).filter((t) => !/cliquez pour/i.test(t));
          return { key: reg('nv:' + k, x), close: reg('nvc:' + k, closeOf(x)), title: l[0] || '', sub: l.slice(1).join(' · ') };
        }),
      };
    }

    const na = T('PortailVignetteNvxArrivantsExec', root);
    if (na) {
      d.arrivals = {
        title: leaves(na)[0] || 'Bienvenue à',
        items: TT('NouvelArrivantDetailPanel', na).map((x, k) => {
          const [name = '', role = '', date = ''] = leaves(x);
          // Photo : <img> réelle, ou sprite GWT (clear.cache.gif + background-image/position)
          let photo = null;
          const im = realImg(x);
          if (im) photo = { src: im.src };
          else {
            for (const e of $$('img', x)) {
              const cs = getComputedStyle(e);
              if (cs.backgroundImage !== 'none' && e.offsetWidth >= 24) {
                photo = { w: e.offsetWidth, h: e.offsetHeight, bg: `${cs.backgroundImage} ${cs.backgroundPosition} / ${cs.backgroundSize} ${cs.backgroundRepeat}` };
                break;
              }
            }
          }
          return { key: reg('na:' + k, x), name, role, date: date.replace(/^arrivée?\(e\)\s*/i, ''), photo };
        }),
      };
    }

    // Vignettes inconnues (autres profils Kelio) : carte générique cliquable
    const known = /^PortailVignette(Lien|BadgeageJournee|Notification|AbsencesDuJour|Nouveautes|NvxArrivants|DateOfficielle|HeureOfficielle)Exec$/;
    topLevel($$('[type^="PortailVignette"][type$="Exec"]', root), '[type^="PortailVignette"][type$="Exec"]')
      .filter((v) => !known.test(v.getAttribute('type')))
      .forEach((v, k) => {
        const l = leaves(v);
        if (l.length) d.others.push({ key: reg('ot:' + k, v), title: l[0], text: l.slice(1, 6).join(' · ') });
      });

    return { d, R };
  }

  // ---------- Rendu ----------
  const firstName = (n) => {
    const w = n.split(/\s+/).filter((x) => x && x !== x.toUpperCase());
    return w.length ? w.join(' ') : n;
  };
  const toMin = (t) => { const [h, m] = t.split(/[:h]/).map(Number); return h * 60 + m; };
  const fmtDur = (m) => `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
  const nowMin = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };

  function dayCard(d) {
    const t = d.badge ? d.badge.times : [];
    let total = 0;
    for (let i = 0; i + 1 < t.length; i += 2) total += Math.max(0, toMin(t[i + 1]) - toMin(t[i]));
    const open = t.length % 2 === 1;
    if (open) total += Math.max(0, nowMin() - toMin(t[t.length - 1]));
    const chips = t.map((x, i) => `<span class="kx-punch ${i % 2 ? 'out' : 'in'}"><i></i>${esc(x)}<small>${i % 2 ? 'sortie' : 'entrée'}</small></span>`).join('<span class="kx-punch-sep"></span>');
    return `
      <section class="kx-card kx-day">
        <div class="kx-card-h"><span class="kx-h-ic">${I.clock}</span><h2>Ma journée</h2></div>
        ${t.length ? `
          <div class="kx-punches">${chips}</div>
          <div class="kx-total"><span>${open ? 'Présent depuis ' + esc(t[t.length - 1]) : 'Temps de présence'}</span><b data-kx-total>${fmtDur(total)}</b></div>`
        : `<p class="kx-empty">${esc(d.badge ? 'Aucun badgeage aujourd’hui' : 'Badgeages indisponibles')}</p>`}
        ${d.presence ? `<button class="kx-btn kx-primary kx-wide" data-kx="${d.presence.key}">${I.finger}<span>${esc(d.presence.sub || 'Badger ma présence')}</span></button>` : ''}
      </section>`;
  }

  function avatar(p) {
    if (p.photo && p.photo.src) return `<img src="${esc(p.photo.src)}" alt="">`;
    if (p.photo && p.photo.bg) {
      const s = 40 / Math.max(p.photo.w, p.photo.h);
      return `<i class="kx-av-sp" style="width:${p.photo.w}px;height:${p.photo.h}px;transform:scale(${s});background:${esc(p.photo.bg)}"></i>`;
    }
    return esc(p.name.slice(0, 1));
  }

  const tile = (o) => `
    <button class="kx-tile" data-kx="${o.key}" style="--c:${colorOf(o.title)}" title="${esc(o.sub)}">
      <span class="kx-tile-ic">${o.icon ? iconImg(o.icon) : I.grid}</span>
      <span class="kx-tile-t">${esc(o.title)}</span>
      <span class="kx-tile-s">${esc(o.sub)}</span>
    </button>`;

  function notifCard(nt, i) {
    const modeLabels = ['Moi', 'Mon équipe'];
    const seg = nt.modes.length > 1 ? `<div class="kx-seg" role="tablist">${nt.modes.map((m, k) =>
      `<button role="tab" aria-selected="${m.on}" class="${m.on ? 'on' : ''}" data-kx="${m.key}">${k ? I.users : I.user}<span>${modeLabels[k] || 'Vue ' + (k + 1)}</span>${m.dot ? '<i class="kx-dot"></i>' : ''}</button>`).join('')}</div>` : '';
    const cats = nt.cats.map((c) => `
      <li class="kx-cat${c.open ? ' open' : ''}">
        <button class="kx-cat-h" data-kx="${c.key}" aria-expanded="${c.open}">
          <span class="kx-cat-l">${esc(c.label)}</span>
          ${c.count ? `<span class="kx-count">${esc(c.count)}</span>` : ''}
          <span class="kx-chev">${I.chev}</span>
        </button>
        ${c.open ? `<ul class="kx-items">${c.items.map((it) => `
          <li class="kx-item ${status(it.title)}">
            <span class="kx-item-dot"></span>
            <div class="kx-item-b"><b>${esc(it.title)}</b>${it.text ? `<span>${esc(it.text)}</span>` : ''}</div>
            ${it.close ? `<button class="kx-x" data-kx="${it.close}" title="Masquer cette notification" aria-label="Masquer">${I.x}</button>` : ''}
          </li>`).join('') || '<li class="kx-empty">Aucune notification</li>'}</ul>` : ''}
      </li>`).join('');
    return `
      <section class="kx-card kx-notif">
        <div class="kx-card-h"><span class="kx-h-ic">${I.bell}</span><h2>${esc(nt.col || 'Notifications')}</h2>${seg}</div>
        <ul class="kx-cats">${cats || '<li class="kx-empty">Aucune notification</li>'}</ul>
      </section>`;
  }

  function sideCards(d) {
    let h = '';
    if (d.absJour) {
      h += `<section class="kx-card">
        <div class="kx-card-h"><span class="kx-h-ic">${I.cal}</span><h2>${esc(d.absJour.title)}</h2>${d.absJour.items.length ? `<span class="kx-count">${d.absJour.items.length}</span>` : ''}</div>
        ${d.absJour.items.length ? `<ul class="kx-list">${d.absJour.items.map((x) => `<li><button data-kx="${x.key}">${esc(x.text)}</button></li>`).join('')}</ul>` : `<p class="kx-empty">${esc(d.absJour.empty)}</p>`}
      </section>`;
    }
    if (d.arrivals && d.arrivals.items.length) {
      h += `<section class="kx-card">
        <div class="kx-card-h"><span class="kx-h-ic">${I.users}</span><h2>${esc(d.arrivals.title)}</h2></div>
        <ul class="kx-people">${d.arrivals.items.map((p) => `
          <li><span class="kx-av">${avatar(p)}</span>
            <div><b>${esc(p.name)}</b><span>${esc(p.role)}</span>${p.date ? `<small>Arrivé(e) le ${esc(p.date.replace(/^le\s*/i, ''))}</small>` : ''}</div></li>`).join('')}</ul>
      </section>`;
    }
    if (d.news && d.news.items.length) {
      h += `<section class="kx-card">
        <div class="kx-card-h"><span class="kx-h-ic">${I.spark}</span><h2>${esc(d.news.title)}</h2></div>
        <ul class="kx-list">${d.news.items.map((x) => `<li class="kx-news"><button data-kx="${x.key}"><b>${esc(x.title)}</b>${x.sub ? `<span>${esc(x.sub)}</span>` : ''}</button>${x.close ? `<button class="kx-x" data-kx="${x.close}" title="Masquer" aria-label="Masquer">${I.x}</button>` : ''}</li>`).join('')}</ul>
      </section>`;
    }
    for (const o of d.others) {
      h += `<section class="kx-card kx-other"><button data-kx="${o.key}"><b>${esc(o.title)}</b><span>${esc(o.text)}</span></button></section>`;
    }
    if (d.ext.length) {
      h += `<section class="kx-card">
        <div class="kx-card-h"><span class="kx-h-ic">${I.ext}</span><h2>Liens utiles</h2></div>
        <div class="kx-ext">${d.ext.map((o) => `<button class="kx-ext-i" data-kx="${o.key}" style="--c:${colorOf(o.title)}">
          <span class="kx-ext-ic">${o.icon ? iconImg(o.icon) : I.ext}</span><span>${esc(o.title)}</span></button>`).join('')}</div>
      </section>`;
    }
    return h;
  }

  function greet() {
    const h = new Date().getHours();
    return h >= 5 && h < 18 ? 'Bonjour' : 'Bonsoir';
  }
  const dateStr = () => new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = () => new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  function render(d) {
    const name = d.user ? firstName(d.user.name) : '';
    const [n1, ...nRest] = d.notifs;
    home.innerHTML = `
      <div class="kx-wrap">
        <header class="kx-hero">
          <div>
            <p class="kx-eyebrow" data-kx-date>${esc(dateStr())}</p>
            <h1><span data-kx-greet>${greet()}</span>${name ? ' ' + esc(name) : ''}</h1>
          </div>
          <div class="kx-hero-r">
            <span class="kx-clock" data-kx-clock>${timeStr()}</span>
            <button class="kx-btn kx-ghost" data-kx="classic" title="Afficher l’accueil Kelio d’origine">${I.eye}<span>Vue Kelio</span></button>
          </div>
        </header>
        <div class="kx-cols">
          <div class="kx-col">${dayCard(d)}${n1 ? notifCard(n1, 0) : ''}</div>
          <div class="kx-col">
            ${d.links.length ? `<section class="kx-card"><div class="kx-card-h"><span class="kx-h-ic">${I.grid}</span><h2>Raccourcis</h2></div><div class="kx-tiles">${d.links.map(tile).join('')}</div></section>` : ''}
            ${nRest.map((x, i) => notifCard(x, i + 1)).join('')}
          </div>
          <div class="kx-col">${sideCards(d)}</div>
        </div>
      </div>`;
  }

  // ---------- Rejouer un clic sur le widget Kelio ----------
  function fire(el) {
    const s = gwt;
    s && s.removeAttribute('data-kx-hidden');
    home.style.visibility = 'hidden';
    let t = el, x = 0, y = 0;
    try {
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const r = rect(el);
      x = r.left + r.width / 2;
      y = r.top + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      const box = el.closest('[type^="PortailVignette"]') || el;
      if (hit && (el.contains(hit) || (box.contains(hit) && hit.contains(el) === false && overlap(rect(hit), r)))) t = hit;
    } finally {
      s && s.setAttribute('data-kx-hidden', '');
      home.style.visibility = '';
    }
    const o = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0, buttons: 1, view: window };
    t.dispatchEvent(new PointerEvent('pointerdown', o));
    t.dispatchEvent(new MouseEvent('mousedown', o));
    o.buttons = 0;
    t.dispatchEvent(new PointerEvent('pointerup', o));
    t.dispatchEvent(new MouseEvent('mouseup', o));
    t.dispatchEvent(new MouseEvent('click', o));
  }

  function onClick(e) {
    const b = e.target.closest('[data-kx]');
    if (!b || !home.contains(b)) return;
    e.preventDefault();
    const k = b.dataset.kx;
    if (k === 'classic') { setClassic(true); return; }
    const el = refs.get(k);
    if (el && el.isConnected) {
      fire(el);
      setTimeout(ensure, 60);
      setTimeout(ensure, 500);
    } else ensure();
  }

  // Vue Kelio d'origine (temporaire, avec un bouton flottant pour revenir)
  let back;
  function setClassic(on) {
    document.documentElement.classList.toggle('kx-classic', on);
    if (on && !back) {
      back = document.createElement('button');
      back.id = 'kx-back';
      back.innerHTML = `${I.grid}<span>Accueil repensé</span>`;
      document.body.appendChild(back);
    }
  }

  // ---------- Montage / mise à jour ----------
  let home = null, gwt = null, lastSig = '', pending = 0;

  function unmount() {
    if (home) home.remove();
    if (gwt) gwt.removeAttribute('data-kx-hidden');
    home = null; gwt = null; lastSig = '';
  }

  function ensure() {
    pending = 0;
    if (!document.documentElement.classList.contains('kx-on')) return unmount();
    const root = T('VignettesPanelExec');
    if (!root) return;
    const scroll = root.closest('[type="BNativeScrollPanel"]') || root.parentElement;
    const host = scroll.parentElement;
    if (!home) {
      home = document.createElement('div');
      home.id = 'kx-home';
    }
    if (home.parentElement !== host) { host.setAttribute('data-kx-host', ''); host.appendChild(home); lastSig = ''; }
    if (gwt !== scroll) { gwt && gwt.removeAttribute('data-kx-hidden'); gwt = scroll; }
    scroll.setAttribute('data-kx-hidden', '');
    const { d, R } = extract(root);
    refs = R;
    // On n'attend pas que toutes les vignettes soient chargées pour afficher, mais on évite un écran vide
    if (!d.links.length && !d.notifs.length && !d.badge) return;
    const sig = JSON.stringify(d);
    if (sig !== lastSig) {
      const top = home.scrollTop;
      const inner = [...home.querySelectorAll('.kx-items')].map((u) => u.scrollTop);
      lastSig = sig;
      render(d);
      home.scrollTop = top;
      home.querySelectorAll('.kx-items').forEach((u, i) => { if (inner[i]) u.scrollTop = inner[i]; });
    }
  }
  const schedule = () => { if (!pending) pending = setTimeout(ensure, 120); };

  function tick() {
    if (!home) return;
    const c = home.querySelector('[data-kx-clock]');
    if (c) c.textContent = timeStr();
    const g = home.querySelector('[data-kx-greet]');
    if (g) g.textContent = greet();
    const dt = home.querySelector('[data-kx-date]');
    if (dt) dt.textContent = dateStr();
    lastSig = lastSig && lastSig + ' '; // recalcul du temps de présence en cours
    ensure();
  }

  // Bouclier : le framework Kelio (BWT) écoute la souris au niveau du document et retrouve le widget
  // visé par ses coordonnées, même masqué sous #kx-home. On intercepte donc, en capture sur window
  // (écouteur posé à document_start, avant ceux de Kelio), tout événement réel venu de notre vue, et on
  // le traite nous-mêmes. Les clics rejoués par fire() sont synthétiques (isTrusted = false) et passent.
  const SHIELD = ['pointerdown', 'pointerup', 'pointermove', 'pointerover', 'pointerout', 'pointercancel',
    'mousedown', 'mouseup', 'mousemove', 'mouseover', 'mouseout', 'click', 'dblclick', 'auxclick', 'contextmenu',
    'touchstart', 'touchmove', 'touchend', 'touchcancel', 'wheel'];
  const ours = (t) => t instanceof Node && [home, back, themeBtn].some((x) => x && x.contains(t));
  for (const type of SHIELD) {
    window.addEventListener(type, (e) => {
      if (!e.isTrusted || !ours(e.target)) return;
      e.stopImmediatePropagation();
      if (type !== 'click') return;
      if (home && home.contains(e.target)) onClick(e);
      else if (themeBtn && themeBtn.contains(e.target)) toggleTheme();
      else setClassic(false);
    }, { capture: true, passive: /^(wheel|touch|pointermove)/.test(type) });
  }

  // Bouton clair / sombre dans l'en-tête Kelio (visible sur toutes les pages). Le choix est enregistré
  // comme dans la popup (chrome.storage.sync) : tous les cadres et onglets Kelio suivent.
  let themeBtn = null;
  const SUN = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/></svg>';
  const MOON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
  const isDark = () => document.documentElement.dataset.kxTheme === 'dark';
  function paintTheme() {
    if (!themeBtn) return;
    const dark = isDark();
    themeBtn.innerHTML = dark ? SUN : MOON;
    themeBtn.title = dark ? 'Passer au thème clair' : 'Passer au thème sombre';
    themeBtn.setAttribute('aria-label', themeBtn.title);
  }
  function toggleTheme() {
    const theme = isDark() ? 'light' : 'dark';
    // Effet immédiat dans ce cadre ; settings.js propage ensuite à tous les cadres via storage.onChanged
    document.documentElement.dataset.kxTheme = theme;
    paintTheme();
    try { chrome.storage.sync.set({ theme }); } catch {}
  }
  function mountTheme() {
    if (!themeBtn) {
      themeBtn = document.createElement('button');
      themeBtn.id = 'kx-theme';
      themeBtn.type = 'button';
    }
    if (!themeBtn.isConnected) document.body.appendChild(themeBtn);
    paintTheme();
  }

  function start() {
    const box = document.getElementById('bwtcontainer') || document.body;
    new MutationObserver((muts) => {
      for (const m of muts) if (!home || !home.contains(m.target)) return schedule();
    }).observe(box, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['style'] });
    window.addEventListener('kx-settings', () => { paintTheme(); ensure(); });
    setInterval(tick, 30000);
    mountTheme();
    ensure();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
