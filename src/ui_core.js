'use strict';
/* ===== UI core: HUD, panels, selection, orders ===== */
window.SEL = { units: new Set(), prov: -1, sea: -1 };
const UI = { modal: null, tab: {}, mode: null, newsSeen: 0, toastN: 0, last: 0, fog: true, sound: true, dc: -1, mapMode: 'political', unseen: 0, res: 'cash', hoverTip: null };
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---- sound ---- */
const Snd = {
  ctx: null,
  play(k) {
    if (!UI.sound) return;
    try {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const c = this.ctx, t = c.currentTime; const o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination);
      const S = { calm1: [130.81, 'sine', 0.025, 2.6], calm2: [164.81, 'sine', 0.02, 2.6], calm3: [196, 'sine', 0.02, 2.6], click: [520, 'square', 0.04, 0.06], ok: [660, 'triangle', 0.08, 0.12], alert: [330, 'sawtooth', 0.07, 0.25], war: [110, 'sawtooth', 0.15, 0.6], boom: [70, 'sawtooth', 0.07, 0.35], nuke: [40, 'sawtooth', 0.3, 2.2], err: [180, 'square', 0.05, 0.15] }[k]; if (!S) return;
      o.type = S[1]; o.frequency.setValueAtTime(S[0], t); if (k === 'boom' || k === 'nuke') o.frequency.exponentialRampToValueAtTime(20, t + S[3]); if (k === 'ok') o.frequency.setValueAtTime(880, t + 0.06);
      g.gain.setValueAtTime(S[2] * (typeof PREF === 'undefined' ? 0.6 : PREF.volume), t); g.gain.exponentialRampToValueAtTime(0.0001, t + S[3]); o.start(t); o.stop(t + S[3]);
    } catch (e) { }
  }
};
window.Snd = Snd;

/* ---- time ---- */
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
function dateStr(h) { const d = new Date(Date.UTC(2026, 0, 1) + h * 3600e3); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; }
function timeStr(h) { return String(h % 24).padStart(2, '0') + ':00'; }
const TICK_MS = [0, 480, 220, 90, 40, 16];

/* ---- tooltip ---- */
function showTip(html, x, y) {
  const t = $('tooltip'); t.innerHTML = html; t.classList.remove('hidden');
  const w = t.offsetWidth, h = t.offsetHeight;
  t.style.left = Math.min(window.innerWidth - w - 6, x + 14) + 'px'; t.style.top = Math.min(window.innerHeight - h - 6, y + 16) + 'px';
}
function hideTip() { $('tooltip').classList.add('hidden'); }
document.addEventListener('mouseover', e => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el) { UI.hoverTip = el; showTip(el.dataset.tip, e.clientX, e.clientY); } });
document.addEventListener('mousemove', e => { if (UI.hoverTip && UI.hoverTip.isConnected) { showTip(UI.hoverTip.dataset.tip, e.clientX, e.clientY); } });
document.addEventListener('mouseout', e => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el) { UI.hoverTip = null; hideTip(); } });

/* ---- helpers ---- */
function costHTML(cost, c, mult) {
  let s = '<span class="costs">';
  for (const k in cost) { const r = RES_SHORT[k]; const v = Math.round(cost[k] * (mult || 1)); const ok = G.C[c].res[r] >= v; s += `<i class="${ok ? '' : 'no'}">${RES_INFO[r].i}${fmt(v)}</i>`; }
  return s + '</span>';
}
function costText(cost) { return Object.keys(cost).map(k => RES_INFO[RES_SHORT[k]].i + ' ' + RES_INFO[RES_SHORT[k]].n + ': ' + Math.round(cost[k])).join('<br>'); }
function stars(n, max) { let s = ''; for (let i = 0; i < max; i++) s += i < n ? '★' : '<s>★</s>'; return `<span class="stars">${s}</span>`; }
function toast(text, cls, loc) {
  const el = document.createElement('div'); el.className = 'toast ' + (cls || ''); el.textContent = text;
  if (loc !== undefined && loc >= 0) el.onclick = () => { focusLoc(loc); el.remove(); };
  const box = $('toasts'); box.appendChild(el); while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => el.remove(), 5200);
}
function focusLoc(l, z) { if (l < 0) return; centerOn(lx(l), ly(l), z || 3.2); }

/* ---- selection ---- */
function selectProv(p) { SEL.prov = p; SEL.sea = -1; renderProvPanel(true); }
function selectSea(s) { SEL.sea = s; SEL.prov = -1; renderProvPanel(true); }
function clearSel() { SEL.units.clear(); SEL.prov = -1; SEL.sea = -1; setMode(null); $('prov-panel').classList.add('hidden'); renderUnitPanel(); MV.dirty = true; }
function selectUnits(ids, add) {
  if (!add) SEL.units.clear();
  for (const id of ids) { const u = G.U.get(id); if (u && u.o === G.player) SEL.units.add(id); }
  renderUnitPanel(); MV.dirty = true;
}
function setMode(m) {
  UI.mode = m; MV.orderMode = m; $('map').classList.toggle('order', !!m);
  const h = $('order-hint');
  if (m) { h.textContent = { move: 'Выберите пункт назначения', rebase: 'Выберите аэродром для перебазирования', strike: 'Выберите цель для удара', patrol: 'Выберите зону патрулирования', fire: 'Выберите цель для ракетного удара' }[m] + ' (Esc — отмена)'; h.classList.remove('hidden'); } else h.classList.add('hidden');
  MV.dirty = true;
}

