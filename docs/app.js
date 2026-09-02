// SITREP briefing site — data, routing, home + reader views.
(() => {
  const OWNER = 'jordanbeck8', REPO = 'security-updates', DIR = 'briefings';
  const API = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${DIR}`;
  const RAW = `https://raw.githubusercontent.com/${OWNER}/${REPO}/main/${DIR}/`;
  const LS = 'dsb-read-v1';
  const $ = id => document.getElementById(id);
  const THEATERS = [
    { key: 'Domestic US', code: 'US', title: 'Domestic US', num: '01', coord: [-98, 39] },
    { key: 'China', code: 'CN/TW', title: 'China · Taiwan', num: '02', coord: [120.5, 24] },
    { key: 'Russia', code: 'RU/UA', title: 'Russia · Ukraine', num: '03', coord: [34, 49] },
    { key: 'Iran', code: 'US/IR', title: 'US · Iran', num: '04', coord: [55, 26.5] }
  ];
  let dates = [], cur = -1, live = false, globe = null, expanded = false;
  const cache = {};
  const readSet = () => new Set(JSON.parse(localStorage.getItem(LS) || '[]'));
  const saveRead = s => localStorage.setItem(LS, JSON.stringify([...s]));
  const fmt = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' });
  const monthOf = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const pad = (n, w) => String(n).padStart(w, '0');

  // — markdown → html (the briefing dialect: h1-h3, bullets, hr, bold, bare urls)
  function inline(s) {
    s = esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(https?:\/\/[^\s<)]+)/g, (m) => `<a href="${m}" target="_blank" rel="noopener noreferrer">${m.replace(/^https?:\/\//, '')}</a>`);
    return s.replace(/^_(.+)_$/, '<em class="gen">$1</em>');
  }
  function render(md) {
    const out = []; let ul = false, src = null;
    const closeUl = () => { if (ul) { (src ? src.html : out).push('</ul>'); ul = false; } };
    const flushSrc = () => { if (!src) return; closeUl(); const n = src.html.filter(x => x.startsWith('<li')).length; out.push(`<details class="sources"><summary>Sources · ${n}</summary>${src.html.join('\n')}</details>`); src = null; };
    for (const raw of md.split('\n')) {
      const line = raw.trimEnd(); if (!line.trim()) { closeUl(); continue; }
      if (/^---+$/.test(line.trim())) { flushSrc(); out.push('<hr>'); continue; }
      let h;
      if (h = line.match(/^(#{1,3})\s+(.*)/)) { flushSrc(); const lv = h[1].length; out.push(`<h${lv}${lv === 2 ? ` id="${slug(h[2])}"` : ''}>${inline(h[2])}</h${lv}>`); continue; }
      if (/^\*\*Sources:?\*\*/.test(line)) { flushSrc(); src = { html: [] }; continue; }
      if (h = line.match(/^_.+_$/)) { flushSrc(); }
      const tgt = src ? src.html : out;
      if (h = line.match(/^[-*]\s+(.*)/)) { if (!ul) { tgt.push('<ul>'); ul = true; } tgt.push(`<li>${inline(h[1])}</li>`); continue; }
      closeUl(); tgt.push(`<p>${inline(line)}</p>`);
    }
    flushSrc(); closeUl(); return out.join('\n');
  }
  function parseSections(md) {
    const parts = md.split(/^## /m).slice(1);
    return THEATERS.map((t, i) => {
      const raw = parts.find(p => p.startsWith(t.key)) || parts[i] || '';
      const heading = raw.split('\n')[0] || t.title, body = raw.split('\n').slice(1).join('\n');
      const prose = (body.split(/\*\*Sources/)[0] || '').trim().replace(/\n+/g, ' ');
      const sent = prose.match(/[^.!?]+[.!?]+(\s|$)/g) || [prose];
      const cut = (s, n) => s.length > n ? s.slice(0, n - 3).replace(/\s\S*$/, '') + '…' : s;
      return { ...t, id: slug(heading), lead: cut((sent[0] || '').trim(), 150), excerpt: cut(sent.slice(1, 3).join(' ').trim(), 210), srcCount: (body.match(/^- .*https?:\/\//gm) || []).length };
    });
  }

  // — data
  async function getMd(d) {
    if (cache[d]) return cache[d];
    if (!live) return cache[d] = window.SAMPLE_MD.replace(/\d{4}-\d{2}-\d{2}/, d);
    const r = await fetch(RAW + d + '.md'); if (!r.ok) throw new Error('HTTP ' + r.status);
    return cache[d] = await r.text();
  }
  const prefetch = i => { if (i >= 0 && i < dates.length) getMd(dates[i]).catch(() => {}); };

  // — views
  function show(view) {
    for (const v of ['home', 'reader']) { const el = $(v); const on = v === view; if (on && el.hidden) { el.hidden = false; el.classList.remove('view-enter'); void el.offsetWidth; el.classList.add('view-enter'); } else if (!on) el.hidden = true; }
    document.querySelectorAll('.nav a[data-view]').forEach(a => a.toggleAttribute('aria-current', a.dataset.view === view));
    window.scrollTo({ top: 0 });
  }

  async function buildHome() {
    const latest = dates[dates.length - 1];
    const md = await getMd(latest);
    const secs = parseSections(md);
    const gen = (md.match(/_Generated: ([^|]+)/) || [])[1];
    $('statusTag').lastChild.textContent = live ? 'Live feed' : 'Sample edition';
    $('editionLine').textContent = `Edition № ${pad(dates.length, 3)} — ${latest}`;
    $('statEditions').textContent = pad(dates.length, 3);
    $('statSources').textContent = pad(secs.reduce((n, s) => n + s.srcCount, 0), 2);
    $('genLine').textContent = gen ? 'Generated ' + gen.trim() : 'Generated daily';
    $('todayLabel').textContent = `Today — ${fmt(latest)}`;
    const items = secs.map(s => `<span class="ticker-item"><b>${s.code}</b>${esc(s.lead)}</span>`).join('');
    $('tickerTrack').innerHTML = items + items;
    $('cards').innerHTML = secs.map(s => `<article class="card theater-card" data-code="${s.code}" data-id="${s.id}" tabindex="0" role="link"><div class="card-head"><span class="card-kicker">${s.num} / ${s.title}</span><span class="mono text-muted">${s.srcCount} src</span></div><h3 class="card-title">${esc(s.lead)}</h3><p class="card-body">${esc(s.excerpt)}</p><div class="card-meta"><span class="read-link">Read section →</span></div></article>`).join('');
    $('cards').querySelectorAll('.theater-card').forEach(c => {
      const open = () => openBriefing(dates.length - 1, c.dataset.id);
      c.onclick = open; c.onkeydown = e => { if (e.key === 'Enter') open(); };
      c.onmouseenter = () => globe && globe.setActive(THEATERS.find(t => t.code === c.dataset.code));
      c.onmouseleave = () => globe && globe.setActive(null);
    });
    $('dataNote').textContent = live ? `Live from github.com/${OWNER}/${REPO} · summaries are machine-generated; verify against the cited sources.` : 'Showing a sample edition — the live register loads from the repository when reachable.';
    buildRegister();
  }

  function buildRegister() {
    const r = readSet(); const rev = [...dates].reverse();
    const n = rev.filter(d => r.has(d)).length;
    $('regLabel').textContent = `Briefing register — ${dates.length} editions`;
    $('progLabel').textContent = `${n} of ${dates.length} reviewed`;
    $('progFill').style.width = dates.length ? (100 * n / dates.length) + '%' : '0';
    const months = []; for (const d of rev) { const m = monthOf(d); if (!months.length || months[months.length - 1].m !== m) months.push({ m, days: [] }); months[months.length - 1].days.push(d); }
    const shown = expanded ? months : months.slice(0, 2);
    $('register').innerHTML = `<table class="table"><colgroup><col style="width:64px"><col><col><col style="width:120px"></colgroup><tbody>` + shown.map(g => `<tr class="month-row"><td colspan="4"><span class="month" style="margin:0">${g.m}</span></td></tr>${g.days.map(d => {
      const i = dates.indexOf(d), isRead = r.has(d), isNew = i === dates.length - 1 && !isRead;
      return `<tr class="is-link${isRead ? ' is-read' : ''}" data-i="${i}" tabindex="0"><td class="num">${pad(i + 1, 3)}</td><td>${fmt(d)}</td><td class="mono text-muted hide-sm">US · CN/TW · RU/UA · US/IR</td><td style="text-align:right"><span class="${isNew ? 'tag tag-live' : isRead ? 'tag tag-solid' : 'tag'}">${isNew ? '<i class="dot"></i>New' : isRead ? 'Reviewed' : 'Unread'}</span></td></tr>`;
    }).join('')}`).join('') + '</tbody></table>';
    $('register').querySelectorAll('tr.is-link').forEach(tr => { const go = () => openBriefing(+tr.dataset.i); tr.onclick = go; tr.onkeydown = e => { if (e.key === 'Enter') go(); }; });
    $('regMore').textContent = expanded ? 'Show recent only' : `Show all ${months.length} months`;
    $('regMore').hidden = months.length <= 2;
  }

  async function openBriefing(i, sectionId) {
    if (i < 0 || i >= dates.length) return;
    cur = i; const d = dates[i];
    history.replaceState(null, '', '#' + d + (sectionId ? '/' + sectionId : ''));
    $('posLabel').textContent = `Edition ${pad(i + 1, 3)} of ${pad(dates.length, 3)}`;
    $('dateLabel').textContent = fmt(d);
    $('prevBtn').disabled = i === 0; $('nextBtn').disabled = i === dates.length - 1;
    $('prevBtnB').disabled = i === 0; $('nextBtnB').disabled = i === dates.length - 1;
    $('prevBtnB').querySelector('span').textContent = i > 0 ? fmt(dates[i - 1]) : '—';
    $('nextBtnB').querySelector('span').textContent = i < dates.length - 1 ? fmt(dates[i + 1]) : '—';
    show('reader');
    const el = $('content');
    el.classList.remove('view-enter'); el.innerHTML = '<p class="mono text-muted">Retrieving ' + d + '…</p>';
    try { el.innerHTML = render(await getMd(d)); } catch (e) { el.innerHTML = `<p class="mono" style="color:var(--color-accent)">Could not retrieve briefing ${d} (${esc(String(e.message || e))}).</p>`; return; }
    void el.offsetWidth; el.classList.add('view-enter');
    const h2s = [...el.querySelectorAll('h2')];
    $('rail').innerHTML = h2s.map((h, k) => `<a href="#${d}/${h.id}" data-id="${h.id}"><span class="num">${pad(k + 1, 2)}</span>${esc(h.textContent)}</a>`).join('');
    $('rail').querySelectorAll('a').forEach(a => a.onclick = e => { e.preventDefault(); jump(a.dataset.id); });
    watchRail(h2s);
    if (sectionId) requestAnimationFrame(() => jump(sectionId));
    const r = readSet(); if (!r.has(d)) { r.add(d); saveRead(r); }
    prefetch(i - 1); prefetch(i + 1);
  }
  function jump(id) { const h = document.getElementById(id); if (!h) return; const top = h.getBoundingClientRect().top + window.scrollY - 96; window.scrollTo({ top, behavior: 'smooth' }); history.replaceState(null, '', '#' + dates[cur] + '/' + id); }
  let railObs = null;
  function watchRail(h2s) {
    if (railObs) railObs.disconnect();
    railObs = new IntersectionObserver(es => { es.forEach(e => { if (e.isIntersecting) $('rail').querySelectorAll('a').forEach(a => a.classList.toggle('is-on', a.dataset.id === e.target.id)); }); }, { rootMargin: '-90px 0px -70% 0px' });
    h2s.forEach(h => railObs.observe(h));
  }
  function goHome(anchor) {
    history.replaceState(null, '', anchor ? '#' + anchor : '#');
    buildRegister(); show('home');
    if (anchor) requestAnimationFrame(() => { const t = $(anchor); if (t) window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY - 80, behavior: 'smooth' }); });
  }
  function route() {
    const h = location.hash.replace('#', '');
    const m = h.match(/^(\d{4}-\d{2}-\d{2})(?:\/(.+))?$/);
    if (m && dates.includes(m[1])) openBriefing(dates.indexOf(m[1]), m[2]); else goHome(h && $(h) ? h : '');
  }

  // — theme (dark by default; persisted)
  const THEME = 'dsb-theme';
  function applyTheme(t) { document.body.classList.toggle('dark', t === 'dark'); document.querySelectorAll('.theme-btn').forEach(b => { b.textContent = t === 'dark' ? 'Light' : 'Dark'; b.setAttribute('aria-pressed', t === 'dark'); }); }
  applyTheme(localStorage.getItem(THEME) || 'dark');
  document.querySelectorAll('.theme-btn').forEach(b => b.onclick = () => { const t = document.body.classList.contains('dark') ? 'light' : 'dark'; localStorage.setItem(THEME, t); applyTheme(t); });

  // — wiring
  document.querySelectorAll('[data-go]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); goHome(a.dataset.go); }));
  $('readToday').onclick = e => { e.preventDefault(); openBriefing(dates.length - 1); };
  $('resumeBtn').onclick = e => { e.preventDefault(); const r = readSet(); const first = dates.findIndex(d => !r.has(d)); openBriefing(first === -1 ? dates.length - 1 : first); };
  $('prevBtn').onclick = $('prevBtnB').onclick = () => openBriefing(cur - 1);
  $('nextBtn').onclick = $('nextBtnB').onclick = () => openBriefing(cur + 1);
  $('regMore').onclick = () => { expanded = !expanded; buildRegister(); };
  $('resetBtn').onclick = () => { if (confirm('Clear the review log?')) { localStorage.removeItem(LS); buildRegister(); } };
  document.addEventListener('keydown', e => {
    if ($('reader').hidden || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowRight') openBriefing(cur + 1); else if (e.key === 'ArrowLeft') openBriefing(cur - 1); else if (e.key === 'Escape') goHome('register');
  });
  window.addEventListener('hashchange', route);
  document.querySelectorAll('[data-focus]').forEach(b => b.onclick = () => { const t = THEATERS.find(x => x.code === b.dataset.focus); globe && globe.focus(t); document.querySelectorAll('[data-focus]').forEach(x => x.classList.toggle('is-on', x === b)); });

  globe = window.SitrepGlobe($('globe'), { theaters: THEATERS, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, onSelect: t => { document.querySelectorAll('[data-focus]').forEach(x => x.classList.toggle('is-on', x.dataset.focus === t.code)); } });

  (async function init() {
    try {
      const res = await fetch(API); if (!res.ok) throw new Error('HTTP ' + res.status);
      const files = await res.json();
      dates = files.map(f => f.name).filter(n => /^\d{4}-\d{2}-\d{2}\.md$/.test(n)).map(n => n.slice(0, -3)).sort();
      if (!dates.length) throw new Error('empty'); live = true;
    } catch (e) { dates = window.SAMPLE_DATES; live = false; }
    await buildHome(); route();
    document.body.classList.add('is-ready');
  })();
})();
