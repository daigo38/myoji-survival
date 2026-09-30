const NAMES = SURNAMES.map(d => d[0]);
const INIT = SURNAMES.map(d => d[1]);
const K = NAMES.length;
const N = INIT.reduce((a, b) => a + b, 0);
const W = 1200, H = 720, R = 2.5, D = 2 * R, D2 = D * D, SPEED = 1.1, TURN = 0.6;
const CELL = D, GW = Math.ceil(W / CELL), GH = Math.ceil(H / CELL), GC = GW * GH;
const TOP_ROWS = 12, ROW_H = 34, RING_MAX = 300;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt = n => n.toLocaleString('ja-JP');
const $ = id => document.getElementById(id);

const px = new Float32Array(N), py = new Float32Array(N), ph = new Float32Array(N);
const nm = new Uint16Array(N);
const counts = new Int32Array(K);
const extinctAt = new Float64Array(K);
const cellCount = new Int32Array(GC), cellStart = new Int32Array(GC + 1), cellFill = new Int32Array(GC);
const cellOf = new Int32Array(N), cellItems = new Int32Array(N);
const bucketStart = new Int32Array(K + 1), bucketFill = new Int32Array(K), order = new Int32Array(N);

let step, conv, alive, history, histEvery, events, rings, finished, lastLeader, tracked = -1;
const SPEEDS = [0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, 128];
let running = true, spf = 1, stepDebt = 0;

$('totalN').textContent = fmt(N);
$('totalN2').textContent = fmt(N);
$('nameList').innerHTML = NAMES.map(n => `<option value="${n}">`).join('');

function reset() {
  let i = 0;
  for (let k = 0; k < K; k++) for (let c = 0; c < INIT[k]; c++, i++) {
    nm[i] = k;
    px[i] = R + Math.random() * (W - 2 * R);
    py[i] = R + Math.random() * (H - 2 * R);
    ph[i] = Math.random() * Math.PI * 2;
  }
  counts.set(INIT);
  extinctAt.fill(-1);
  baseColors(); applyColors();
  step = 0; conv = 0; alive = K; finished = false; lastLeader = 0;
  history = []; histEvery = 10; events = []; rings = [];
  recordHistory();
  $('banner').hidden = true;
  setRunning(true);
  raceEls.forEach(el => el.remove()); raceEls.clear();
  updateUI(true);
}

function buildGrid() {
  cellCount.fill(0);
  for (let i = 0; i < N; i++) {
    let cx = (px[i] / CELL) | 0, cy = (py[i] / CELL) | 0;
    if (cx < 0) cx = 0; else if (cx >= GW) cx = GW - 1;
    if (cy < 0) cy = 0; else if (cy >= GH) cy = GH - 1;
    const c = cy * GW + cx;
    cellOf[i] = c; cellCount[c]++;
  }
  let s = 0;
  for (let c = 0; c < GC; c++) { cellStart[c] = s; cellFill[c] = s; s += cellCount[c]; }
  cellStart[GC] = s;
  for (let i = 0; i < N; i++) cellItems[cellFill[cellOf[i]]++] = i;
}

function collide(i, j) {
  const a = nm[i], b = nm[j];
  let w, l, p;
  if (Math.random() < 0.5) { w = a; l = b; p = j; } else { w = b; l = a; p = i; }
  nm[p] = w; counts[w]++; counts[l]--; conv++;
  if (counts[l] === 0) {
    alive--; extinctAt[l] = step;
    // Ripple where a surname's last member disappears; bigger and slower for the tracked one.
    if (!reducedMotion && (l === tracked || rings.length < RING_MAX)) rings.push({ x: px[p], y: py[p], k: l, age: 0, big: l === tracked });
    pushEvent({ type: 'ext', k: l, step, alive, by: w });
  }
}