/* ---- orders ---- */
function hitLoc(hit) { return hit.k === 'p' ? hit.id : P + hit.id; }
function hostileLoc(loc) {
  if (loc < P && G.war[G.player * NC + G.pv[loc].o]) return true;
  for (const id of G.at[loc]) { const u = G.U.get(id); if (u && G.war[G.player * NC + u.o] && isVisible(u)) return true; }
  return false;
}
function issueOrder(hit, mode, append) {
  if (G.opts.observer) { toast('Наблюдатель не отдаёт приказы', 'war'); return; }
  const ids = [...SEL.units].filter(id => G.U.has(id)); if (!ids.length) return;
  const land = [], sea = [], air = [], msl = [];
  for (const id of ids) { const u = G.U.get(id); const d = UNITS[u.t].dom; (d === 'land' ? land : d === 'sea' ? sea : d === 'air' ? air : msl).push(id); }
  const loc = hitLoc(hit); let msgs = [];
  if (append && !mode) {
    let n = 0;
    for (const id of land.concat(sea)) { const u = G.U.get(id); const last = u.waypoints?.at(-1) ?? u.path.at(-1) ?? u.loc; const path = findPath(u, last, loc); if (path) { if (u.st === 'move') { u.waypoints = u.waypoints || []; u.waypoints.push(loc); } else orderMove([id], loc); n++; } }
    toast(`Добавлено точек маршрута: ${n}`, n ? 'good' : 'war'); MV.dirty = true; return;
  }
  if (land.length && (!mode || mode === 'move')) {
    if (hit.k === 'p') { const r = orderMove(land, loc); if (r.n) msgs.push(`${r.n} сухопутных → ${PROV[loc].name}`); if (r.fail) msgs.push(`${r.fail} не могут добраться (нужна война/доступ или нет сухопутного пути)`); }
    else msgs.push('Сухопутные войска не могут идти по морю — используйте транспорт');
  }
  if (sea.length && (!mode || mode === 'move')) {
    let dest = loc; if (hit.k === 'p' && !isCoastal(loc)) dest = -1;
    if (dest < 0) msgs.push('Корабли не могут зайти вглубь суши'); else { const r = orderMove(sea, dest); if (r.n) msgs.push(`${r.n} кораблей → ${locName(dest)}`); if (r.fail) msgs.push(`${r.fail} кораблей: нет маршрута`); }
  }
  if (air.length && (!mode || mode === 'strike' || mode === 'patrol' || mode === 'move' || mode === 'rebase')) {
    const friendlyBase = loc < P && G.pv[loc].b.airfield > 0 && (G.pv[loc].o === G.player || areAllied(G.pv[loc].o, G.player)) && !hostileLoc(loc);
    const m = mode === 'rebase' ? 'rebase' : mode === 'patrol' ? 'patrol' : mode === 'strike' ? 'strike' : (hostileLoc(loc) ? 'strike' : (friendlyBase ? 'rebase' : 'patrol'));
    const r = orderAir(air, loc, m);
    if (r.n) msgs.push(`${r.n} самолётов: ${m === 'strike' ? 'удар' : m === 'rebase' ? 'перебазирование' : 'патруль'} → ${locName(loc)}`);
    if (r.fails.length) msgs.push(r.fails.includes('range') ? 'Цель вне радиуса действия' : r.fails.includes('nowar') ? 'Удар возможен только по стране, с которой вы воюете' : 'База повреждена');
  }
  if (msl.length && (!mode || mode === 'fire' || mode === 'strike' || mode === 'move')) {
    const n = fireMissile(msl, loc);
    msgs.push(n ? `Пуск ракет: ${n} → ${locName(loc)}` : (loc < P && !G.war[G.player * NC + G.pv[loc].o] ? 'Пуск невозможен: нет войны с владельцем провинции' : 'Пуск невозможен: цель вне дальности'));
  }
  if (msgs.length) toast(msgs.join('. '), 'good'); Snd.play('ok');
  setMode(null); renderUnitPanel(); MV.dirty = true;
}

function wireMap() {
  MV.sel = SEL;
  MV.onClick = (x, y, e) => {
    if (!G) { startMapClick(x, y); return; }
    const ch = chipAt(x, y);
    if (UI.mode) { const [wx, wy] = s2w(x, y); const hit = ch ? { k: ch.loc < P ? 'p' : 's', id: ch.loc < P ? ch.loc : ch.loc - P } : pickAt(wx, wy); if (hit) issueOrder(hit, UI.mode); return; }
    if (ch) {
      Snd.play('click');
      if (ch.o === G.player) { selectUnits(ch.ids, e && e.shiftKey); if (ch.loc < P) selectProv(ch.loc); else selectSea(ch.loc - P); }
      else { if (ch.loc < P) selectProv(ch.loc); else selectSea(ch.loc - P); }
      return;
    }
    const [wx, wy] = s2w(x, y); const hit = pickAt(wx, wy, e?.changedTouches ? 12 / MV.cam.z : 0);
    if (!hit) { clearSel(); return; }
    Snd.play('click');
    if (!(e && e.shiftKey)) SEL.units.clear();
    if (hit.k === 'p') selectProv(hit.id); else selectSea(hit.id);
    renderUnitPanel(); MV.dirty = true;
  };
  MV.onRight = (x, y, e) => {
    if (!G) return;
    const [wx, wy] = s2w(x, y); const hit = pickAt(wx, wy); if (!hit) return;
    if (SEL.units.size) issueOrder(hit, null, e && e.shiftKey);
  };
  MV.onBox = (b, e) => {
    if (!G) return;
    const x0 = Math.min(b.x0, b.x1), x1 = Math.max(b.x0, b.x1), y0 = Math.min(b.y0, b.y1), y1 = Math.max(b.y0, b.y1);
    const ids = []; for (const c of MV.chips) { if (c.x + c.w > x0 && c.x < x1 && c.y + c.h > y0 && c.y < y1 && c.g.o === G.player) ids.push(...c.g.ids); }
    selectUnits(ids, false);
  };
  MV.onDbl = (x, y) => { if (!G) return; const ch = chipAt(x, y); if (ch && ch.o === G.player) { const all = []; for (const c of MV.chips) if (c.g.o === G.player && c.g.dom === ch.dom) all.push(...c.g.ids); selectUnits(all, false); } };
  MV.onHover = (h, x, y) => {
    MV.preview = null;
    if (G && h && SEL.units.size) {
      const loc = h.k === 'p' ? h.id : P + h.id;
      for (const id of SEL.units) { const u = G.U.get(id); if (!u) continue; const d = UNITS[u.t].dom; if (d === 'land' && h.k === 'p' || d === 'sea') { if (d === 'sea' && h.k === 'p' && !isCoastal(loc)) break; const path = findPath(u, u.loc, loc); if (path && path.length) MV.preview = { from: u.loc, path, dom: d }; break; } }
    }
    if (!G) { if (h && h.k === 'p') { showTip(`<b>${esc(CTY[PROV[h.id].c].n)}</b><br>${esc(PROV[h.id].name)}`, x + 8, y + 8); } else hideTip(); return; }
    if (h && h.k === 'p' && !UI.hoverTip) {
      const p = PROV[h.id], pv = G.pv[h.id], o = G.C[pv.o];
      let s = `<div style="display:flex;gap:6px;align-items:center">${flagImg(pv.o)}<b>${esc(p.name)}</b></div><div style="color:#8fa6bd">${esc(o.n)} · ${TERRAIN[p.terr].n} · ${fmtPop(pv.pop)}</div>`;
      const un = {}; for (const id of G.at[h.id]) { const u = G.U.get(id); if (u && isVisible(u) && u.st !== 'cargo') { const k = G.C[u.o].n; un[k] = (un[k] || 0) + 1; } }
      for (const k in un) s += `<div>🪖 ${esc(k)}: ${un[k]}</div>`;
      MV.tipP = h.id; showTip(s, x + 8, y + 8);
    } else if (h && h.k === 's') { showTip(`<b>${esc(SEA[h.id].name)}</b><div style="color:#8fa6bd">Морская зона</div>`, x + 8, y + 8); }
    else if (!UI.hoverTip) hideTip();
  };
  MV.onChip = (g, x, y) => {
    const by = {}; let hp = 0, mor = 0;
    for (const id of g.ids) { const u = G.U.get(id); if (!u) continue; (by[u.t] = by[u.t] || []).push(u); hp += u.hp; mor += u.mor; }
    const n = g.ids.length || 1;
    let s = `<div style="display:flex;gap:6px;align-items:center">${flagImg(g.o)}<b>${esc(G.C[g.o].n)}</b></div><div style="color:#8fa6bd">${esc(locName(g.loc))}</div>`;
    for (const t in by) s += `<div>${unitIcon(t, '#fff', 16)} ${UNITS[t].n} ×${by[t].length} <span style="color:#8fa6bd">(пок. ${GEN_NAMES[by[t][0].g]})</span></div>`;
    s += `<div style="color:#8fa6bd">Прочность ${Math.round(hp / n)}% · Мораль ${Math.round(mor / n)}%</div>`;
    if (g.o === G.player) s += `<div style="color:#8fa6bd;font-size:11px">Клик — выбрать, ПКМ по карте — приказ</div>`;
    showTip(s, x + 12, y + 12);
  };
  MV.onKey = campaignKey;
  MV.onKeyDownGlobal = true;
}
function startMapClick(x, y) { const [wx, wy] = s2w(x, y); const hit = pickAt(wx, wy); if (hit && hit.k === 'p') { const ci = PROV[hit.id].c; if (window.startSelect) window.startSelect(ci); } }

