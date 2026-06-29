/* ============================================================
   bracket.js — state, rendering, interaction, persistence,
                share-link, PNG export
   ============================================================ */

/* ---------------- state ---------------- */
const state = {};
MATCHES.forEach(m => { state[m.id] = m.round === 0 ? [m.slots[0], m.slots[1]] : [null, null]; });
let champion = null;
let bronze = null;
let dragTeam = null;
let prevChampion = null;
let playerName = '';      // who made this prediction (shown when viewing a shared link)
let viewingShared = false;// true when the page was opened from a shared #p= link

const resolved = (m, i) => m.round === 0 ? m.slots[i] : (state[m.id][i] || null);
const winnerOf = id => { const d = downstream[id]; return d ? (state[d.mid][d.sidx] || null) : null; };

function validFor(m, i) {
  const ph = m.slots[i];
  if (/^RU\d+$/.test(ph)) {
    const src = byId['M' + ph.slice(2)];
    return [resolved(src, 0), resolved(src, 1)].filter(Boolean);
  }
  const src = byId['M' + ph.replace(/\D/g, '')];
  return [resolved(src, 0), resolved(src, 1)].filter(Boolean);
}

/* auto-populate the third-place play-off from the two semi LOSERS */
function syncThirdPlace() {
  ['M101', 'M102'].forEach(sf => {
    const ls = loserstream[sf]; if (!ls) return;
    const finalists = [resolved(byId[sf], 0), resolved(byId[sf], 1)].filter(Boolean);
    const w = winnerOf(sf);
    if (finalists.length === 2 && w) {
      const loser = finalists.find(t => t !== w);
      state[ls.mid][ls.sidx] = loser || null;
    } else {
      state[ls.mid][ls.sidx] = null;
    }
  });
}

function revalidate() {
  let changed = true;
  while (changed) {
    changed = false;
    MATCHES.forEach(m => {
      if (m.round === 0 || m.round === 5) return;
      [0, 1].forEach(i => {
        const v = state[m.id][i];
        if (v != null && !validFor(m, i).includes(v)) { state[m.id][i] = null; changed = true; }
      });
    });
    if (champion) {
      const fin = byId['M104'];
      const fs = [resolved(fin, 0), resolved(fin, 1)].filter(Boolean);
      if (!fs.includes(champion)) { champion = null; changed = true; }
    }
  }
  syncThirdPlace();
  if (bronze) {
    const third = byId['M103'];
    const ps = [resolved(third, 0), resolved(third, 1)].filter(Boolean);
    if (!ps.includes(bronze)) bronze = null;
  }
}

/* ---------------- persistence ---------------- */
const KEY = 'wc2026_bracket_v2';
function snapshot() {
  const picks = {};
  MATCHES.forEach(m => { if (m.round > 0 && m.round !== 5) picks[m.id] = state[m.id].slice(); });
  return { v: 2, picks, champion, bronze };
}
let savedTimer = null;
function markSaved(txt) {
  const n = document.getElementById('savedNote'); if (!n) return;
  n.textContent = txt || 'সংরক্ষিত ✓';
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => { if (n) n.textContent = ''; }, 1700);
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(snapshot())); markSaved(); }
  catch (e) { /* storage unavailable */ }
}
function applySnapshot(d) {
  if (!d || !d.picks) return;
  MATCHES.forEach(m => {
    if (m.round > 0 && m.round !== 5) state[m.id] = d.picks[m.id] ? d.picks[m.id].slice() : [null, null];
  });
  champion = d.champion || null;
  bronze = d.bronze || null;
  revalidate();
}
function loadStored() {
  try {
    const raw = localStorage.getItem(KEY); if (!raw) return false;
    applySnapshot(JSON.parse(raw)); return true;
  } catch (e) { return false; }
}

/* ============================================================
   SHARE LINK  — encode the whole prediction into the URL.
   No backend needed: the bracket travels inside the link.
   ============================================================ */

/* Order of the 15 advancing picks we need to capture.
   Everything else (R16..Final slots, 3rd-place) is derived. */
const PICK_ORDER = [
  // R32 winners -> fill R16 (8 left + 8 right) handled via downstream of round-0 matches
  'M74', 'M77', 'M73', 'M75', 'M83', 'M84', 'M81', 'M82',
  'M76', 'M78', 'M79', 'M80', 'M86', 'M88', 'M85', 'M87',
  // R16 winners -> QF
  'M89', 'M90', 'M93', 'M94', 'M91', 'M92', 'M95', 'M96',
  // QF winners -> SF
  'M97', 'M98', 'M99', 'M100',
  // SF winners -> Final
  'M101', 'M102'
];
const TEAM_CODES = Object.keys(TEAMS);

/* Build a compact, URL-safe payload string.
   For each source match in PICK_ORDER store the winner's index in TEAM_CODES
   (or 63 for "no pick"), packed two-chars-per-byte into base64url. */
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
function encodeShare() {
  const vals = PICK_ORDER.map(src => {
    const w = winnerOf(src);
    return w == null ? 63 : TEAM_CODES.indexOf(w);
  });
  const champIdx = champion == null ? 63 : TEAM_CODES.indexOf(champion);
  const bronzeIdx = bronze == null ? 63 : TEAM_CODES.indexOf(bronze);
  vals.push(champIdx, bronzeIdx);
  // each value 0..63 -> one base64url char
  let s = "1"; // version marker
  vals.forEach(v => { s += B64[v & 63]; });
  return s;
}
function decodeShare(str) {
  if (!str || str[0] !== '1') return false;
  const body = str.slice(1);
  const expected = PICK_ORDER.length + 2;
  if (body.length < expected) return false;
  const vals = [];
  for (let i = 0; i < body.length; i++) {
    const idx = B64.indexOf(body[i]);
    if (idx < 0) return false;
    vals.push(idx);
  }
  // reset to empty before applying
  MATCHES.forEach(m => { if (m.round > 0 && m.round !== 5) state[m.id] = [null, null]; });
  champion = null; bronze = null;

  // apply winners level by level so downstream targets exist
  PICK_ORDER.forEach((src, k) => {
    const v = vals[k];
    if (v === 63) return;
    const team = TEAM_CODES[v];
    if (!team) return;
    const d = downstream[src];
    if (d) state[d.mid][d.sidx] = team;
  });
  const champV = vals[PICK_ORDER.length];
  const bronzeV = vals[PICK_ORDER.length + 1];
  champion = champV === 63 ? null : (TEAM_CODES[champV] || null);
  bronze = bronzeV === 63 ? null : (TEAM_CODES[bronzeV] || null);
  revalidate();
  return true;
}

