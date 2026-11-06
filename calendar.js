// Calendrier des absences repensé (iframe /open/bwt/intranet_calendrier_absence.jsp, monde MAIN).
//
// Kelio dessine tout ce calendrier (barre d'outils, grille, légende, boîtes de dialogue) dans un seul
// <canvas>, sans aucun DOM exploitable. On intercepte donc les appels de dessin du canvas
// (fillRect / fillText / drawImage), on tient une « liste d'affichage » (un rectangle opaque efface ce
// qu'il recouvre), et on en déduit le modèle : mois affichés, jours, absences (couleur, code,
// demi-journée), télétravail, fériés, vacances scolaires, légende.
// On affiche à la place un vrai calendrier HTML (12 mois en grilles semaine), et chaque action
// (clic / double-clic sur un jour, navigation, case Télétravail, réglages) est rejouée sur le canvas,
// aux coordonnées de l'élément Kelio correspondant. Quand Kelio ouvre une boîte de dialogue (voile
// semi-transparent sur tout le canvas), on réaffiche le canvas d'origine le temps du dialogue.
(() => {
  if (window.__kxCal) return;
  window.__kxCal = true;

  const html = document.documentElement;
  const P = CanvasRenderingContext2D.prototype;
  const orig = { fillRect: P.fillRect, clearRect: P.clearRect, fillText: P.fillText, drawImage: P.drawImage, measureText: P.measureText };

  let canvas = null;
  let list = [];
  let timer = 0;

  // ---------- Capture ----------
  function mainCanvas(ctx) {
    const c = ctx.canvas;
    if (!(c instanceof HTMLCanvasElement) || !c.isConnected) return false;
    if (c === canvas) return true;
    if (!canvas || !canvas.isConnected || c.width * c.height > canvas.width * canvas.height) { canvas = c; list = []; return true; }
    return false;
  }
  function tr(ctx, x, y, w, h) {
    const m = ctx.getTransform();
    return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f, w: w * m.a, h: h * m.d };
  }
  const isOpaque = (c, a) => a >= 1 && typeof c === 'string' && (/^#[0-9a-f]{6}$/i.test(c) || /^rgb\(/i.test(c) || /^rgba\(.*,\s*1\s*\)$/i.test(c));
  const inside = (o, r) => o.x >= r.x - .5 && o.y >= r.y - .5 && o.x + o.w <= r.x + r.w + .5 && o.y + o.h <= r.y + r.h + .5;
  function erase(r) {
    if (r.w * r.h < 100) return;
    if (r.w >= canvas.width - 2 && r.h >= canvas.height - 2) { list = []; return; }
    list = list.filter((o) => !inside(o, r));
  }
  function push(o) {
    list.push(o);
    if (!timer) timer = setTimeout(parse, 30);
  }

  P.fillRect = function (x, y, w, h) {
    try {
      if (mainCanvas(this)) {
        const r = tr(this, x, y, w, h);
        if (r.w < 0) { r.x += r.w; r.w = -r.w; }
        if (r.h < 0) { r.y += r.h; r.h = -r.h; }
        const c = String(this.fillStyle).toLowerCase();
        const op = isOpaque(c, this.globalAlpha);
        if (op) erase(r);
        push({ k: 'r', ...r, c, op });
      }
    } catch {}
    return orig.fillRect.apply(this, arguments);
  };
  P.clearRect = function (x, y, w, h) {
    try { if (mainCanvas(this)) { erase(tr(this, x, y, w, h)); if (!timer) timer = setTimeout(parse, 30); } } catch {}
    return orig.clearRect.apply(this, arguments);
  };
  P.fillText = function (text, x, y) {
    try {
      if (mainCanvas(this)) {
        const p = tr(this, x, y, 0, 0);
        const w = orig.measureText.call(this, String(text)).width;
        push({ k: 't', x: p.x, y: p.y - 12, w, h: 15, base: p.y, t: String(text), c: String(this.fillStyle).toLowerCase(), f: this.font });
      }
    } catch {}
    return orig.fillText.apply(this, arguments);
  };
  P.drawImage = function (img, ...a) {
    try {
      if (mainCanvas(this)) {
        let dx, dy, dw, dh, sx = 0, sy = 0;
        if (a.length >= 8) [sx, sy, , , dx, dy, dw, dh] = a;
        else if (a.length >= 4) [dx, dy, dw, dh] = a;
        else { [dx, dy] = a; dw = img.width; dh = img.height; }
        push({ k: 'i', ...tr(this, dx, dy, dw, dh), s: `${sx},${sy}` });
      }
    } catch {}
    return orig.drawImage.apply(this, arguments);
  };

  // Chemins remplis (la sélection Kelio est une « étiquette » dessinée en chemin) : boîte englobante
  const paths = new WeakMap();
  const ext = (ctx, x, y) => {
    const m = ctx.getTransform(), X = m.a * x + m.c * y + m.e, Y = m.b * x + m.d * y + m.f;
    const b = paths.get(ctx) || { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    b.x0 = Math.min(b.x0, X); b.y0 = Math.min(b.y0, Y); b.x1 = Math.max(b.x1, X); b.y1 = Math.max(b.y1, Y);
    paths.set(ctx, b);
  };
  for (const [name, fn] of [
    ['beginPath', function () { paths.delete(this); }],
    ['moveTo', function (x, y) { ext(this, x, y); }],
    ['lineTo', function (x, y) { ext(this, x, y); }],
    ['rect', function (x, y, w, h) { ext(this, x, y); ext(this, x + w, y + h); }],
    ['fill', function () {
      const b = paths.get(this);
      if (b && isFinite(b.x0) && mainCanvas(this)) push({ k: 'r', x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0, c: String(this.fillStyle).toLowerCase(), op: false, path: true });
    }],
  ]) {
    const o = P[name];
    P[name] = function () { try { fn.apply(this, arguments); } catch {} return o.apply(this, arguments); };
  }

  // ---------- Analyse ----------
  const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const rgb = (c) => {
    let m = c.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
    if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
    m = c.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
    return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0];
  };
  const lum = (c) => { const [r, g, b] = rgb(c); return (r * .3 + g * .59 + b * .11) / 255; };
  const gray = (c) => { const [r, g, b] = rgb(c); return Math.max(r, g, b) - Math.min(r, g, b) < 24; };
  const red = (c) => { const [r, g, b] = rgb(c); return r > 180 && g < 90 && b < 90; };
  const center = (o) => ({ cx: Math.round(o.x + o.w / 2), cy: Math.round(o.y + o.h / 2) });
  const textIn = (r, ts) => ts.filter((t) => t.x >= r.x - 2 && t.x < r.x + r.w && t.base > r.y && t.base <= r.y + r.h + 2);

  let model = null;

  function parse() {
    timer = 0;
    if (!canvas) return;
    const W = canvas.width, H = canvas.height;
    const rects = list.filter((o) => o.k === 'r'), texts = list.filter((o) => o.k === 't'), imgs = list.filter((o) => o.k === 'i');
    const modal = rects.some((o) => !o.op && o.w >= W * .8 && o.h >= H * .5);

    // En-têtes de mois : rectangles ~113×20 contenant un texte clair en gras
    const heads = rects.filter((r) => r.h >= 18 && r.h <= 22 && r.w >= 80 && r.w <= 160 && !gray(r.c))
      .map((r) => ({ r, t: textIn(r, texts).find((t) => /bold/.test(t.f) && lum(t.c) > .8) }))
      .filter((x) => x.t && MONTHS.includes(x.t.t.trim().split(/\s+/)[0].toLowerCase()))
      .sort((a, b) => a.r.x - b.r.x);
    if (!heads.length) { model = { modal, ok: false }; return render(); }
    const headY = heads[0].r.y, top = headY + heads[0].r.h;

    // Barre d'outils (au-dessus des en-têtes)
    const tb = { rects: rects.filter((r) => r.y + r.h <= headY + 1), texts: texts.filter((t) => t.base <= headY), imgs: imgs.filter((i) => i.y + i.h <= headY + 1) };
    const labelRect = (re) => tb.rects.find((r) => r.h >= 16 && r.w >= 30 && textIn(r, tb.texts).some((t) => re.test(t.t.trim())));
    const mRect = labelRect(new RegExp(`^(${MONTHS.join('|')})$`, 'i'));
    const yRect = labelRect(/^\d{4}$/);
    const btn = (x) => tb.rects.find((r) => r.w >= 16 && r.w <= 24 && r.h >= 16 && Math.abs(r.x - x) <= 1.5);
    const tools = {};
    let tbYear = null, tbMonth = null;
    if (mRect) {
      tbMonth = MONTHS.indexOf(textIn(mRect, tb.texts)[0].t.trim().toLowerCase());
      const p = tb.rects.find((r) => r.w >= 16 && r.w <= 24 && Math.abs(r.x + r.w - mRect.x) <= 1.5), n = btn(mRect.x + mRect.w);
      if (p) tools.prevM = center(p);
      if (n) tools.nextM = center(n);
    }
    if (yRect) {
      tbYear = +textIn(yRect, tb.texts)[0].t.trim();
      const p = tb.rects.find((r) => r.w >= 16 && r.w <= 24 && Math.abs(r.x + r.w - yRect.x) <= 1.5), n = btn(yRect.x + yRect.w);
      if (p) tools.prevY = center(p);
      if (n) { tools.nextY = center(n); const wr = tb.rects.filter((r) => r.w >= 16 && r.w <= 24 && r.h >= 16 && r.x > n.x + n.w + 4).sort((a, b) => a.x - b.x)[0]; if (wr) tools.settings = center(wr); }
    }
    const ttLabel = tb.texts.find((t) => /télétravail/i.test(t.t));
    if (ttLabel) {
      const box = tb.imgs.filter((i) => i.x < ttLabel.x && i.x > ttLabel.x - 40).sort((a, b) => b.x - a.x)[0];
      tools.tt = { ...center(box || { x: ttLabel.x, y: ttLabel.base - 12, w: ttLabel.w, h: 14 }), label: ttLabel.t.trim(), sprite: box ? box.s : '' };
    }

    // Légende : rectangles ~50×20 sous la grille, code dedans, libellé à droite
    const days = [];
    const legendTop = Math.max(...texts.filter((t) => /^\s*\d{1,2}\s+(Lu|Ma|Me|Je|Ve|Sa|Di)\s*$/.test(t.t)).map((t) => t.base), top) + 6;
    const types = {};
    for (const r of rects) {
      if (r.y < legendTop || r.h < 16 || r.h > 24 || r.w < 30 || r.w > 70 || gray(r.c) || red(r.c)) continue;
      const code = textIn(r, texts).map((t) => t.t.trim()).filter(Boolean)[0];
      const label = texts.filter((t) => Math.abs(t.base - (r.y + 17)) <= 5 && t.x > r.x + r.w && t.x < r.x + r.w + 40).sort((a, b) => a.x - b.x)[0];
      if (code) types[r.c] = { code, label: label ? label.t.trim() : code, color: r.c };
    }

    // Grille : une colonne par mois, une ligne de 20 px par jour
    const months = heads.map((h, i) => {
      const parts = h.t.t.trim().split(/\s+/);
      const m = MONTHS.indexOf(parts[0].toLowerCase());
      return { m, y: parts[1] ? +parts[1] : null, x: h.r.x, w: h.r.w + (heads[i + 1] ? 0 : 0), days: [] };
    });
    months.forEach((mo, i) => {
      if (mo.y) return;
      if (i === 0) mo.y = tbYear || new Date().getFullYear();
      else { const p = months[i - 1]; mo.y = p.m === 11 && mo.m === 0 ? p.y + 1 : p.y; }
    });
    const colOf = (x) => months.findIndex((mo) => x >= mo.x - .5 && x < mo.x + mo.w - .5);
    const cells = new Map();
    const cellAt = (ci, row) => cells.get(ci + ':' + row);
    for (const t of texts) {
      const m = t.t.match(/^\s*(\d{1,2})\s+(Lu|Ma|Me|Je|Ve|Sa|Di)\s*$/);
      if (!m || t.base <= top) continue;
      const ci = colOf(t.x);
      if (ci < 0) continue;
      const row = Math.floor((t.base - 1 - top) / 20);
      const mo = months[ci];
      const c = { d: +m[1], x: mo.x, y: top + row * 20, w: mo.w, h: 20, holiday: red(t.c), school: false, tt: '', abs: [], repos: [] };
      cells.set(ci + ':' + row, c);
      mo.days.push(c);
    }
    for (const o of [...rects, ...imgs, ...texts]) {
      const ci = colOf(o.x);
      if (ci < 0 || o.y < top) continue;
      const row = Math.floor((o.k === 't' ? o.base - 1 - top : o.y + .5 - top) / 20);
      const c = cellAt(ci, row);
      if (!c) continue;
      const rx = o.x - c.x;
      if (o.k === 'i') { if (rx >= 12 && rx <= 26) c.tt = 'ok'; continue; }
      if (o.k === 't') continue;
      // Sélection Kelio : bandeau bleu semi-transparent sur le libellé du jour (ou chemin rempli)
      if ((o.path || !o.op) && o.h >= 14 && !gray(o.c) && lum(o.c) < .97) { c.sel = true; continue; }
      if (o.path) continue;
      if (red(o.c)) { if (o.w > 20 || o.h > 12) c.holiday = true; continue; }
      // Trait sombre de 2 px en bas de case = vacances scolaires (le trait de 1 px sous le dimanche sépare les semaines)
      if (o.h <= 3.5 && o.w >= c.w - 4 && o.y >= c.y + 16 && lum(o.c) < .45) { if (o.h >= 1.5) c.school = true; continue; }
      if (gray(o.c) || lum(o.c) > .97) continue;
      if (rx >= 14 && rx <= 42 && (o.w <= 1.5 || o.h <= 1.5)) { if (!c.tt) c.tt = 'nc'; continue; }
      if (rx >= 14 && rx <= 42 && o.w >= 16 && o.h >= 16) { c.tt = c.tt || 'ok'; continue; }
      if (o.w >= 4 && o.w <= 9 && o.h >= 4 && o.h <= 9) { c.repos.push(o.c); continue; }
      if (o.h >= 17 && o.w >= c.w * .5) { c.sel = true; continue; }
      if (o.h >= 10 && o.h <= 16 && o.w >= 12 && rx >= 40) {
        const code = (textIn(o, texts)[0] || {}).t || '';
        const full = c.w - 52;
        const half = o.w < full * .7 ? (rx + o.w / 2 < 46 + full / 2 ? 'am' : 'pm') : '';
        c.abs.push({ color: o.c, code: code.trim(), half });
      }
    }
    // Sélection Kelio en cours : rectangle plein d'une couleur absente de la légende, sans code
    for (const c of cells.values()) {
      if (c.abs.some((a) => !a.code && !types[a.color])) c.sel = true;
      c.abs = c.abs.filter((a) => a.code || types[a.color]);
    }

    model = { ok: true, modal, months, tools, types, tbYear, tbMonth };
    render();
  }

  // ---------- Rendu ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const WD = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  const I = {
    prev: '<svg viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>',
    prev2: '<svg viewBox="0 0 24 24"><path d="m12 6-6 6 6 6M18 6l-6 6 6 6"/></svg>',
    next2: '<svg viewBox="0 0 24 24"><path d="m6 6 6 6-6 6M12 6l6 6-6 6"/></svg>',
    gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    home: '<svg viewBox="0 0 24 24"><path d="M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-4.5v-5.5h-5V21H5a1 1 0 0 1-1-1z"/></svg>',
    today: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><circle cx="12" cy="15" r="1.6" fill="currentColor"/></svg>',
  };

  let root = null;
  const todayKey = (() => { const n = new Date(); return `${n.getFullYear()}-${n.getMonth()}-${n.getDate()}`; })();

  function dayTitle(date, c, types) {
    const parts = [cap(date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))];
    if (c.holiday) parts.push('Férié');
    for (const a of c.abs) parts.push(((types[a.color] || {}).label || a.code || 'Absence').toLowerCase().replace(/^./, (x) => x.toUpperCase()) + (a.half ? (a.half === 'am' ? ' (matin)' : ' (après-midi)') : ''));
    if (c.repos.length) parts.push('Absence non comptabilisée (repos ou férié)');
    if (c.tt === 'ok') parts.push('Télétravail');
    if (c.tt === 'nc') parts.push('Télétravail non comptabilisé');
    if (c.school) parts.push('Vacances scolaires (zone C)');
    return parts.join(' · ');
  }

  function monthHTML(mo, types) {
    const first = new Date(mo.y, mo.m, 1);
    const lead = (first.getDay() + 6) % 7;
    const byDay = new Map(mo.days.map((c) => [c.d, c]));
    const n = new Date(mo.y, mo.m + 1, 0).getDate();
    let cells = '';
    for (let i = 0; i < lead; i++) cells += '<span class="kxc-pad"></span>';
    for (let d = 1; d <= n; d++) {
      const c = byDay.get(d);
      const date = new Date(mo.y, mo.m, d);
      const wd = (date.getDay() + 6) % 7;
      if (!c) { cells += `<span class="kxc-day kxc-na${wd > 4 ? ' we' : ''}"><b>${d}</b></span>`; continue; }
      const cls = ['kxc-day'];
      if (wd > 4) cls.push('we');
      if (c.holiday) cls.push('hol');
      if (c.school) cls.push('school');
      if (c.sel) cls.push('sel');
      if (`${mo.y}-${mo.m}-${d}` === todayKey) cls.push('today');
      let style = '';
      const full = c.abs.find((a) => !a.half), am = c.abs.find((a) => a.half === 'am'), pm = c.abs.find((a) => a.half === 'pm');
      if (full) { cls.push('abs'); style = `--a:${full.color};--b:${full.color}`; }
      else if (am || pm) { cls.push('abs', 'half'); style = `--a:${am ? am.color : 'transparent'};--b:${pm ? pm.color : 'transparent'}`; }
      const code = c.abs.map((a) => a.code || (types[a.color] || {}).code).filter(Boolean);
      const cx = Math.round(c.x + 8), cy = Math.round(c.y + 10);
      cells += `<button type="button" class="${cls.join(' ')}" style="${style}" data-cx="${cx}" data-cy="${cy}" title="${esc(dayTitle(date, c, types))}">
        <b>${d}</b>${code.length ? ((t) => `<small${t.length > 4 ? ' class="long"' : ''}>${esc(t)}</small>`)([...new Set(code)].join('·')) : ''}
        ${c.tt ? `<i class="kxc-tt ${c.tt}">${I.home}</i>` : ''}${c.repos.length ? `<i class="kxc-rep" style="--r:${c.repos[0]}"></i>` : ''}
      </button>`;
    }
    return `<section class="kxc-month${mo.y === new Date().getFullYear() && mo.m === new Date().getMonth() ? ' now' : ''}">
      <h3>${cap(MONTHS[mo.m])} <span>${mo.y}</span></h3>
      <div class="kxc-wd">${WD.map((w, i) => `<span${i > 4 ? ' class="we"' : ''}>${w}</span>`).join('')}</div>
      <div class="kxc-grid">${cells}</div>
    </section>`;
  }

  function counts(m) {
    const out = {};
    for (const mo of m.months) for (const c of mo.days) for (const a of c.abs) {
      const k = a.color;
      out[k] = (out[k] || 0) + (a.half ? .5 : 1);
    }
    return out;
  }

  const fmtN = (n) => String(n).replace('.', ',');
  const ttKey = 'kxc-tt-on-sprite';

  function render() {
    if (!document.body) return;
    const on = html.classList.contains('kx-on') && model && model.ok;
    html.classList.toggle('kxc-on', !!on);
    html.classList.toggle('kxc-modal', !!(model && model.modal));
    try { if (window.frameElement) window.frameElement.toggleAttribute('data-kx-cal', !!on); } catch {}
    if (!on) return;
    if (!root) {
      root = document.createElement('div');
      root.id = 'kxc';
      document.body.appendChild(root);
    }
    if (!root.isConnected) document.body.appendChild(root);
    const m = model;
    const first = m.months[0], last = m.months[m.months.length - 1];
    const range = `${cap(MONTHS[first.m])} ${first.y} – ${cap(MONTHS[last.m])} ${last.y}`;
    const cnt = counts(m);
    // État de la case Télétravail : sprite mémorisé quand des jours de télétravail sont affichés
    const hasTT = m.months.some((mo) => mo.days.some((c) => c.tt));
    let ttOn = null;
    if (m.tools.tt) {
      try {
        if (hasTT && m.tools.tt.sprite) localStorage.setItem(ttKey, m.tools.tt.sprite);
        const k = localStorage.getItem(ttKey);
        ttOn = hasTT || (k ? k === m.tools.tt.sprite : null);
      } catch { ttOn = hasTT; }
    }
    const types = Object.values(m.types);
    const t = (k, label, icon, extra = '') => m.tools[k] ? `<button type="button" class="kxc-btn${extra}" data-cx="${m.tools[k].cx}" data-cy="${m.tools[k].cy}" title="${esc(label)}" aria-label="${esc(label)}">${icon}</button>` : '';
    const scroll = root.scrollTop;
    root.innerHTML = `
      <header class="kxc-bar">
        <div class="kxc-nav">
          ${t('prevY', 'Année précédente', I.prev2)}${t('prevM', 'Mois précédent', I.prev)}
          <span class="kxc-range">${esc(range)}</span>
          ${t('nextM', 'Mois suivant', I.next)}${t('nextY', 'Année suivante', I.next2)}
          ${m.tools.prevM && m.tools.nextM ? `<button type="button" class="kxc-btn kxc-txt" data-kxc="today" title="Revenir au mois en cours">${I.today}<span>Aujourd’hui</span></button>` : ''}
        </div>
        <div class="kxc-tools">
          ${m.tools.tt ? `<button type="button" class="kxc-chip${ttOn ? ' on' : ''}" aria-pressed="${!!ttOn}" data-cx="${m.tools.tt.cx}" data-cy="${m.tools.tt.cy}">${I.home}<span>${esc(m.tools.tt.label.replace(/^afficher le /i, '').replace(/^./, (x) => x.toUpperCase()))}</span></button>` : ''}
          ${t('settings', 'Réglages de l’affichage', I.gear)}
        </div>
      </header>
      <div class="kxc-legend">
        ${types.map((ty) => `<span class="kxc-lg" style="--c:${ty.color}"><i></i><b>${esc(ty.code)}</b>${esc(ty.label.toLowerCase().replace(/^./, (x) => x.toUpperCase()))}${cnt[ty.color] ? `<em>${fmtN(cnt[ty.color])} j</em>` : ''}</span>`).join('')}
        <span class="kxc-lg kxc-lg-tt"><i>${I.home}</i>Télétravail</span>
        <span class="kxc-lg kxc-lg-hol"><i></i>Férié</span>
        <span class="kxc-lg kxc-lg-school"><i></i>Vacances scolaires</span>
      </div>
      <div class="kxc-months">${m.months.map((mo) => monthHTML(mo, m.types)).join('')}</div>
      <p class="kxc-hint">Clic sur un jour pour le sélectionner, double-clic sur le dernier jour de la période pour créer une demande.</p>`;
    root.scrollTop = scroll;
  }

  // ---------- Rejeu des actions sur le canvas ----------
  function fire(type, cx, cy, e) {
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    const sx = r.width / canvas.width, sy = r.height / canvas.height;
    const o = {
      bubbles: true, cancelable: true, composed: true, view: window,
      clientX: r.left + cx * sx, clientY: r.top + cy * sy, screenX: e ? e.screenX : 0, screenY: e ? e.screenY : 0,
      button: e ? e.button : 0, buttons: e ? e.buttons : 0, detail: e ? e.detail : 1,
      shiftKey: !!(e && e.shiftKey), ctrlKey: !!(e && e.ctrlKey), metaKey: !!(e && e.metaKey), altKey: !!(e && e.altKey),
    };
    const send = (t) => {
      const ptr = t.startsWith('pointer');
      canvas.dispatchEvent(new (ptr ? PointerEvent : MouseEvent)(t, ptr ? { ...o, pointerId: 1, pointerType: 'mouse', isPrimary: true } : o));
    };
    // Kelio retient la case survolée (dernier mousemove) et s'en sert pour les clics : on « survole »
    // d'abord la bonne case.
    if (/down|click/.test(type)) { send('pointermove'); send('mousemove'); }
    send(type);
  }
  const clickAt = (p) => { for (const ty of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) fire(ty, p.cx, p.cy, null); };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  let busy = false;
  async function goToday() {
    if (busy || !model || !model.ok) return;
    busy = true;
    try {
      for (let i = 0; i < 40; i++) {
        const f = model.months[0], now = new Date();
        const delta = (f.y * 12 + f.m) - (now.getFullYear() * 12 + now.getMonth() - 1); // comme Kelio : mois précédent en premier
        if (!delta) break;
        const t = model.tools;
        const p = Math.abs(delta) >= 12 ? (delta > 0 ? t.prevY : t.nextY) : (delta > 0 ? t.prevM : t.nextM);
        if (!p) break;
        const before = JSON.stringify([f.y, f.m]);
        clickAt(p);
        for (let k = 0; k < 20 && JSON.stringify([model.months[0].y, model.months[0].m]) === before; k++) await wait(100);
      }
    } finally { busy = false; }
  }

  // Bouclier : Kelio écoute la souris au niveau du document ; tout événement réel venu de notre vue
  // est arrêté (capture sur window, posée avant les écouteurs de Kelio) puis rejoué sur le canvas.
  const SHIELD = ['pointerdown', 'pointerup', 'pointermove', 'pointerover', 'pointerout', 'mousedown', 'mouseup', 'mousemove',
    'mouseover', 'mouseout', 'click', 'dblclick', 'contextmenu', 'touchstart', 'touchmove', 'touchend', 'wheel'];
  const FWD = new Set(['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'pointermove', 'mousemove']);
  for (const type of SHIELD) {
    window.addEventListener(type, (e) => {
      if (!e.isTrusted || !root || !(e.target instanceof Node) || !root.contains(e.target)) return;
      e.stopImmediatePropagation();
      const el = e.target.closest && e.target.closest('[data-cx],[data-kxc]');
      if (!el) return;
      if (el.dataset.kxc === 'today') { if (type === 'click') goToday(); return; }
      if (!FWD.has(type)) return;
      fire(type, +el.dataset.cx, +el.dataset.cy, e);
    }, { capture: true, passive: /^(wheel|touch)/.test(type) });
  }

  // Activation / thème (html.kx-on et data-kx-theme posés par settings.js)
  new MutationObserver(() => render()).observe(html, { attributes: true, attributeFilter: ['class', 'data-kx-theme'] });
  window.__kxCalDump = (x, y, w, h) => ({ model, ops: x == null ? list.length : list.filter((o) => o.x >= x && o.x < x + w && o.y >= y && o.y < y + h) });
})();