function togglePause() { G.paused = !G.paused; if (!G.paused && G.speed < 1) G.speed = 1; updateSpeedBtns(); }
function setSpeed(v) { G.speed = v; G.paused = false; updateSpeedBtns(); }
function updateSpeedBtns() {
  document.querySelectorAll('#tb-speed button').forEach(b => { const v = +b.dataset.v; b.classList.toggle('on', v === 0 ? G.paused : (!G.paused && G.speed === v)); });
}

/* ---- HUD build ---- */
const LEFT = [['overview', '🌍', 'Обзор'], ['army', '🎖', 'Армия'], ['research', '🔬', 'Наука'], ['diplomacy', '🤝', 'Дипл.'], ['market', '💱', 'Рынок'], ['events', '📰', 'События'], ['help', '❓', 'Справка']];
const MODES = [['political', '🏳', 'Политическая'], ['terrain', '⛰', 'Рельеф'], ['relations', '🤝', 'Отношения'], ['bloc', '🛡', 'Альянсы'], ['pop', '👥', 'Население'], ['power', '💥', 'Военная мощь'], ['res:fuel', '⛽', 'Нефть'], ['res:comp', '🔩', 'Металлы'], ['res:food', '🌾', 'Еда'], ['res:rare', '💎', 'Редкие'], ['res:supp', '🏭', 'Промышленность'], ['res:elec', '💻', 'Электроника']];
function buildHUD() {
  $('leftbar').innerHTML = LEFT.map(([m, i, t]) => `<button data-act="modal" data-m="${m}" data-tip="${t}" id="lb-${m}">${i}<span>${t}</span></button>`).join('');
  $('tb-speed').innerHTML = `<button data-act="speed" data-v="0" data-tip="Пауза (Пробел)">⏸</button>` + [1, 2, 3, 4, 5].map(v => `<button data-act="speed" data-v="${v}" data-tip="Скорость ${v} (клавиша ${v})">${v === 1 ? '▶' : v + '×'}</button>`).join('');
  $('tb-right').innerHTML = `<button class="ibtn" data-act="modal" data-m="events" data-tip="Сообщения" id="bellb">🔔<span class="badge hidden" id="bell"></span></button><button class="ibtn" data-act="modal" data-m="menu" data-tip="Меню">☰</button>`;
  $('mapmodes').innerHTML = MODES.slice(0, 8).map(([m, i, t]) => `<button data-act="mapmode" data-m="${m}" data-tip="Слой: ${t}">${i}</button>`).join('') + `<button data-act="mapmodes" data-tip="Все слои карты">⋯</button>`;
  $('mini-wrap').style.display = 'block';
  updateSpeedBtns(); updateModeBtns(); campaignToolbar();
}
const LEGENDS = {
  political: [['#5b8def', 'Цвет — государство'], ['rgba(255,255,255,.5)', 'Полосы — оккупированная провинция']],
  terrain: Object.values(TERRAIN).map(t => [rgb2css(...t.col), t.n]),
  relations: [['#2f7fd8', 'Вы'], ['#2faa6a', 'Союзник'], ['#6fae8a', 'Друг (>25)'], ['#a08a6a', 'Нейтрал'], ['#b5654a', 'Враждебен'], ['#c0392b', 'Война']],
  bloc: [['#4a5360', 'Вне альянса'], ['#3a7bd5', 'Цвет — альянс']],
  pop: [['grad:rgb(40,60,80),rgb(240,150,60)', 'Население: меньше → больше']],
  power: [['grad:rgb(50,70,90),rgb(220,80,70)', 'Военная мощь: меньше → больше']],
};
for (const [k, c1] of [['fuel', '225,120,60'], ['comp', '170,190,210'], ['food', '230,195,80'], ['rare', '200,120,230'], ['supp', '210,170,110'], ['elec', '90,200,235']]) LEGENDS['res:' + k] = [[`grad:rgb(40,55,70),rgb(${c1})`, 'Добыча: 0 → 5 уровень']];
function updateLegend() {
  const el = $('legend'); const L = LEGENDS[MV.mode]; const name = (MODES.find(m => m[0] === MV.mode) || [0, 0, ''])[2];
  if (!L || MV.mode === 'political') { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  el.innerHTML = `<b>${name}</b>` + L.map(([c, t]) => c.startsWith('grad:') ? `<div class="grad" style="background:linear-gradient(90deg,${c.slice(5)})"></div><div class="note">${t}</div>` : `<div class="lg"><i style="background:${c}"></i>${t}</div>`).join('');
}
function updateModeBtns() { updateLegend(); document.querySelectorAll('#mapmodes button[data-m]').forEach(b => b.classList.toggle('on', b.dataset.m === MV.mode)); }

function refreshHUD(force) {
  if (!G) return;
  const C = G.C[G.player];
  $('tb-country').innerHTML = `${flagImg(G.player, 'lg')}<div><b>${esc(C.n)}</b><small>${C.alliance >= 0 ? esc(G.al[C.alliance].n) : 'Без альянса'} · ★ ${C.vp}</small></div>`;
  $('tb-time').innerHTML = `<b>${dateStr(G.hour)}</b><br><small>${timeStr(G.hour)} · ${G.paused ? 'ПАУЗА' : 'x' + G.speed}</small>`;
  let h = '';
  for (const k of [...RES, 'man']) {
    const inc = k === 'man' ? C.manCap * 0.06 : (C.inc[k] || 0), use = k === 'man' ? 0 : (C.use[k] || 0), net = inc - use;
    const cap = k === 'man' ? ' / ' + fmt(C.manCap) : '';
    const tip = `<b>${RES_INFO[k].n}</b><br>Доход: +${fmt(inc)}/сут<br>Расход: −${fmt(use)}/сут<br>Баланс: ${net >= 0 ? '+' : ''}${fmt(net)}/сут${k === 'man' ? '<br>Максимум: ' + fmt(C.manCap) : ''}${C.short[k] ? '<br><span style="color:#e0503c">ДЕФИЦИТ! Войска теряют боеспособность</span>' : ''}`;
    h += `<div class="rchip ${C.short[k] ? 'low' : ''}" data-act="modal" data-m="market" data-tip='${tip.replace(/'/g, '&#39;')}'><span style="font-size:16px">${RES_INFO[k].i}</span><div><div class="v">${fmt(C.res[k])}${cap ? '<small style="font-weight:400;color:#8fa6bd">' + cap + '</small>' : ''}</div><div class="d ${net >= 0 ? 'pos' : 'neg'}">${net >= 0 ? '+' : ''}${fmt(net)}</div></div></div>`;
  }
  $('tb-res').innerHTML = h;
  // news -> toasts / ticker / badge
  let latest = null;
  for (const n of G.news) {
    if (n.id <= UI.newsSeen) continue;
    UI.newsSeen = n.id;

    if (n.f === 'p' || n.f === 'g') {
      latest = n;
      if (n.f === 'p' || n.t === 'war' || n.t === 'nuke') {
        if (n.t !== 'unit' && n.t !== 'build' || G.speed <= 2) toast(n.x, n.t === 'goal' ? 'good' : n.t === 'war' || n.t === 'nuke' || n.t === 'loss' ? (n.t === 'nuke' ? 'nuke' : 'war') : (n.t === 'capture' && n.c[0] === G.player) || n.t === 'research' ? 'good' : '', n.l);
        if (n.t === 'war') Snd.play('war'); else if (n.t === 'capture' || n.t === 'loss') Snd.play('alert'); else if (n.t === 'unit' || n.t === 'build' || n.t === 'research') Snd.play('ok');
        if (!UI.modal || UI.modal !== 'events') { UI.unseen++; }
      }
      if (n.t === 'attack' && n.f === 'p' && UI.autoPause !== false && n.h - (UI._apH || -99) > 12) { UI._apH = n.h; G.paused = true; updateSpeedBtns(); toast('⏸ Автопауза: на вас напали! Отдайте приказы и нажмите ▶', 'war', n.l); }
      if (n.t === 'capture' || n.t === 'elim') miniDirty = true;
    }
  }
  if (latest) { $('ticker').textContent = `${dateStr(latest.h)} ${timeStr(latest.h)} — ${latest.x}`; $('ticker').dataset.l = latest.l; }
  const bell = $('bell'); if (UI.unseen > 0) { bell.textContent = UI.unseen > 99 ? '99+' : UI.unseen; bell.classList.remove('hidden'); } else bell.classList.add('hidden');
  if (UI.modal === 'events') { UI.unseen = 0; bell.classList.add('hidden'); }
  { const done = G.goalsDone || []; const todo = GOALS.filter(g => !done.includes(g.id)).slice(0, 3);
    const gp = $('goals'); const html = `<h5><span>🎯 Цели ${done.length}/${GOALS.length}</span><span>${gp.classList.contains('min') ? '▸' : '▾'}</span></h5>` + (todo.length ? todo.map(g => `<div class="g">▫ ${g.t}</div>`).join('') : '<div class="g">Все цели выполнены! 🏆</div>') + `<div class="note" style="margin-top:4px">Рейтинг: ${rankOf(G.player)}-е место, ${fmt(scoreOf(G.player))} очков</div><div class="note">★ Победа: ${G.myVP || 0} / ${Math.ceil(G.totalVP * G.opts.win)} ПО (${Math.round((G.myVP || 0) / G.totalVP * 100)}% из ${Math.round(G.opts.win * 100)}%)</div>`;
    if (UI._goalsH !== html) { gp.innerHTML = html; UI._goalsH = html; } }
  renderProvPanel(force); renderUnitPanel(force); updateTutorial(); campaignRefresh();
  if (UI.modal && (!document.activeElement || !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName))) renderModal(true);
}