function stepOnce() {
  for (let i = 0; i < N; i++) {
    let a = ph[i] + (Math.random() - 0.5) * TURN;
    let x = px[i] + Math.cos(a) * SPEED, y = py[i] + Math.sin(a) * SPEED;
    if (x < R) { x = R; a = Math.PI - a; } else if (x > W - R) { x = W - R; a = Math.PI - a; }
    if (y < R) { y = R; a = -a; } else if (y > H - R) { y = H - R; a = -a; }
    px[i] = x; py[i] = y; ph[i] = a;
  }
  buildGrid();
  for (let i = 0; i < N; i++) {
    const c = cellOf[i], cx = c % GW, cy = (c / GW) | 0;
    for (let yy = cy - 1; yy <= cy + 1; yy++) {
      if (yy < 0 || yy >= GH) continue;
      for (let xx = cx - 1; xx <= cx + 1; xx++) {
        if (xx < 0 || xx >= GW) continue;
        const cc = yy * GW + xx;
        for (let q = cellStart[cc], e = cellStart[cc + 1]; q < e; q++) {
          const j = cellItems[q];
          if (j <= i) continue;
          const dx = px[j] - px[i], dy = py[j] - py[i], d2 = dx * dx + dy * dy;
          if (d2 >= D2) continue;
          if (nm[i] !== nm[j]) collide(i, j);
          if (d2 === 0) continue;
          const d = Math.sqrt(d2), ov = (D - d) * 0.5, nx = dx / d, ny = dy / d;
          px[i] -= nx * ov; py[i] -= ny * ov; px[j] += nx * ov; py[j] += ny * ov;
          const ang = Math.atan2(ny, nx);
          ph[j] = ang + (Math.random() - 0.5);
          ph[i] = ang + Math.PI + (Math.random() - 0.5);
        }
      }
    }
  }
  step++;
}

function recordHistory() {
  history.push({ s: step, a: alive, c: Uint16Array.from(counts) });
  if (history.length >= 400) {
    history = history.filter((_, i) => i % 2 === 0);
    histEvery *= 2;
  }
}

function pushEvent(ev) {
  events.unshift(ev);
  if (events.length > 60) events.length = 60;
}

/* ---------- theme & colors ---------- */
let tokens = {}, colors = [], themeKey = '', dotS = '', dotL = '';
const hue = new Float32Array(K), light = new Float32Array(K);
const RECOLOR_AT = [120, 48, 20, 10, 5];
let recolorIdx = 0;
function baseColors() {
  for (let k = 0; k < K; k++) { hue[k] = (k * 137.508 + 12) % 360; light[k] = [0, -8, 7][k % 3]; }
  recolorIdx = 0;
}
function paint(k) { return `hsl(${hue[k].toFixed(1)} ${dotS} calc(${dotL} + ${light[k]}%))`; }
function applyColors() {
  colors = NAMES.map((_, k) => paint(k));
  raceEls.forEach((el, k) => el.querySelector('.bar i').style.background = colors[k]);
}
// When few surnames remain, spread the survivors evenly around the hue wheel (keeping their order) so look-alike colors separate.
function maybeRecolor() {
  if (recolorIdx >= RECOLOR_AT.length || alive > RECOLOR_AT[recolorIdx]) return;
  while (recolorIdx < RECOLOR_AT.length && alive <= RECOLOR_AT[recolorIdx]) recolorIdx++;
  const live = [];
  for (let k = 0; k < K; k++) if (counts[k] > 0) live.push(k);
  live.sort((a, b) => hue[a] - hue[b]);
  const off = hue[live[0]], m = live.length;
  live.forEach((k, i) => { hue[k] = (off + i * 360 / m) % 360; light[k] = m > 14 ? [0, -9, 8][i % 3] : 0; });
  applyColors();
}
function readTokens() {
  const cs = getComputedStyle(document.documentElement);
  const g = n => cs.getPropertyValue(n).trim();
  tokens = { field: g('--field'), ink: g('--ink'), muted: g('--muted'), line: g('--line'), accent: g('--accent'), soft: g('--accent-soft'), panel: g('--panel') };
  const key = g('--dot-s') + g('--dot-l');
  if (key !== themeKey) { themeKey = key; dotS = g('--dot-s'); dotL = g('--dot-l'); applyColors(); }
}

/* ---------- field rendering ---------- */
const field = $('field'), fctx = field.getContext('2d');
let fScale = 1, dpr = 1;
function sizeField() {
  dpr = window.devicePixelRatio || 1;
  const w = field.clientWidth;
  fScale = w / W;
  field.width = Math.round(w * dpr);
  field.height = Math.round(w * H / W * dpr);
}
new ResizeObserver(sizeField).observe(field);