function buildShareURL() {
  const base = location.origin + location.pathname;
  let url = base + '#p=' + encodeShare();
  if (playerName) url += '&n=' + encodeURIComponent(playerName);
  return url;
}

/* read a shared prediction out of the URL on load */
function loadFromURL() {
  const h = location.hash || '';
  const m = h.match(/[#&]p=([^&]+)/);
  if (!m) return false;
  // pull an optional name param
  const nm = h.match(/[#&]n=([^&]+)/);
  if (nm) { try { playerName = decodeURIComponent(nm[1]).slice(0, 40); } catch (e) { playerName = ''; } }
  try { return decodeShare(decodeURIComponent(m[1])); }
  catch (e) { return false; }
}

/* ---------------- build DOM ---------------- */
const bracket = document.getElementById('bracket');
const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };

function makeSlot(m, i) {
  const s = el('div', 'slot');
  s.id = `slot-${m.id}-${i}`;
  s.addEventListener('dragstart', onDragStart);
  s.addEventListener('dragend', onDragEnd);
  s.addEventListener('dragover', onDragOver);
  s.addEventListener('dragleave', onDragLeave);
  s.addEventListener('drop', onDrop);
  return s;
}

let svgEl;
function buildConnectors() {
  const seg = [];
  const line = (x1, y1, x2, y2, key) => { seg.push({ x1, y1, x2, y2, key }); };
  MATCHES.forEach(m => {
    if (m.round >= 1 && m.round <= 3) {
      const a = matchAt(m.side, m.round - 1, m.idx * 2), b = matchAt(m.side, m.round - 1, m.idx * 2 + 1);
      const aY = cardY(a), bY = cardY(b), tY = cardY(m);
      if (m.side === 'L') {
        const fR = cardX(a) + CARD_W, tL = cardX(m), midX = (fR + tL) / 2;
        line(fR, aY, midX, aY, a.id); line(fR, bY, midX, bY, b.id);
        line(midX, aY, midX, bY, m.id + '_v'); line(midX, tY, tL, tY, m.id + '_in');
      } else {
        const fL = cardX(a), tR = cardX(m) + CARD_W, midX = (fL + tR) / 2;
        line(fL, aY, midX, aY, a.id); line(fL, bY, midX, bY, b.id);
        line(midX, aY, midX, bY, m.id + '_v'); line(midX, tY, tR, tY, m.id + '_in');
      }
    }
  });
  const fin = byId['M104'], finY = cardY(fin), finBottom = finY + 54, finCx = cardX(fin) + CARD_W / 2;
  const sfL = byId['M101'], sfR = byId['M102'];
  const sfTop = cardY(sfL) - 28, sfLcx = cardX(sfL) + CARD_W / 2, sfRcx = cardX(sfR) + CARD_W / 2;
  const midY = (finBottom + sfTop) / 2;
  line(finCx, finBottom, finCx, midY, 'M101');
  line(sfLcx, midY, finCx, midY, 'M101');
  line(sfRcx, midY, finCx, midY, 'M102');
  line(sfLcx, midY, sfLcx, sfTop, 'M101');
  line(sfRcx, midY, sfRcx, sfTop, 'M102');

  const SVGNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('class', 'connectors');
  svg.setAttribute('width', '1130'); svg.setAttribute('height', '800');
  svg.setAttribute('viewBox', '0 0 1130 800');

  // gradient def (namespaced)
  const defs = document.createElementNS(SVGNS, 'defs');
  const grad = document.createElementNS(SVGNS, 'linearGradient');
  grad.setAttribute('id', 'litgrad');
  grad.setAttribute('x1', '0'); grad.setAttribute('y1', '0');
  grad.setAttribute('x2', '1'); grad.setAttribute('y2', '0');
  [['0', '#3c5cff'], ['1', '#ffb627']].forEach(([off, col]) => {
    const st = document.createElementNS(SVGNS, 'stop');
    st.setAttribute('offset', off); st.setAttribute('stop-color', col);
    grad.appendChild(st);
  });
  defs.appendChild(grad); svg.appendChild(defs);

  // each connector line (namespaced)
  seg.forEach(s => {
    const ln = document.createElementNS(SVGNS, 'line');
    ln.setAttribute('data-key', s.key);
    ln.setAttribute('x1', s.x1); ln.setAttribute('y1', s.y1);
    ln.setAttribute('x2', s.x2); ln.setAttribute('y2', s.y2);
    svg.appendChild(ln);
  });

  bracket.insertBefore(svg, bracket.firstChild);
  svgEl = svg;
}
function litConnectors() {
  if (!svgEl) return;
  svgEl.querySelectorAll('line').forEach(ln => {
    const key = ln.getAttribute('data-key');
    if (!key) return;
    const base = key.replace(/_.*$/, '');
    const m = byId[base];
    const lit = m && winnerOf(base);
    ln.classList.toggle('lit', !!lit);
  });
}

function buildHeads() {
  const heads = [
    ['৩২ দলের রাউন্ড', 'L', 0], ['১৬ দলের রাউন্ড', 'L', 1], ['কোয়ার্টার ফাইনাল', 'L', 2], ['সেমি-ফাইনাল', 'L', 3],
    ['সেমি-ফাইনাল', 'R', 3], ['কোয়ার্টার ফাইনাল', 'R', 2], ['১৬ দলের রাউন্ড', 'R', 1], ['৩২ দলের রাউন্ড', 'R', 0]
  ];
  heads.forEach(([txt, side, round]) => {
    const h = el('div', 'colhead');
    h.style.left = headX(side, round) + 'px'; h.style.top = '16px';
    h.style.width = CARD_W + 'px'; h.innerHTML = `<span class="ch-dot"></span>${txt}`;
    bracket.appendChild(h);
  });
}

function buildCards() {
  MATCHES.forEach(m => {
    const x = cardX(m), y = cardY(m);
    if (m.round <= 3) {
      const card = el('div', 'match');
      card.id = 'card-' + m.id;
      card.style.left = x + 'px'; card.style.top = (y - 27) + 'px'; card.style.width = CARD_W + 'px';
      card.appendChild(makeSlot(m, 0));
      card.appendChild(makeSlot(m, 1));
      bracket.appendChild(card);

      const dl = el('div', 'date');
      dl.style.left = x + 'px'; dl.style.top = (y - 27 - 13) + 'px';
      dl.innerHTML = `${m.date}&nbsp;&nbsp;${m.time}`;
      bracket.appendChild(dl);

      const id = el('span', 'mid'); id.textContent = m.id; id.style.top = (y - 7) + 'px';
      if (m.side === 'L') id.style.left = (x - 28) + 'px'; else id.style.left = (x + CARD_W + 4) + 'px';
      bracket.appendChild(id);
    } else {
      const H = 110;
      const box = el('div', 'centerbox' + (m.round === 4 ? ' final' : ''));
      box.id = 'card-' + m.id;
      box.style.left = x + 'px'; box.style.top = (y - H / 2) + 'px'; box.style.width = CARD_W + 'px';

      const hd = el('div', 'centerhead' + (m.round === 5 ? ' small' : ''));
      hd.style.left = x + 'px'; hd.style.top = (y - H / 2 - (m.round === 4 ? 40 : 20)) + 'px'; hd.style.width = CARD_W + 'px';
      hd.textContent = m.round === 4 ? 'ফাইনাল' : 'তৃতীয় স্থান প্লে-অফ';
      bracket.appendChild(hd);

      const dl = el('div', 'cdate'); dl.innerHTML = `${m.date}&nbsp;&nbsp;${m.time}`;
      box.appendChild(dl);
      box.appendChild(makeSlot(m, 0));
      box.appendChild(makeSlot(m, 1));
      const id = el('span', 'cmid'); id.textContent = m.id; box.appendChild(id);
      bracket.appendChild(box);

      if (m.round === 4) {
        const stage = el('div', 'trophy-stage');
        stage.style.left = x + 'px'; stage.style.top = (y - H / 2 - 118) + 'px'; stage.style.width = CARD_W + 'px';
        stage.innerHTML = `<div class="trophy-svg dim" id="bigTrophy">${TROPHY_SVG}</div><div class="champ-name" id="champName"></div>`;
        bracket.appendChild(stage);
      }
    }
  });
}

/* ---------------- render ---------------- */
function flagImg(code, cls) {
  const iso = TEAMS[code][1];
  return `<img class="${cls || 'flag'}" src="https://flagcdn.com/w40/${iso}.png" alt="" crossorigin="anonymous">`;
}
let lastState = {};
function render() {
  MATCHES.forEach(m => {
    [0, 1].forEach(i => {
      const s = document.getElementById(`slot-${m.id}-${i}`);
      const team = resolved(m, i);
      const key = m.id + '-' + i;
      const changed = lastState[key] !== team;
      lastState[key] = team;

      s.classList.toggle('resolved', !!team);
      s.draggable = !!team && m.round !== 5;
      s.classList.remove('is-winner', 'is-loser', 'is-champion', 'is-bronze', 'just-set');
      if (team) {
        let extra = '';
        if (m.round <= 3) {
          const w = winnerOf(m.id);
          if (w) { s.classList.add(team === w ? 'is-winner' : 'is-loser'); }
        } else if (m.round === 4) {
          if (champion && team === champion) { s.classList.add('is-champion'); extra = `<span class="trophy-inline">${TROPHY_SVG}</span>`; }
        } else if (m.round === 5) {
          if (bronze) {
            if (team === bronze) { s.classList.add('is-bronze'); extra = `<span class="medal-inline">🥉</span>`; }
            else s.classList.add('is-loser');
          }
        }
        const clr = (m.round > 0) ? `<button class="clr" data-mid="${m.id}" data-i="${i}" title="clear">×</button>` : '';
        s.innerHTML = flagImg(team) + `<span class="code">${team}</span>` + clr + extra;
        if (changed && m.round > 0) s.classList.add('just-set');
      } else {
        s.innerHTML = `<span class="ph">${m.slots[i]}</span>`;
      }
    });
  });
  litConnectors();
  updateTrophy();
  updateProgress();
  updateSummary();
}
function tname(c) { return TEAMS[c][0]; }

function updateTrophy() {
  const t = document.getElementById('bigTrophy');
  const nm = document.getElementById('champName');
  if (!t) return;
  if (champion) {
    t.classList.remove('dim'); t.classList.add('lit');
    nm.textContent = tname(champion).toUpperCase();
  } else {
    t.classList.add('dim'); t.classList.remove('lit');
    nm.textContent = '';
  }
}

function totalPicks() { return MATCHES.filter(m => m.round > 0 && m.round !== 5).reduce((a, m) => a + 2, 0) + 1; }
function madePicks() {
  let n = 0;
  MATCHES.forEach(m => { if (m.round > 0 && m.round !== 5) { if (resolved(m, 0)) n++; if (resolved(m, 1)) n++; } });
  if (champion) n++;
  return n;
}
function updateProgress() {
  const pct = Math.round(madePicks() / totalPicks() * 100);
  document.getElementById('progFill').style.width = pct + '%';
  document.getElementById('progPct').textContent = pct + '%';
}

function pill(code, champ) {
  if (!code) return `<span class="pill empty">—</span>`;
  const tr = champ ? `<span class="champ-trophy">${TROPHY_SVG}</span>` : '';
  return `<span class="pill${champ ? ' champ' : ''}">${flagImg(code, '')}${tname(code)}${tr}</span>`;
}
function updateSummary() {
  const fin = byId['M104'];
  const f1 = resolved(fin, 0), f2 = resolved(fin, 1);
  document.getElementById('summary').innerHTML =
    `<div class="row"><span class="lbl">ফাইনাল</span>${pill(f1)}<span class="vs">বিরুদ্ধে</span>${pill(f2)}</div>` +
    `<div class="row"><span class="lbl">চ্যাম্পিয়ন</span>${champion ? pill(champion, true) : '<span class="pill empty">এখনো নির্ধারিত হয়নি</span>'}</div>` +
    `<div class="row"><span class="lbl">তৃতীয় স্থান</span>${bronze ? pill(bronze) : '<span class="pill empty">এখনো নির্ধারিত হয়নি</span>'}</div>`;
}

/* ---------------- celebration ---------------- */
const COLORS = ['#ffd86b', '#3c5cff', '#ff5b74', '#46c47e', '#ff9e2c', '#a06bff', '#ffffff'];
function confettiBurst() {
  const host = document.getElementById('confetti');
  for (let i = 0; i < 140; i++) {
    const c = el('div', 'conf');
    const x = Math.random() * 100;
    c.style.left = x + 'vw';
    c.style.top = '-20px';
    c.style.background = COLORS[i % COLORS.length];
    c.style.opacity = String(.7 + Math.random() * .3);
    const dur = 2.6 + Math.random() * 1.8;
    const drift = (Math.random() * 2 - 1) * 120;
    const rot = Math.random() * 720;
    c.animate([
      { transform: `translate(0,0) rotate(0deg)` },
      { transform: `translate(${drift}px,${window.innerHeight + 60}px) rotate(${rot}deg)` }
    ], { duration: dur * 1000, easing: 'cubic-bezier(.25,.6,.4,1)' });
    host.appendChild(c);
    setTimeout(() => c.remove(), dur * 1000);
  }
}
function showToast(team) {
  const t = document.getElementById('toast');
  t.innerHTML = `<span style="width:20px;height:20px;display:inline-block">${TROPHY_SVG}</span> ${tname(team)} বিশ্বচ্যাম্পিয়ন হয়েছে!`;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3200);
}
function maybeCelebrate() {
  if (champion && champion !== prevChampion) {
    confettiBurst(); showToast(champion);
  }
  prevChampion = champion;
}

/* ---------------- interaction ---------------- */
function onDragStart(e) {
  const s = e.currentTarget; const [, mid, i] = s.id.split('-'); const m = byId[mid];
  const team = resolved(m, +i);
  if (!team) { e.preventDefault(); return; }
  dragTeam = team; e.dataTransfer.setData('text/plain', team); e.dataTransfer.effectAllowed = 'copy';
  s.classList.add('dragging');
}
function onDragEnd(e) { dragTeam = null; e.currentTarget.classList.remove('dragging'); clearHi(); }
function onDragOver(e) {
  const s = e.currentTarget; const [, mid, i] = s.id.split('-'); const m = byId[mid];
  if (m.round === 0 || m.round === 5 || !dragTeam) return;
  if (validFor(m, +i).includes(dragTeam)) { e.preventDefault(); s.classList.add('drop-ok'); }
}
function onDragLeave(e) { e.currentTarget.classList.remove('drop-ok'); }
function onDrop(e) {
  const s = e.currentTarget; s.classList.remove('drop-ok');
  const [, mid, i] = s.id.split('-'); const m = byId[mid];
  if (m.round === 0 || m.round === 5) return;
  e.preventDefault();
  const team = dragTeam || e.dataTransfer.getData('text/plain');
  if (validFor(m, +i).includes(team)) { takeOverIfShared(); state[mid][+i] = team; revalidate(); render(); maybeCelebrate(); save(); }
}
function clearHi() { document.querySelectorAll('.drop-ok').forEach(x => x.classList.remove('drop-ok')); }

/* The moment a viewer edits someone else's shared bracket, it becomes their own. */
function takeOverIfShared() {
  if (viewingShared) {
    viewingShared = false; playerName = '';
    renderPredBy();
    if (history.replaceState) history.replaceState(null, '', location.pathname);
  }
}

/* A fresh visitor (not from a shared link, no name yet) is asked their name
   once, right after their first pick — so their bracket is named before sharing. */
let askedNameOnce = false;
function maybeAskNameAfterFirstPick() {
  if (askedNameOnce) return;
  if (viewingShared) return;          // shared-takeover handles its own naming
  if (playerName || loadName()) { askedNameOnce = true; playerName = playerName || loadName(); renderPredBy(); return; }
  askedNameOnce = true;
  showNameStep({ mode: 'start', after: () => { closeShare(); renderPredBy(); render(); } });
}

bracket.addEventListener('click', e => {
  const clr = e.target.closest('.clr');
  if (clr) {
    takeOverIfShared();
    const m = byId[clr.dataset.mid];
    if (m.round === 5) { bronze = null; render(); save(); return; }
    state[clr.dataset.mid][+clr.dataset.i] = null; revalidate(); render(); save(); return;
  }
  const s = e.target.closest('.slot'); if (!s) return;
  const [, mid, i] = s.id.split('-'); const m = byId[mid];
  const team = resolved(m, +i); if (!team) return;
  takeOverIfShared();
  if (m.round <= 3) {
    const d = downstream[mid]; if (!d) return;
    state[d.mid][d.sidx] = (state[d.mid][d.sidx] === team) ? null : team;
    revalidate(); render(); maybeCelebrate(); save(); maybeAskNameAfterFirstPick();
  } else if (m.round === 4) {
    champion = (champion === team) ? null : team; render(); maybeCelebrate(); save(); maybeAskNameAfterFirstPick();
  } else if (m.round === 5) {
    bronze = (bronze === team) ? null : team; render(); save(); maybeAskNameAfterFirstPick();
  }
});

/* auto-fill + reset */
function simulate() {
  takeOverIfShared();
  MATCHES.forEach(m => { if (m.round > 0 && m.round !== 5) state[m.id] = [null, null]; });
  champion = null; bronze = null; prevChampion = null;
  [0, 1, 2, 3].forEach(r => {
    MATCHES.filter(m => m.round === r).forEach(m => {
      const t = [resolved(m, 0), resolved(m, 1)];
      if (t[0] && t[1]) {
        const w = t[Math.floor(Math.random() * 2)];
        const d = downstream[m.id]; if (d) state[d.mid][d.sidx] = w;
      }
    });
  });
  const fin = byId['M104']; const fs = [resolved(fin, 0), resolved(fin, 1)].filter(Boolean);
  if (fs.length === 2) champion = fs[Math.floor(Math.random() * 2)];
  revalidate();
  const third = byId['M103']; const bs = [resolved(third, 0), resolved(third, 1)].filter(Boolean);
  if (bs.length === 2) bronze = bs[Math.floor(Math.random() * 2)];
  render(); maybeCelebrate(); save();
}
function resetAll() {
  takeOverIfShared();
  MATCHES.forEach(m => { if (m.round > 0 && m.round !== 5) state[m.id] = [null, null]; });
  champion = null; bronze = null; prevChampion = null; revalidate(); render(); save();
  if (history.replaceState) history.replaceState(null, '', location.pathname);
  markSaved('মুছে ফেলা হলো ✓');
}
document.getElementById('simBtn').addEventListener('click', simulate);
document.getElementById('resetBtn').addEventListener('click', resetAll);

/* ============================================================
   SHARE  — WhatsApp-first. The whole bracket rides inside the
   link (#p=...), so anyone can open it with no app or sign-up.
   ============================================================ */
const shareModal = document.getElementById('shareModal');
const shareLinkInput = document.getElementById('shareLink');
const shareNote = document.getElementById('shareNote');
const nameStep = document.getElementById('nameStep');
const shareStep = document.getElementById('shareStep');
const nameInput = document.getElementById('nameInput');

const NAME_KEY = 'wc2026_name';
function loadName() { try { return localStorage.getItem(NAME_KEY) || ''; } catch (e) { return ''; } }
function persistName() { try { localStorage.setItem(NAME_KEY, playerName); } catch (e) { } }

function shareMessage(url) {
  const who = playerName ? `${playerName} এর ` : 'আমার ';
  if (champion) return `${playerName ? playerName + ' এর' : 'আমার'} ফিফা বিশ্বকাপ ২০২৬ চ্যাম্পিয়ন: ${tname(champion)} 🏆\n${who}সম্পূর্ণ ব্র্যাকেট দেখুন ও নিজেরটি তৈরি করুন:\n${url}`;
  return `আপনার ${who}ফিফা বিশ্বকাপ ২০২৬ ব্র্যাকেট দেখুন — নিজেরটি তৈরি করুন:\n${url}`;
}
function whatsappURL() {
  return 'https://wa.me/?text=' + encodeURIComponent(shareMessage(buildShareURL()));
}

function showShareStep() {
  nameStep.hidden = true; shareStep.hidden = false;
  shareLinkInput.value = buildShareURL();
  shareNote.textContent = '';
  if (history.replaceState) history.replaceState(null, '', buildShareURL().split(location.pathname)[1] || '');
}

/* The name step can be opened in two contexts:
   - 'start'  : user is beginning their own prediction (from "Make your own" or first pick)
   - 'share'  : (legacy) — name confirmation right before sharing
   nameAfter() decides what happens once a name is committed/skipped. */
let nameAfter = null;
function showNameStep(opts) {
  opts = opts || {};
  nameStep.hidden = false; shareStep.hidden = true;
  // contextual copy
  const t = document.getElementById('nameStepTitle');
  const s = document.getElementById('nameStepSub');
  const btn = document.getElementById('nameNext');
  const btnSpan = btn ? btn.querySelector('span') : null;
  if (opts.mode === 'start') {
    if (t) t.textContent = "আপনার নাম কী?";
    if (s) s.textContent = "আপনার নাম আপনার ব্র্যাকেটে লিখে দেব, যাতে বন্ধুদের জানতে পারে এটা কার ভবিষ্যদ্বাণী।";
    if (btnSpan) btnSpan.textContent = 'আমার ভবিষ্যদ্বাণী শুরু করুন';
  } else {
    if (t) t.textContent = "আপনার নাম কী?";
    if (s) s.textContent = "এটি আপনার ব্র্যাকেটে দেখানো হবে, যাতে বন্ধুদের জানতে পারে এটা কার ভবিষ্যদ্বাণী।";
    if (btnSpan) btnSpan.textContent = 'শেয়ার করতে চালিয়ে যান';
  }
  nameAfter = opts.after || null;
  nameInput.value = playerName || loadName();
  shareModal.classList.add('show');
  shareModal.setAttribute('aria-hidden', 'false');
  setTimeout(() => { nameInput.focus(); nameInput.select && nameInput.select(); }, 250);
}
function openShare() {
  // name already known by now → go straight to share options
  shareModal.classList.add('show');
  shareModal.setAttribute('aria-hidden', 'false');
  showShareStep();
}
function closeShare() {
  shareModal.classList.remove('show');
  shareModal.setAttribute('aria-hidden', 'true');
}
function commitName() {
  const v = (nameInput.value || '').trim().slice(0, 40);
  playerName = v;
  if (v) persistName();
  renderPredBy();
  const cb = nameAfter; nameAfter = null;
  if (cb) cb();
  else showShareStep();
}
function skipName() {
  playerName = ''; renderPredBy();
  const cb = nameAfter; nameAfter = null;
  if (cb) cb();
  else showShareStep();
}

document.getElementById('shareBtn').addEventListener('click', openShare);
document.getElementById('shareClose').addEventListener('click', closeShare);
shareModal.addEventListener('click', e => { if (e.target === shareModal) closeShare(); });
document.getElementById('nameNext').addEventListener('click', commitName);
document.getElementById('nameSkip').addEventListener('click', skipName);
document.getElementById('editName').addEventListener('click', () => showNameStep({ mode: 'share' }));
nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') commitName(); });
document.getElementById('shareWhatsApp').addEventListener('click', () => { window.open(whatsappURL(), '_blank', 'noopener'); });

document.getElementById('copyLink').addEventListener('click', async () => {
  const url = shareLinkInput.value;
  try {
    await navigator.clipboard.writeText(url);
    shareNote.textContent = 'লিংক কপি করা হয়েছে ✓';
  } catch (e) {
    shareLinkInput.focus(); shareLinkInput.select();
    try { document.execCommand('copy'); shareNote.textContent = 'লিংক কপি করা হয়েছে ✓'; }
    catch (_) { shareNote.textContent = 'লিংকটি কপি করতে ধরে রাখুন।'; }
  }
});

/* Banner showing whose prediction is on screen.
   - viewing someone else's shared bracket  -> name + "Make your own"
   - your own named bracket                  -> name + "Edit name" */
function renderPredBy() {
  const bar = document.getElementById('predBy');
  if (!bar) return;
  const mineBtn = document.getElementById('makeOwn');
  if (playerName) {
    document.getElementById('predByName').textContent = playerName;
    bar.hidden = false;
    if (viewingShared) {
      mineBtn.textContent = 'নিজেরটি তৈরি করুন →';
      mineBtn.dataset.act = 'own';
    } else {
      mineBtn.textContent = 'নাম পরিবর্তন করুন';
      mineBtn.dataset.act = 'edit';
    }
  } else {
    bar.hidden = true;
  }
}
function startFreshBracket() {
  viewingShared = false;
  MATCHES.forEach(m => { if (m.round > 0 && m.round !== 5) state[m.id] = [null, null]; });
  champion = null; bronze = null; prevChampion = null;
  revalidate();
  if (history.replaceState) history.replaceState(null, '', location.pathname);
  renderPredBy(); render();
  closeShare();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
document.getElementById('makeOwn').addEventListener('click', e => {
  if (e.currentTarget.dataset.act === 'edit') {
    // editing the name on your own bracket — don't wipe picks
    showNameStep({ mode: 'start', after: () => { closeShare(); renderPredBy(); render(); } });
  } else {
    // taking over someone else's shared bracket — ask name, then clean slate
    playerName = '';
    showNameStep({ mode: 'start', after: startFreshBracket });
  }
});

/* ============================================================
   SAVE IMAGE  — draws a clean shareable result card on a
   <canvas> (works on every browser incl. mobile Safari).
   ============================================================ */
function loadImg(src) {
  return new Promise((res, rej) => {
    const i = new Image(); i.crossOrigin = 'anonymous';
    i.onload = () => res(i); i.onerror = rej; i.src = src;
  });
}
function flagURL(code) { return `https://flagcdn.com/w80/${TEAMS[code][1]}.png`; }

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* Builds the full-bracket PNG and returns a Blob. */
function buildBracketBlob() {
  return new Promise(async (resolve, reject) => {
    try {
      const S = 2;                         // retina scale
      const BW = 1130, BH = 800;             // native bracket coordinate space
      const PAD = 40;                      // side padding
      const HEAD = champion ? 210 : 170;       // header band height
      const FOOT = 70;
      const W = BW + PAD * 2;
      const H = HEAD + BH + FOOT;
      const c = document.createElement('canvas');
      c.width = W * S; c.height = H * S;
      const ctx = c.getContext('2d');
      ctx.scale(S, S);

      /* ---- background ---- */
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#1b2350'); g.addColorStop(.5, '#26307a'); g.addColorStop(1, '#141b44');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      /* ---- header ---- */
      ctx.textAlign = 'center';
      ctx.fillStyle = '#aeb8ee';
      ctx.font = '700 26px -apple-system,Segoe UI,Roboto,sans-serif';
      ctx.fillText('ফিফা বিশ্বকাপ ২০২৬  •  নকআউট ব্র্যাকেট', W / 2, 52);
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 68px -apple-system,Segoe UI,Roboto,sans-serif';
      ctx.fillText(playerName ? `${playerName} এর ভবিষ্যদ্বাণী` : 'আমার ব্র্যাকেট ভবিষ্যদ্বাণী', W / 2, 122);

      /* preload every flag we need */
      const codes = new Set();
      MATCHES.forEach(m => { [0, 1].forEach(i => { const t = resolved(m, i); if (t) codes.add(t); }); });
      const flags = {};
      await Promise.all([...codes].map(async code => {
        try { flags[code] = await loadImg(flagURL(code)); } catch (e) { flags[code] = null; }
      }));
      let trophyImg = null;
      try { trophyImg = await loadImg('data:image/svg+xml;base64,' + btoa(TROPHY_SVG)); } catch (e) { }

      /* champion strip in header */
      if (champion) {
        const cy = 172;
        if (trophyImg) ctx.drawImage(trophyImg, W / 2 - 150, cy - 34, 50, 50);
        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffd86b';
        ctx.font = '800 40px -apple-system,Segoe UI,Roboto,sans-serif';
        const champTxt = 'চ্যাম্পিয়ন: ' + tname(champion);
        const tw = ctx.measureText(champTxt).width;
        // center the trophy+text group
        const startX = W / 2 - 90;
        ctx.fillText(champTxt, startX, cy + 6);
        ctx.textAlign = 'center';
      }

      /* ---- bracket origin ---- */
      const OX = PAD, OY = HEAD;
      const px = x => OX + x, py = y => OY + y;

      /* connector lines (same math as buildConnectors) */
      const segs = [];
      const addLine = (x1, y1, x2, y2, key) => segs.push({ x1, y1, x2, y2, key });
      MATCHES.forEach(m => {
        if (m.round >= 1 && m.round <= 3) {
          const a = matchAt(m.side, m.round - 1, m.idx * 2), b = matchAt(m.side, m.round - 1, m.idx * 2 + 1);
          const aY = cardY(a), bY = cardY(b), tY = cardY(m);
          if (m.side === 'L') {
            const fR = cardX(a) + CARD_W, tL = cardX(m), midX = (fR + tL) / 2;
            addLine(fR, aY, midX, aY, a.id); addLine(fR, bY, midX, bY, b.id);
            addLine(midX, aY, midX, bY, m.id + '_v'); addLine(midX, tY, tL, tY, m.id + '_in');
          } else {
            const fL = cardX(a), tR = cardX(m) + CARD_W, midX = (fL + tR) / 2;
            addLine(fL, aY, midX, aY, a.id); addLine(fL, bY, midX, bY, b.id);
            addLine(midX, aY, midX, bY, m.id + '_v'); addLine(midX, tY, tR, tY, m.id + '_in');
          }
        }
      });
      const finM = byId['M104'], finY = cardY(finM), finBottom = finY + 54, finCx = cardX(finM) + CARD_W / 2;
      const sfL = byId['M101'], sfR = byId['M102'];
      const sfTop = cardY(sfL) - 28, sfLcx = cardX(sfL) + CARD_W / 2, sfRcx = cardX(sfR) + CARD_W / 2;
      const midY = (finBottom + sfTop) / 2;
      addLine(finCx, finBottom, finCx, midY, 'M101'); addLine(sfLcx, midY, finCx, midY, 'M101');
      addLine(sfRcx, midY, finCx, midY, 'M102'); addLine(sfLcx, midY, sfLcx, sfTop, 'M101');
      addLine(sfRcx, midY, sfRcx, sfTop, 'M102');

      segs.forEach(s => {
        const base = s.key.replace(/_.*$/, ''); const lit = winnerOf(base);
        ctx.strokeStyle = lit ? 'rgba(255,200,80,.6)' : 'rgba(255,255,255,.18)';
        ctx.lineWidth = lit ? 2 : 1.4;
        ctx.beginPath(); ctx.moveTo(px(s.x1), py(s.y1)); ctx.lineTo(px(s.x2), py(s.y2)); ctx.stroke();
      });

      /* round headers */
      ctx.fillStyle = '#9aa6e0';
      ctx.font = '700 13px -apple-system,Segoe UI,Roboto,sans-serif';
      ctx.textAlign = 'center';
      const heads = [['ROUND OF 32', 'L', 0], ['ROUND OF 16', 'L', 1], ['QUARTER-FINAL', 'L', 2], ['SEMI-FINAL', 'L', 3],
      ['SEMI-FINAL', 'R', 3], ['QUARTER-FINAL', 'R', 2], ['ROUND OF 16', 'R', 1], ['ROUND OF 32', 'R', 0]];
      heads.forEach(([txt, side, round]) => {
        const x = (side === 'L' ? XL[round] : XR[round]) + CARD_W / 2;
        ctx.fillText(txt, px(x), py(16));
      });

      /* a single team slot */
      function drawSlot(code, x, y, w, h, opts) {
        opts = opts || {};
        // background tint
        let bg = 'rgba(255,255,255,.92)';
        if (opts.champion) bg = '#ffd86b';
        else if (opts.bronze) bg = '#e9c48c';
        else if (opts.winner) bg = '#e8f5ee';
        else if (opts.loser) bg = 'rgba(255,255,255,.5)';
        ctx.fillStyle = bg;
        ctx.fillRect(x, y, w, h);
        // winner accent bar
        if (opts.winner || opts.champion || opts.bronze) {
          ctx.fillStyle = opts.bronze ? '#b07d2e' : (opts.champion ? '#d99405' : '#d99405');
          ctx.fillRect(x, y, 3, h);
        }
        // flag
        const fw = 22, fh = 15, fx = x + 10, fy = y + (h - fh) / 2;
        if (code && flags[code]) {
          ctx.save(); ctx.beginPath(); ctx.rect(fx, fy, fw, fh); ctx.clip();
          ctx.drawImage(flags[code], fx, fy, fw, fh); ctx.restore();
          ctx.strokeStyle = 'rgba(0,0,0,.15)'; ctx.lineWidth = .5; ctx.strokeRect(fx, fy, fw, fh);
        }
        // name — use the short code (e.g. GER, BRA) so it fits inside the box
        ctx.textAlign = 'left';
        ctx.fillStyle = opts.loser ? '#9aa1b5' : (opts.champion || opts.bronze ? '#3a2400' : '#1c2336');
        ctx.font = (opts.winner || opts.champion ? '800' : '700') + ' 15px -apple-system,Segoe UI,Roboto,sans-serif';
        const nm = code ? code : (opts.ph || '');
        if (!code) { ctx.fillStyle = '#aab1c4'; ctx.font = '500 11px sans-serif'; }
        ctx.fillText(nm, x + 38, y + h / 2 + 5);
        // medal/trophy
        if (opts.champion && trophyImg) ctx.drawImage(trophyImg, x + w - 22, y + (h - 18) / 2, 18, 18);
        ctx.textAlign = 'center';
      }

      /* draw a match card (two slots) */
      function drawCard(m) {
        const x = px(cardX(m)), y = py(cardY(m) - 27), w = CARD_W, slotH = 31;
        // card frame
        ctx.fillStyle = 'rgba(255,255,255,.92)';
        roundRect(ctx, x, y, w, slotH * 2, 5); ctx.fill();
        const w0 = winnerOf(m.id);
        [0, 1].forEach(i => {
          const code = resolved(m, i);
          const isW = code && w0 && code === w0;
          const isL = code && w0 && code !== w0;
          drawSlot(code, x, y + i * slotH, w, slotH, { winner: isW, loser: isL, ph: m.slots[i] });
        });
        // divider
        ctx.strokeStyle = 'rgba(0,0,0,.07)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, y + slotH); ctx.lineTo(x + w, y + slotH); ctx.stroke();
        // outline
        ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 1;
        roundRect(ctx, x, y, w, slotH * 2, 5); ctx.stroke();
      }

      MATCHES.filter(m => m.round <= 3).forEach(drawCard);

      /* center boxes: Final + 3rd place */
      function drawCenter(m, title, gold) {
        const x = px(cardX(m)), slotH = 31, boxH = slotH * 2 + 34;
        const y = py(cardY(m)) - boxH / 2, w = CARD_W;
        // title
        ctx.fillStyle = gold ? '#ffd86b' : '#9aa6e0';
        ctx.font = (gold ? '800 16px' : '700 12px') + ' -apple-system,Segoe UI,Roboto,sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(title, x + w / 2, y - 8);
        // box
        ctx.fillStyle = gold ? '#fff6e4' : 'rgba(255,255,255,.92)';
        roundRect(ctx, x, y, w, boxH, 8); ctx.fill();
        ctx.strokeStyle = gold ? '#d99405' : 'rgba(0,0,0,.12)';
        ctx.lineWidth = gold ? 2 : 1; roundRect(ctx, x, y, w, boxH, 8); ctx.stroke();
        [0, 1].forEach(i => {
          const code = resolved(m, i);
          const opts = { ph: m.slots[i] };
          if (m.round === 4) opts.champion = champion && code === champion;
          if (m.round === 5) { opts.bronze = bronze && code === bronze; opts.loser = bronze && code && code !== bronze; }
          drawSlot(code, x + 2, y + 8 + i * slotH, w - 4, slotH, opts);
        });
      }
      drawCenter(byId['M104'], 'ফাইনাল', true);
      drawCenter(byId['M103'], 'তৃতীয় স্থান', false);

      /* footer */
      ctx.fillStyle = '#7e88bf';
      ctx.font = '600 22px -apple-system,Segoe UI,Roboto,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('নিজেরটি ভবিষ্যদ্বাণী করুন — আপনার বিশ্বকাপ ২০২৬ ব্র্যাকেট শেয়ার করুন', W / 2, H - 38);
      ctx.fillStyle = '#bfc7f1';
      ctx.font = '600 16px -apple-system,Segoe UI,Roboto,sans-serif';
      ctx.fillText('© ২০২৬ • Developed & Designed by Rupash Das (রুপস দাশ)', W / 2, H - 12);

      c.toBlob(b => { b ? resolve(b) : reject(new Error('toBlob returned null')); }, 'image/png');
    } catch (err) { reject(err); }
  });
}

function bracketFilename() {
  const who = playerName ? playerName.replace(/\s+/g, '-').toLowerCase() : 'my';
  return `wc2026-${who}-bracket.png`;
}
function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

/* "Save image" button */
async function exportPNG() {
  const btn = document.getElementById('pngBtn');
  const label = btn.querySelector('span:last-child');
  const old = label ? label.textContent : ''; if (label) label.textContent = 'Saving…';
  btn.style.pointerEvents = 'none';
  try {
    const blob = await buildBracketBlob();
    downloadBlob(blob, bracketFilename());
  } catch (err) {
    console.error(err);
    alert('Sorry — could not create the image. Please try again.');
  } finally {
    if (label) label.textContent = old; btn.style.pointerEvents = '';
  }
}
document.getElementById('pngBtn').addEventListener('click', exportPNG);

/* ---------------- init ---------------- */
buildConnectors();
buildHeads();
buildCards();

/* scroll hint: hide once scrolled, or if nothing to scroll */
(function () {
  const sc = document.getElementById('scroller');
  const hint = document.getElementById('scrollHint');
  if (!sc || !hint) return;
  const check = () => { if (sc.scrollWidth <= sc.clientWidth + 4) hint.style.display = 'none'; };
  sc.addEventListener('scroll', () => { hint.style.opacity = '0'; }, { once: true });
  setTimeout(check, 300);
  window.addEventListener('resize', check);
})();

/* priority: a shared link in the URL wins over local storage */
if (loadFromURL()) {
  viewingShared = true;          // opened from someone's shared link
} else {
  loadStored();
  playerName = loadName();       // returning user's own saved name
}
renderPredBy();
prevChampion = champion;
render();