/* ---- guided tutorial ---- */
function weakestNeighbor() {
  let best = -1, bp = 1e18; for (const o of neighborsOf(G.player)) { if (areAllied(o, G.player) || !G.C[o].alive) continue; const p = alliancePower(o); if (p < bp) { bp = p; best = o; } }
  return best >= 0 ? G.C[best].n : 'любого соседа';
}
const TUT = [
  { t: 'Добро пожаловать, командир! Нажмите <b>▶ (или Пробел)</b>, чтобы запустить время. Игра идёт в реальном времени: 1 секунда ≈ несколько игровых часов.', hl: '#tb-speed [data-v="2"]', ok: () => !G.paused },
  { t: 'Справа — панель вашей столицы. Постройте здание: нажмите любую светящуюся кнопку <b>«＋»</b> (например у «Казармы» или «Ресурсного комплекса»). Здания дают доход и открывают войска. <i>Одна стройка за раз.</i>', hl: '#prov-panel [data-act="build"]:not([disabled])', ok: C => (C.stats.built || 0) >= 1 },
  { t: 'Закажите войска: в блоке «Производство» нажмите на <b>«Пехота»</b>. Ресурсы спишутся сразу, юнит появится по готовности (полоса ниже).', hl: '#prov-panel [data-act="queue"][data-t="inf"]:not([disabled]), #prov-panel [data-act="queue"]:not([disabled])', ok: C => (C.stats.queued || 0) >= 1 },
  { t: 'Ждём юнита. Ускорьте время кнопками <b>2×–5×</b> вверху или нажмите <b>⏩</b> у заказа (платное ускорение).', hl: '#prov-panel [data-act="speedup"], #tb-speed [data-v="4"]', ok: C => (C.stats.trained || 0) >= 1 },
  { t: 'Выберите войска: кликните по <b>значку на карте</b> или нажмите «Выбрать все мои войска здесь» в панели провинции.', hl: '#prov-panel [data-act="selall"]', ok: () => SEL.units.size > 0 },
  { t: 'Отдайте приказ: нажмите <b>«Идти»</b> внизу и кликните по соседней провинции — или просто <b>правой кнопкой мыши</b> по ней (на телефоне — долгое нажатие).', hl: '#unit-panel [data-act="mode"][data-m="move"]', ok: C => (C.stats.moved || 0) >= 1 },
  { t: 'Откройте <b>🔬 Наука</b> и начните любое исследование — оно улучшит ваши войска и экономику.', hl: '#lb-research', ok: C => (C.stats.researched || 0) >= 1 },
  { t: 'Если красным мигает ресурс (🌾📦⛽) — не хватает. Игра <b>докупает дефицит сама</b>, а вручную можно в <b>💱 Рынке</b>. Откройте его — посмотрите цены.', hl: '#lb-market', ok: () => UI.seenMarket },
  { t: () => `Пора воевать! Откройте <b>🤝 Дипломатия</b>, выберите страну (например, <b>${weakestNeighbor()}</b>) и нажмите «Объявить войну» (дважды — для подтверждения). Сначала убедитесь, что армия достаточно крупная (окно «Армия»), и сосредоточьте её у границы.`, hl: '#lb-diplomacy', ok: C => (C.stats.wars || 0) >= 1 },
  { t: 'Война! Выберите войска и отправьте их в <b>провинцию врага</b> (ПКМ). Когда защитники уничтожены, идёт <b>захват</b> — удерживайте провинцию, пока полоса дойдёт до 100%. Вокруг ⚔ — идёт бой.', hl: '', ok: C => (C.stats.taken || 0) >= 1 },
  { t: 'Отлично! Вы захватили провинцию. Дальше ориентируйтесь на <b>🎯 Цели</b> слева и на ★ победные очки. Обучение закончено — удачи!', hl: '', ok: () => UI._tutEnd && Date.now() - UI._tutEnd > 7000, end: true }
];
function updateTutorial() {
  const el = $('tut');
  document.querySelectorAll('.tuthl').forEach(e => e.classList.remove('tuthl'));
  if (UI.tut === undefined || UI.tut < 0 || UI.tut >= TUT.length || UI.modal === 'tutorial') { el.classList.add('hidden'); return; }
  const C = G.C[G.player]; let st = TUT[UI.tut];
  if (st.end && !UI._tutEnd) UI._tutEnd = Date.now();
  while (UI.tut < TUT.length && TUT[UI.tut].ok(C)) { UI.tut++; UI._tutEnd = 0; Snd.play('ok'); if (UI.tut >= TUT.length) { el.classList.add('hidden'); return; } st = TUT[UI.tut]; if (st.end) UI._tutEnd = Date.now(); }
  const txt = typeof st.t === 'function' ? st.t() : st.t;
  const html = `<h5>🎓 Обучение · шаг ${UI.tut + 1} из ${TUT.length}</h5><p>${txt}</p><div class="row"><button class="btn sm" data-act="tutskip">Пропустить шаг ➜</button><button class="btn sm" data-act="tutoff">Выключить обучение</button></div>`;
  if (UI._tutH !== html) { el.innerHTML = html; UI._tutH = html; }
  el.classList.remove('hidden');
  if (st.hl) { const t = document.querySelector(st.hl); if (t) { t.classList.add('tuthl'); if (UI._tutScrolled !== UI.tut) { UI._tutScrolled = UI.tut; try { t.scrollIntoView({ block: 'nearest' }); } catch (e) { } } } }
}
/* ---- province panel ---- */
function unitsAt(loc) { const o = []; for (const id of G.at[loc]) { const u = G.U.get(id); if (u && u.st !== 'cargo' && isVisible(u)) o.push(u); } return o; }
function renderProvPanel(force) {
  const el = $('prov-panel');
  if (SEL.prov < 0 && SEL.sea < 0) { el.classList.add('hidden'); return; }
  if (!force && el.classList.contains('hidden')) return;
  if (!force && el.matches(':hover') && UI._pp && Date.now() - UI._pp < 1500) return;
  UI._pp = Date.now();
  const scrollTop = el.scrollTop;
  el.classList.remove('hidden');
  if (SEL.sea >= 0) { el.innerHTML = seaPanelHTML(SEL.sea); el.scrollTop = scrollTop; return; }
  const p = SEL.prov, pr = PROV[p], pv = G.pv[p], o = G.C[pv.o], me = pv.o === G.player;
  let h = `<div class="ph">${flagImg(pv.o, 'lg')}<h3>${esc(pr.name)}<small>${esc(o.n)}${G.C[pv.o].cap === p ? ' · ⭐ Столица' : ''} · ${TERRAIN[pr.terr].n}</small></h3>${pr.vp ? `<span data-tip="Победные очки: ${pr.vp}">${stars(pr.vp, 6)}</span>` : ''}<button class="x" data-act="closeprov">✕</button></div>`;
  // info
  const prod = {}; provProd(pv.o, p, Object.assign(prod, { cash: 0, food: 0, supp: 0, fuel: 0, comp: 0, elec: 0, rare: 0, pop: 0 }));
  h += `<div class="sec"><div class="grid2"><div class="kv"><span>Население</span><span>${fmtPop(pv.pop)}</span></div><div class="kv"><span>Рельеф</span><span>${TERRAIN[pr.terr].n} (×${TERRAIN[pr.terr].def})</span></div>`;
  h += `<div class="kv"><span>Повреждения</span><span>${Math.round(pv.dmg)}%</span></div><div class="kv"><span>Заражение</span><span>${Math.round(pv.fall * 100)}%</span></div></div>`;
  if (pv.cap) h += `<div class="note" style="margin-top:5px;color:#ff9a80">⚠ Захват: ${G.C[pv.cap.by].n} — ${Math.round(pv.cap.prog)}%</div>`;
  if (!me && SEL.units.size && G.war[G.player * NC + pv.o]) {
    let mine = 0, theirs = 0; for (const id of SEL.units) { const uu = G.U.get(id); if (uu && UNITS[uu.t].dom === 'land') mine += unitPower(uu); }
    for (const uu of unitsAt(p)) if (UNITS[uu.t].dom === 'land' && G.war[G.player * NC + uu.o]) theirs += unitPower(uu) * TERRAIN[pr.terr].def * (1 + 0.12 * pv.b.fort);
    h += !G.vis[p] && !G.fogOff ? '<div class="note">⚔ Состав защиты неизвестен: сначала разведайте провинцию.</div>' : `<div class="note" style="margin-top:6px">⚔ Ваша выбранная сила: <b>${Math.round(mine)}</b> · защита провинции: <b>${Math.round(theirs)}</b> ${theirs === 0 ? '— провинция не защищена, можно занимать' : mine > theirs * 1.3 ? '<span style="color:#5fd35f">— перевес, атакуйте</span>' : '<span style="color:#e0803c">— нужно больше войск (и держите их вместе)</span>'}</div>`;
  }
  if (G.bat.has(p) && G.hour - G.bat.get(p) <= 2) {
    const sides = {}; for (const u of unitsAt(p)) { const d = UNITS[u.t]; if (d.dom === 'msl' || (u.st === 'base' && d.dom === 'air')) continue; const s = sides[u.o] = sides[u.o] || { n: 0, hp: 0 }; s.n++; s.hp += u.hp; }
    h += `<div class="note" style="margin-top:6px;color:#ff9a80">⚔ Идёт бой: ${Object.keys(sides).map(o => `${esc(G.C[o].n)} — ${sides[o].n} юн. (${Math.round(sides[o].hp / sides[o].n)}%)`).join(' vs ')}</div>`;
  }
  if (me || areAllied(pv.o, G.player)) {
    h += `<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:6px">`;
    for (const k of RES) if (prod[k] > 0.4) h += `<span data-tip="${RES_INFO[k].n}: +${prod[k].toFixed(1)}/сут">${RES_INFO[k].i}${prod[k] >= 10 ? Math.round(prod[k]) : prod[k].toFixed(1)}</span>`;
    h += `</div>`;
  } else {
    h += `<div class="note" style="margin-top:5px">Отношения: ${Math.round(relOf(G.player, pv.o))}${G.war[G.player * NC + pv.o] ? ' · <b style="color:#e0503c">ВОЙНА</b>' : ''}</div>`;
    h += `<div style="margin-top:6px;display:flex;gap:5px;flex-wrap:wrap"><button class="btn sm" data-act="dipl" data-c="${pv.o}">🤝 Дипломатия</button>${!areAllied(G.player, pv.o) ? ['intel', 'sabotage', 'corrupt'].map(m => `<button class="btn sm" data-act="spy" data-p="${p}" data-m="${m}" data-tip="<b>${SPY[m].n}</b><br>${SPY[m].d}<br>💵${SPY[m].cost} · ${SPY[m].t} ч<br>Агентов: ${spiesOf(G.player).length}/${spyCap(G.player)}">${SPY[m].i} ${SPY[m].n}</button>`).join('') : ''}${G.war[G.player * NC + pv.o] ? `<button class="btn sm danger" data-act="cyber" data-p="${p}" data-tip="Кибератака: парализует производство и добычу на 36 ч<br>💻 40 электроники · нужна технология «Электроника»">💻 Кибератака</button>` : ''}</div>`;
  }
  h += `</div>`;
  { const my = G.spies.filter(s => s.o === G.player && s.loc === p); if (my.length) h += `<div class="note" style="margin-top:5px">🕵 Ваши агенты здесь: ${my.map(s => SPY[s.mission].i + (s.active ? '' : '…')).join(' ')}</div>`; if (me) h += `<div style="margin-top:5px"><button class="btn sm" data-act="spy" data-p="${p}" data-m="counter" data-tip="<b>Контрразведка</b><br>${SPY.counter.d}<br>💵${SPY.counter.cost}">🛡 Контрразведка</button></div>`; }
  // units here
  const us = unitsAt(p);
  if (us.length) {
    const grp = {}; for (const u of us) { const k = u.o + '|' + u.t; (grp[k] = grp[k] || []).push(u); }
    h += `<div class="sec"><h4>Войска в провинции (${us.length})</h4><div class="ulist">`;
    for (const k in grp) {
      const g = grp[k], u0 = g[0], hp = g.reduce((a, u) => a + u.hp, 0) / g.length; const mine = u0.o === G.player; const sel = mine && g.every(u => SEL.units.has(u.id));
      h += `<div class="uchip ${sel ? 'sel' : ''}" data-act="selunits" data-ids="${g.map(u => u.id).join(',')}" data-tip="<b>${UNITS[u0.t].n}</b> × ${g.length}<br>${esc(G.C[u0.o].n)} · пок. ${GEN_NAMES[u0.g]}<br>Прочность: ${Math.round(hp)}%">${unitIcon(u0.t, mine ? '#fff' : '#ff9a80', 20)} ${g.length > 1 ? '×' + g.length : ''}${flagImg(u0.o)}<span class="hp"><i style="width:${hp}%;background:${hp > 60 ? '#5fd35f' : hp > 30 ? '#e6c34a' : '#e0503c'}"></i></span></div>`;
    }
    h += `</div>`;
    if (us.some(u => u.o === G.player)) h += `<div style="margin-top:6px"><button class="btn sm" data-act="selall" data-p="${p}">Выбрать все наземные и морские</button> <button class="btn sm" data-act="selair" data-p="${p}">✈ Авиация</button></div>`;
    h += `</div>`;
  }
  // buildings
  h += `<div class="sec"><h4>Здания</h4><div class="bldgrid">`;
  for (const b of BLD_ORDER) {
    if (b === 'naval' && !isCoastal(p)) continue;
    const lvl = pv.b[b], d = BLD[b];
    if (b === 'silo' && lvl === 0 && !(G.C[pv.o].techs.rockets >= 2)) continue;
    const max = bldMax(pv.o, b);
    let pips = ''; for (let i = 0; i < d.max; i++) pips += `<i class="pip ${i < lvl ? 'on' : ''}"></i>`;
    let go = '';
    if (me) {
      const err = canBuild(p, b);
      const cost = bldCost(b, lvl + 1);
      go = lvl >= max ? '' : `<button class="btn sm go" data-act="build" data-p="${p}" data-b="${b}" ${err ? 'disabled' : ''} data-tip="${err ? esc(err) + '<br>' : ''}${lvl >= max ? '' : 'Улучшить до ур. ' + (lvl + 1) + '<br>' + costText(cost) + '<br>⏱ ' + Math.round(d.time * Math.pow(lvl + 1, 0.75)) + ' ч'}">＋</button>`;
    }
    const bq = pv.bq && pv.bq.b === b ? `<div class="bar"><i style="width:${Math.round((1 - pv.bq.left / pv.bq.total) * 100)}%"></i></div>` : '';
    h += `<div class="bld" data-tip="<b>${d.n}</b><br>${d.d}"><div class="t">${d.i} <span>${d.n.length > 14 ? d.n.slice(0, 13) + '…' : d.n}</span></div><div class="pips">${pips}</div>${bq}${go}</div>`;
  }
  h += `</div>`;
  if (me && pv.bq) h += `<div class="note" style="margin-top:5px">⏳ В провинции идёт одна стройка за раз — дождитесь или нажмите ⏩.</div>`;
  if (me && pv.bq) h += `<div class="q" style="margin-top:6px">🏗 ${BLD[pv.bq.b].n} → ур. ${pv.bq.lvl}<div class="bar"><i style="width:${Math.round((1 - pv.bq.left / pv.bq.total) * 100)}%"></i></div><span>${Math.ceil(pv.bq.left)} ч</span><button class="btn sm" data-act="speedup" data-k="build" data-p="${p}" data-tip="Ускорить за 💵${speedCost(p, 'build')}">⏩</button><button class="btn sm" data-act="cancelbuild" data-p="${p}">✕</button></div>`;
  h += `</div>`;
  // production
  if (me) {
    h += `<div class="sec"><h4>Производство</h4>`;
    const groups = [['land', 'Сухопутные'], ['air', 'Авиация'], ['sea', 'Флот'], ['msl', 'Ракеты']];
    for (const [dom, nm] of groups) {
      const list = UNIT_ORDER.filter(t => UNITS[t].dom === dom && pv.b[UNITS[t].req[0]] > 0 && (dom !== 'sea' || isCoastal(p)));
      if (!list.length) continue;
      h += `<div class="note" style="margin:4px 0 2px">${nm}</div><div class="ugrid">`;
      for (const t of list) {
        const d = UNITS[t], err = canQueue(p, t);
        const tip = `<b>${d.n}</b> (пок. ${GEN_NAMES[G.C[pv.o].gen[t]]})<br>${d.desc}<br>${costText(Object.fromEntries(Object.entries(d.cost).map(([k, v]) => [k, v * unitMult(pv.o)])))}<br>⏱ ${d.time} ч${err ? '<br><span style=\'color:#e0503c\'>' + esc(err) + '</span>' : ''}`;
        h += `<button class="ubtn" data-act="queue" data-p="${p}" data-t="${t}" ${err ? 'disabled' : ''} data-tip="${tip.replace(/"/g, '&quot;')}">${unitIcon(t, '#fff', 22)}<div>${d.n}<small>${costHTMLplain(d.cost, unitMult(pv.o))}</small></div></button>`;
      }
      h += `</div>`;
    }
    if (!UNIT_ORDER.some(t => pv.b[UNITS[t].req[0]] > 0)) h += `<div class="note">Постройте Казармы, Завод, Аэродром или Базу ВМФ, чтобы производить войска.</div>`;
    if (pv.q.length >= 5) h += `<div class="note" style="margin-top:5px">Очередь заполнена (5/5) — дождитесь выпуска.</div>`;
    if (pv.q.length) { h += `<div style="margin-top:6px">`; pv.q.forEach((it, i) => { h += `<div class="q">${unitIcon(it.t, '#fff', 18)}<span style="min-width:90px">${UNITS[it.t].n}</span><div class="bar"><i style="width:${Math.round((1 - it.left / it.total) * 100)}%"></i></div><span>${Math.ceil(it.left)}ч</span>${i === 0 ? `<button class="btn sm" data-act="speedup" data-k="q" data-p="${p}" data-tip="Ускорить за 💵${speedCost(p, 'q', 0)}">⏩</button>` : ''}<button class="btn sm" data-act="cx-queue" data-p="${p}" data-i="${i}" data-dir="-1" aria-label="Выше в очереди" ${i === 0 ? 'disabled' : ''}>↑</button><button class="btn sm" data-act="cx-queue" data-p="${p}" data-i="${i}" data-dir="1" aria-label="Ниже в очереди" ${i === pv.q.length - 1 ? 'disabled' : ''}>↓</button><button class="btn sm" data-act="cancelq" data-p="${p}" data-i="${i}">✕</button></div>`; }); h += `</div>`; }
    h += `</div>`;
  }
  h += provinceExtras(p);
  el.innerHTML = h; el.scrollTop = scrollTop;
}
function costHTMLplain(cost, m) { return Object.keys(cost).slice(0, 4).map(k => RES_INFO[RES_SHORT[k]].i + fmt(cost[k] * (m || 1))).join(' '); }
function seaPanelHTML(s) {
  const loc = P + s; const us = unitsAt(loc);
  let h = `<div class="ph"><h3>${esc(SEA[s].name)}<small>Морская зона · соседних: ${SEA[s].adj.length}</small></h3><button class="x" data-act="closeprov">✕</button></div><div class="sec"><div class="note">Прибрежные провинции: ${SEA[s].ports.slice(0, 12).map(p => esc(PROV[p].name)).join(', ')}${SEA[s].ports.length > 12 ? '…' : ''}</div></div>`;
  if (us.length) {
    const grp = {}; for (const u of us) { const k = u.o + '|' + u.t; (grp[k] = grp[k] || []).push(u); }
    h += `<div class="sec"><h4>Корабли и авиация (${us.length})</h4><div class="ulist">`;
    for (const k in grp) { const g = grp[k], u0 = g[0], mine = u0.o === G.player; const hp = g.reduce((a, u) => a + u.hp, 0) / g.length; h += `<div class="uchip ${mine && g.every(u => SEL.units.has(u.id)) ? 'sel' : ''}" data-act="selunits" data-ids="${g.map(u => u.id).join(',')}">${unitIcon(u0.t, mine ? '#fff' : '#ff9a80', 20)} ${g.length > 1 ? '×' + g.length : ''}${flagImg(u0.o)}<span class="hp"><i style="width:${hp}%;background:#5fd35f"></i></span></div>`; }
    h += `</div></div>`;
  }
  return h;
}