function drawField() {
  const ctx = fctx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = tokens.field;
  ctx.fillRect(0, 0, field.width, field.height);
  ctx.setTransform(fScale * dpr, 0, 0, fScale * dpr, 0, 0);
  const r = Math.max(R, 1.15 / fScale);
  bucketStart.fill(0);
  for (let i = 0; i < N; i++) bucketStart[nm[i] + 1]++;
  for (let k = 0; k < K; k++) { bucketStart[k + 1] += bucketStart[k]; bucketFill[k] = bucketStart[k]; }
  for (let i = 0; i < N; i++) order[bucketFill[nm[i]]++] = i;
  ctx.globalAlpha = tracked >= 0 ? 0.28 : 1;
  for (let k = 0; k < K; k++) {
    const s = bucketStart[k], e = bucketStart[k + 1];
    if (s === e || k === tracked) continue;
    ctx.fillStyle = colors[k];
    ctx.beginPath();
    for (let q = s; q < e; q++) { const i = order[q]; ctx.moveTo(px[i] + r, py[i]); ctx.arc(px[i], py[i], r, 0, 6.2832); }
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (tracked >= 0) {
    const s = bucketStart[tracked], e = bucketStart[tracked + 1];
    ctx.fillStyle = colors[tracked];
    ctx.beginPath();
    for (let q = s; q < e; q++) { const i = order[q]; ctx.moveTo(px[i] + r * 1.3, py[i]); ctx.arc(px[i], py[i], r * 1.3, 0, 6.2832); }
    ctx.fill();
  }
  for (const g of rings) {
    const life = g.big ? 70 : 28;
    ctx.globalAlpha = Math.max(0, 1 - g.age / life);
    ctx.strokeStyle = colors[g.k];
    ctx.lineWidth = (g.big ? 2.5 : 1.3) / fScale;
    ctx.beginPath(); ctx.arc(g.x, g.y, r * (1.5 + g.age * (g.big ? 0.6 : 0.35)), 0, 6.2832); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/* ---------- hover tooltip ---------- */
const tip = $('tip');
field.addEventListener('mousemove', ev => {
  const rect = field.getBoundingClientRect();
  const wx = (ev.clientX - rect.left) / fScale, wy = (ev.clientY - rect.top) / fScale;
  let best = -1, bd = (R * 3) ** 2;
  const cx = (wx / CELL) | 0, cy = (wy / CELL) | 0;
  for (let yy = cy - 2; yy <= cy + 2; yy++) for (let xx = cx - 2; xx <= cx + 2; xx++) {
    if (yy < 0 || yy >= GH || xx < 0 || xx >= GW) continue;
    const cc = yy * GW + xx;
    for (let q = cellStart[cc]; q < cellStart[cc + 1]; q++) {
      const i = cellItems[q], d = (px[i] - wx) ** 2 + (py[i] - wy) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
  }
  if (best < 0) { tip.hidden = true; return; }
  const k = nm[best];
  tip.innerHTML = `<b>${NAMES[k]}</b>いま ${fmt(counts[k])}人 ・ 初期 ${k + 1}位 ${INIT[k]}人`;
  tip.hidden = false;
  const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
  const tw = tip.offsetWidth;
  tip.style.left = Math.min(Math.max(4, x + 14), rect.width - tw - 4) + 'px';
  tip.style.top = (y > 50 ? y - 40 : y + 18) + 'px';
});
field.addEventListener('mouseleave', () => tip.hidden = true);
field.addEventListener('click', ev => {
  if (tip.hidden) return;
  const name = tip.querySelector('b').textContent;
  setTracked(NAMES.indexOf(name));
});

/* ---------- ranking race ---------- */
const race = $('race'), raceEls = new Map();
function rankedIndices() {
  const idx = [];
  for (let k = 0; k < K; k++) if (counts[k] > 0) idx.push(k);
  idx.sort((a, b) => counts[b] - counts[a] || a - b);
  return idx;
}
function updateRace(ranked) {
  const top = ranked.slice(0, TOP_ROWS);
  const max = counts[top[0]] || 1;
  const keep = new Set(top);
  raceEls.forEach((el, k) => {
    if (!keep.has(k) && !el.dataset.leaving) {
      el.dataset.leaving = '1';
      el.style.opacity = '0';
      setTimeout(() => { if (el.dataset.leaving) { el.remove(); raceEls.delete(k); } }, 250);
    }
  });
  top.forEach((k, p) => {
    let el = raceEls.get(k);
    if (!el) {
      el = document.createElement('li');
      el.className = 'row';
      el.innerHTML = `<span class="rk"></span><button class="nm" type="button" title="クリックで追跡">${NAMES[k]}</button><span class="bar"><i></i></span><span class="ct"></span><span class="sh"></span>`;
      el.querySelector('.bar i').style.background = colors[k];
      el.querySelector('.nm').addEventListener('click', () => {
        if (tracked === k) { $('track').value = ''; setTracked(-1); } else setTracked(k);
      });
      el.style.transform = `translateY(${TOP_ROWS * ROW_H}px)`;
      el.style.opacity = '0';
      race.appendChild(el);
      raceEls.set(k, el);
      el.getBoundingClientRect();
    }
    delete el.dataset.leaving;
    el.style.opacity = '1';
    el.style.transform = `translateY(${p * ROW_H}px)`;
    el.classList.toggle('tracked', k === tracked);
    el.querySelector('.rk').textContent = p + 1;
    el.querySelector('.bar i').style.width = (counts[k] / max * 100).toFixed(1) + '%';
    el.querySelector('.ct').textContent = fmt(counts[k]);
    el.querySelector('.sh').textContent = (counts[k] / N * 100).toFixed(1) + '%';
  });
}

/* ---------- charts ---------- */
function prepChart(c) {
  const w = c.clientWidth, h = c.clientHeight;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const ctx = c.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.font = `13px ${getComputedStyle(document.body).getPropertyValue('--font-data')}`;
  return { ctx, w, h };
}
function axes(ctx, box, yTicks, xTicks) {
  ctx.strokeStyle = tokens.line; ctx.fillStyle = tokens.muted; ctx.lineWidth = 1;
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const [v, label] of yTicks) {
    const y = Math.round(box.y(v)) + 0.5;
    ctx.beginPath(); ctx.moveTo(box.l, y); ctx.lineTo(box.r, y); ctx.stroke();
    ctx.fillText(label, box.l - 6, y);
  }
  ctx.textBaseline = 'top';
  xTicks.forEach(([v, label], i) => {
    ctx.textAlign = i === 0 ? 'left' : i === xTicks.length - 1 ? 'right' : 'center';
    ctx.fillText(label, box.x(v), box.b + 5);
  });
}
function compact(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + 'k';
  return String(n);
}
function stepTicks(maxS) { return [[0, '0'], [maxS / 2, compact(Math.round(maxS / 2))], [maxS, compact(maxS)]]; }

function drawAlive() {
  const { ctx, w, h } = prepChart($('chAlive'));
  const maxS = Math.max(step, 10), L = Math.log10(K);
  const box = { l: 44, r: w - 8, t: 8, b: h - 22 };
  box.x = s => box.l + (s / maxS) * (box.r - box.l);
  box.y = v => box.b - (Math.log10(Math.max(v, 1)) / L) * (box.b - box.t);
  axes(ctx, box, [[1, '1'], [10, '10'], [100, '100'], [1000, '1000']], stepTicks(maxS));
  const pts = history.map(p => [p.s, p.a]).concat([[step, alive]]);
  ctx.beginPath();
  pts.forEach(([s, a], i) => i ? ctx.lineTo(box.x(s), box.y(a)) : ctx.moveTo(box.x(s), box.y(a)));
  ctx.lineTo(box.x(step), box.b); ctx.lineTo(box.x(0), box.b); ctx.closePath();
  ctx.fillStyle = tokens.soft; ctx.fill();
  ctx.beginPath();
  pts.forEach(([s, a], i) => i ? ctx.lineTo(box.x(s), box.y(a)) : ctx.moveTo(box.x(s), box.y(a)));
  ctx.strokeStyle = tokens.accent; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = tokens.accent;
  ctx.beginPath(); ctx.arc(box.x(step), box.y(alive), 3.5, 0, 6.2832); ctx.fill();
  ctx.fillStyle = tokens.ink; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
  ctx.fillText(`${fmt(alive)}姓`, box.r, box.y(alive) - 6 < box.t + 14 ? box.y(alive) + 20 : box.y(alive) - 6);
}

function drawShare(ranked) {
  const { ctx, w, h } = prepChart($('chShare'));
  const maxS = Math.max(step, 10);
  const box = { l: 44, r: w - 8, t: 8, b: h - 22 };
  box.x = s => box.l + (s / maxS) * (box.r - box.l);
  const top = ranked.slice(0, 6);
  const pts = history.map(p => [p.s, p.c]).concat([[step, counts]]);
  const cum = pts.map(() => 0);
  let peak = 0;
  pts.forEach(([, c]) => { let s = 0; for (const k of top) s += c[k]; peak = Math.max(peak, s / N); });
  const ymax = Math.min(1, Math.ceil(peak * 1.15 * 10) / 10);
  box.y = v => box.b - (v / ymax) * (box.b - box.t);
  const lastBand = [];
  top.forEach(k => {
    const lower = cum.slice();
    pts.forEach(([, c], i) => cum[i] += c[k] / N);
    ctx.beginPath();
    pts.forEach(([s], i) => i ? ctx.lineTo(box.x(s), box.y(cum[i])) : ctx.moveTo(box.x(s), box.y(cum[i])));
    for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(box.x(pts[i][0]), box.y(lower[i]));
    ctx.closePath();
    ctx.fillStyle = colors[k]; ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1;
    lastBand.push([k, lower[lower.length - 1], cum[cum.length - 1]]);
  });
  const pct = v => Math.round(v * 100) + '%';
  axes(ctx, box, [[0, '0%'], [ymax / 2, pct(ymax / 2)], [ymax, pct(ymax)]], stepTicks(maxS));
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  ctx.font = `700 14px ${getComputedStyle(document.body).getPropertyValue('--font-display')}`;
  for (const [k, lo, hi] of lastBand) {
    if (box.y(lo) - box.y(hi) < 15) continue;
    ctx.fillStyle = tokens.panel;
    ctx.fillText(NAMES[k], box.r - 5, (box.y(lo) + box.y(hi)) / 2);
  }
}

function drawZipf(ranked) {
  const { ctx, w, h } = prepChart($('chZipf'));
  const box = { l: 44, r: w - 8, t: 8, b: h - 22 };
  const LX = Math.log10(K), LY = Math.log10(N);
  box.x = rk => box.l + (Math.log10(rk) / LX) * (box.r - box.l);
  box.y = v => box.b - (Math.log10(Math.max(v, 1)) / LY) * (box.b - box.t);
  axes(ctx, box, [[1, '1'], [10, '10'], [100, '100'], [1000, '1000']], [[1, '1位'], [10, '10'], [100, '100'], [1000, '1000位']]);
  ctx.setLineDash([4, 4]); ctx.strokeStyle = tokens.muted; ctx.lineWidth = 1.5;
  ctx.beginPath();
  INIT.forEach((v, i) => i ? ctx.lineTo(box.x(i + 1), box.y(v)) : ctx.moveTo(box.x(1), box.y(v)));
  ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = tokens.accent; ctx.lineWidth = 2;
  ctx.beginPath();
  ranked.forEach((k, i) => i ? ctx.lineTo(box.x(i + 1), box.y(counts[k])) : ctx.moveTo(box.x(1), box.y(counts[k])));
  ctx.stroke();
  ranked.slice(0, 3).forEach((k, i) => {
    ctx.fillStyle = colors[k];
    ctx.beginPath(); ctx.arc(box.x(i + 1), box.y(counts[k]), 4.5, 0, 6.2832); ctx.fill();
  });
  const k0 = ranked[0];
  ctx.fillStyle = tokens.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.font = `700 14px ${getComputedStyle(document.body).getPropertyValue('--font-display')}`;
  ctx.fillText(`${NAMES[k0]} ${fmt(counts[k0])}`, box.x(1) + 10, Math.max(box.t + 8, box.y(counts[k0])));
}

/* ---------- side panel ---------- */
function updateTicker() {
  const t = $('ticker');
  $('extCount').textContent = `消えた苗字 ${fmt(K - alive)}`;
  if (!events.length) { t.innerHTML = '<li class="empty">まだ何も起きていません</li>'; return; }
  t.innerHTML = events.slice(0, 14).map(ev => {
    if (ev.type === 'lead') return `<li><span class="st">${fmt(ev.step)}</span><span><span class="lead">首位交代</span> <span class="nm">${NAMES[ev.prev]}</span> → <span class="nm">${NAMES[ev.k]}</span></span></li>`;
    return `<li><span class="st">${fmt(ev.step)}</span><span><span class="nm">${NAMES[ev.k]}</span> が消えた<span class="sub">初期${ev.k + 1}位・${INIT[ev.k]}人／最後は${NAMES[ev.by]}に／残り${fmt(ev.alive)}姓</span></span></li>`;
  }).join('');
}

function updateTrack(ranked) {
  const gone = $('gone');
  gone.hidden = !(tracked >= 0 && counts[tracked] === 0);
  if (!gone.hidden) gone.innerHTML = `<div class="big">${NAMES[tracked]}は姿を消した</div><div class="sub">ステップ ${fmt(extinctAt[tracked])}・初期 ${tracked + 1}位 ${INIT[tracked]}人</div>`;
  const panel = $('trackPanel');
  panel.hidden = tracked < 0;
  $('clearTrack').hidden = tracked < 0;
  if (tracked < 0) return;
  const k = tracked, c = counts[k];
  const card = $('trackCard');
  if (c === 0) {
    card.innerHTML = `<span class="nm">${NAMES[k]}</span>ステップ <span class="num">${fmt(extinctAt[k])}</span> で消滅（初期 ${k + 1}位・${INIT[k]}人）`;
  } else {
    const rk = ranked.indexOf(k) + 1;
    card.innerHTML = `<span class="nm">${NAMES[k]}</span>いま <span class="num">${fmt(c)}</span>人・<span class="num">${rk}</span>位（初期 ${k + 1}位・${INIT[k]}人）`;
  }
}

function updateUI(force) {
  readTokens();
  maybeRecolor();
  const ranked = rankedIndices();
  const lead = ranked[0];
  if (!force && lead !== lastLeader) { pushEvent({ type: 'lead', k: lead, prev: lastLeader, step }); }
  lastLeader = lead;
  $('stStep').textContent = fmt(step);
  $('stConv').textContent = fmt(conv);
  $('stAlive').innerHTML = `${fmt(alive)} <small>/ ${fmt(K)}</small>`;
  $('stLead').innerHTML = `${NAMES[lead]} <small>${(counts[lead] / N * 100).toFixed(1)}%</small>`;
  if (force || ++uiTick % 2 === 0) updateRace(ranked);
  drawAlive(); drawShare(ranked); drawZipf(ranked);
  updateTicker();
  updateTrack(ranked);
}

function finish() {
  finished = true;
  setRunning(false);
  const k = rankedIndices()[0];
  const b = $('banner');
  b.innerHTML = `<div class="big">全員「${NAMES[k]}」</div><div>ステップ ${fmt(step)} で ${fmt(N)}人がひとつの苗字にそろいました（${NAMES[k]}の初期人数は${INIT[k]}人）</div>`;
  b.hidden = false;
}

/* ---------- controls ---------- */
function setRunning(v) { running = v; $('play').textContent = v ? '一時停止' : '再開'; }
$('play').addEventListener('click', () => { if (finished) reset(); else setRunning(!running); });
$('reset').addEventListener('click', reset);
$('speed').addEventListener('input', e => { spf = SPEEDS[+e.target.value]; $('speedOut').textContent = spf === SPEEDS[SPEEDS.length - 1] ? '最速' : '×' + spf; });
function setTracked(k) {
  tracked = k;
  if (k >= 0) $('track').value = NAMES[k];
  updateUI(true);
}
$('track').addEventListener('input', e => { const k = NAMES.indexOf(e.target.value.trim()); if (k >= 0) setTracked(k); });
$('clearTrack').addEventListener('click', () => { $('track').value = ''; setTracked(-1); });

/* ---------- loop ---------- */
let lastUi = 0, uiTick = 0;
function frame(now) {
  if (running) {
    const t0 = performance.now();
    stepDebt = Math.min(stepDebt + spf, spf + 1);
    for (; stepDebt >= 1; stepDebt--) {
      stepOnce();
      if (step % histEvery === 0) recordHistory();
      if (alive === 1) { recordHistory(); finish(); break; }
      if (performance.now() - t0 > 14) break;
    }
  }
  for (const g of rings) g.age++;
  rings = rings.filter(g => g.age < (g.big ? 70 : 28));
  drawField();
  if (now - lastUi > 250) { lastUi = now; updateUI(false); }
  requestAnimationFrame(frame);
}

readTokens();
sizeField();
reset();
requestAnimationFrame(frame);