/* ---- unit panel ---- */
function renderUnitPanel(force) {
  const el = $('unit-panel');
  const ids = [...SEL.units].filter(id => G.U.has(id));
  document.body.classList.toggle('usel', ids.length > 0);
  if (!ids.length) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  const us = ids.map(id => G.U.get(id));
  const byT = {}; for (const u of us) (byT[u.t] = byT[u.t] || []).push(u);
  let h = `<div class="ph" style="position:static"><h3>Выбрано: ${us.length}<small>${locName(us[0].loc)}${us.some(u => u.loc !== us[0].loc) ? ' и др.' : ''}</small></h3><button class="x" data-act="desel">✕</button></div><div class="body">`;
  for (const t in byT) {
    const g = byT[t], hp = g.reduce((a, u) => a + u.hp, 0) / g.length, mor = g.reduce((a, u) => a + u.mor, 0) / g.length;
    const cargo = g.reduce((a, u) => a + u.cargo.length, 0);
    const st = g[0].st;
    h += `<div class="card" data-tip="<b>${UNITS[t].n}</b> пок. ${GEN_NAMES[g[0].g]}<br>Прочность ${Math.round(hp)}% · Мораль ${Math.round(mor)}%<br>${UNITS[t].desc}">${unitIcon(t, '#fff', 26)}<div><b>${UNITS[t].n}</b> ×${g.length}${cargo ? ' (груз ' + cargo + ')' : ''}<br><span class="hp" style="width:60px"><i style="width:${hp}%;background:${hp > 60 ? '#5fd35f' : hp > 30 ? '#e6c34a' : '#e0503c'}"></i></span> <small style="color:var(--tx2)">${stName(g)}</small></div></div>`;
  }
  h += `</div><div class="acts">`;
  const doms = new Set(us.map(u => UNITS[u.t].dom));
  const mv = doms.has('land') || doms.has('sea'), air = doms.has('air'), msl = doms.has('msl');
  if (mv) h += `<button class="btn ${UI.mode === 'move' ? 'pri' : ''}" data-act="mode" data-m="move" data-tip="Выберите цель на карте (или ПКМ) · R">➜ Идти</button><button class="btn" data-act="stop">⏹ Стоп</button>`;
  if (air) h += `<button class="btn ${UI.mode === 'strike' ? 'pri' : ''}" data-act="mode" data-m="strike" data-tip="Бомбардировка/атака цели · B">💥 Удар</button><button class="btn ${UI.mode === 'patrol' ? 'pri' : ''}" data-act="mode" data-m="patrol" data-tip="Патрулирование зоны · P">🛩 Патруль</button><button class="btn ${UI.mode === 'rebase' ? 'pri' : ''}" data-act="mode" data-m="rebase" data-tip="Перебазировать на другой аэродром">🛬 Перебазировать</button><button class="btn" data-act="recall">↩ Вернуть на базу</button>`;
  if (msl) h += `<button class="btn ${UI.mode === 'fire' ? 'pri' : ''} danger" data-act="mode" data-m="fire" data-tip="Выбрать цель пуска · F">🚀 Пуск</button>`;
  const hasTr = us.some(u => u.t === 'transport'), hasCar = us.some(u => u.t === 'carrier'), hasLand = us.some(u => UNITS[u.t].dom === 'land'), hasAir = us.some(u => UNITS[u.t].dom === 'air');
  if (hasTr) h += `<button class="btn" data-act="loadtr" data-tip="Загрузить сухопутные части из этой провинции на выбранные транспорты">📦 Грузить</button><button class="btn" data-act="unloadtr">⬇ Высадить</button>`;
  if (hasCar) h += `<button class="btn" data-act="loadcar" data-tip="Погрузить авиацию из порта на авианосец">✈ Принять авиацию</button>`;
  if (hasLand && !hasTr) h += `<button class="btn" data-act="boardtr" data-tip="Погрузиться на транспорт в этой провинции">🚢 На борт</button>`;
  const upg = us.filter(u => canUpgrade(u)); if (upg.length) { const tot = {}; for (const u of upg) { const cc = upgradeCost(u); for (const k in cc) tot[k] = (tot[k] || 0) + cc[k]; } h += `<button class="btn" data-act="upgrade" data-tip="Модернизировать ${upg.length} юн. до текущего поколения<br>${costText(tot)}">⬆ Модернизация (${upg.length})</button>`; }
  h += `</div>`;
  h += unitExtras(us);
  if (UI._up !== h) { el.innerHTML = h; UI._up = h; }
}
function stName(g) {
  const u = g[0]; const m = { idle: 'ожидает', move: 'в пути', base: 'на базе', out: 'в полёте', back: 'возвращается', patrol: 'патруль', strike: 'удар', cargo: 'на борту' };
  return m[u.st] || u.st;
}

/* ---- act dispatcher ---- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el || el.disabled) return;
  if (!G && !el.dataset.act.startsWith('cx-') && !['startgo', 'startselect', 'continue', 'opt', 'loadauto', 'loadstart', 'closemodal'].includes(el.dataset.act)) return;
  const d = el.dataset; Snd.play('click');
  act(d.act, d, el, e);
  if (el.tagName === 'BUTTON' && el.blur) el.blur();
});
function act(a, d, el, e) {
  if (a.startsWith('cx-') && campaignAction(a, d, el, e)) return;
  if (G?.opts.observer && ['build', 'queue', 'cancelbuild', 'cancelq', 'speedup', 'spy', 'cyber', 'upgrade', 'stop', 'recall', 'loadtr', 'boardtr', 'loadcar', 'unloadtr'].includes(a)) { toast('В режиме наблюдателя действует ИИ', 'war'); return; }
  switch (a) {
    case 'speed': { const v = +d.v; if (v === 0) { G.paused = true; } else { G.speed = v; G.paused = false; } updateSpeedBtns(); break; }
    case 'modal': openModal(d.m); break;
    case 'closemodal': closeModal(); break;
    case 'closeprov': SEL.prov = -1; SEL.sea = -1; $('prov-panel').classList.add('hidden'); MV.dirty = true; break;
    case 'desel': SEL.units.clear(); setMode(null); UI._up = ''; renderUnitPanel(); renderProvPanel(true); MV.dirty = true; break;
    case 'mode': setMode(UI.mode === d.m ? null : d.m); UI._up = ''; renderUnitPanel(); break;
    case 'stop': stopUnits([...SEL.units]); renderUnitPanel(); break;
    case 'recall': for (const id of SEL.units) { const u = G.U.get(id); if (u && (u.st === 'patrol' || u.st === 'strike')) returnToBase(u); } toast('Авиация возвращается на базы', 'good'); break;
    case 'build': { const err = startBuild(+d.p, d.b); if (err) toast(err, 'war'); else Snd.play('ok'); renderProvPanel(true); break; }
    case 'tutskip': UI.tut++; UI._tutH = ''; updateTutorial(); break;
    case 'tutoff': UI.tut = -1; UI.tutOff = true; $('tut').classList.add('hidden'); document.querySelectorAll('.tuthl').forEach(e => e.classList.remove('tuthl')); break;
    case 'speedup': { const err = speedUp(+d.p, d.k, 0); if (err) toast(err, 'war'); else Snd.play('ok'); renderProvPanel(true); break; }
    case 'spy': { const err = sendSpy(G.player, +d.p, d.m); if (err) toast(err, 'war'); else { toast(`Агент отправлен: ${SPY[d.m].n}`, 'good'); Snd.play('ok'); } renderProvPanel(true); break; }
    case 'cancelbuild': cancelBuild(+d.p); renderProvPanel(true); break;
    case 'queue': { const err = queueUnit(+d.p, d.t); if (err) toast(err, 'war'); renderProvPanel(true); break; }
    case 'cancelq': cancelQueue(+d.p, +d.i); renderProvPanel(true); break;
    case 'selunits': selectUnits(d.ids.split(',').map(Number), e.shiftKey); renderProvPanel(true); break;
    case 'selair': { const ids = unitsAt(+d.p).filter(u => u.o === G.player && UNITS[u.t].dom === 'air').map(u => u.id); selectUnits(ids, false); renderProvPanel(true); break; }
    case 'selall': { const ids = unitsAt(+d.p).filter(u => u.o === G.player && (UNITS[u.t].dom === 'land' || UNITS[u.t].dom === 'sea')).map(u => u.id); selectUnits(ids, false); renderProvPanel(true); break; }
    case 'dipl': UI.dc = +d.c; openModal('diplomacy'); break;
    case 'mapmode': MV.mode = d.m; updateModeBtns(); MV.dirty = true; miniDirty = true; break;
    case 'mapmodes': openModal('layers'); break;
    case 'upgrade': { const r = upgradeUnits([...SEL.units]); toast(r.n ? `Модернизировано: ${r.n}` + (r.fail ? `, не хватило ресурсов: ${r.fail}` : '') : 'Не хватает ресурсов', r.n ? 'good' : 'war'); UI._up = ''; renderUnitPanel(); break; }
    case 'cyber': { const err = cyberAttack(G.player, +d.p); if (err) toast(err, 'war'); else { toast('Кибератака успешна', 'good'); Snd.play('ok'); } renderProvPanel(true); break; }
    case 'loadtr': {
      const trs = [...SEL.units].map(id => G.U.get(id)).filter(u => u && u.t === 'transport');
      let n = 0; for (const t of trs) { const cand = unitsAt(t.loc).filter(u => u.o === G.player && UNITS[u.t].dom === 'land' && u.st === 'idle').map(u => u.id); n += loadOnTransport(t.id, cand); }
      toast(n ? `Погружено частей: ${n}` : 'Нет сухопутных частей в порту (транспорт должен стоять в прибрежной провинции)', n ? 'good' : 'war'); renderUnitPanel(); break;
    }
    case 'boardtr': {
      const land = [...SEL.units].filter(id => { const u = G.U.get(id); return u && UNITS[u.t].dom === 'land'; });
      let n = 0; const locs = new Set(land.map(id => G.U.get(id).loc));
      for (const l of locs) { const trs = unitsAt(l).filter(u => u.t === 'transport' && u.o === G.player); for (const t of trs) n += loadOnTransport(t.id, land); }
      toast(n ? `Погружено на транспорт: ${n}` : 'В этой провинции нет вашего транспорта', n ? 'good' : 'war'); renderUnitPanel(); break;
    }
    case 'unloadtr': for (const id of SEL.units) { const u = G.U.get(id); if (u && u.t === 'transport' && u.loc < P) unloadAll(u, u.loc); else if (u && u.t === 'transport') toast('Подойдите к побережью (приказ в прибрежную провинцию — высадка автоматически)', 'war'); } renderUnitPanel(); break;
    case 'loadcar': {
      const cars = [...SEL.units].map(id => G.U.get(id)).filter(u => u && u.t === 'carrier'); let n = 0;
      for (const c of cars) n += loadOnCarrier(c.id, unitsAt(c.loc).filter(u => u.o === G.player && UNITS[u.t].dom === 'air' && u.st === 'base').map(u => u.id));
      toast(n ? `Самолётов на авианосце: ${n}` : 'Нет самолётов в порту авианосца', n ? 'good' : 'war'); renderUnitPanel(); break;
    }
    default: if (window.actModal) window.actModal(a, d, el, e);
  }
}
$('ticker').onclick = () => { const l = +$('ticker').dataset.l; if (l >= 0) focusLoc(l); else openModal('events'); };
$('tb-country').onclick = () => openModal('overview');
$('goals').onclick = () => { $('goals').classList.toggle('min'); UI._goalsH = ''; };
