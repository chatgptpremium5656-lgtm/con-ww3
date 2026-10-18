'use strict';
/* ===== Start screen, game loop, boot ===== */
UI.start = { c: -1, scenario: 'eve', diff: 'normal', win: 55 };
let loopLast = 0, acc = 0, lastAutoHour = 0, overShown = false;

function importance(c) { return c.mil * 3 + Math.log10(c.gdp + 10) * 2 + (c.nukes ? 6 : 0); }
const FEATURED = ['US1', 'RUS', 'CH1', 'DEU', 'GB1', 'FR1', 'IND', 'TUR', 'JPN', 'BRA', 'POL', 'IS1', 'IRN', 'KOR', 'UKR', 'SAU', 'PAK', 'EGY', 'ITA', 'ESP', 'AU1', 'CAN', 'PRK', 'TWN'];
function diffRating(c) { const s = importance(c); return s > 40 ? ['Лёгкая', 1] : s > 26 ? ['Средняя', 2] : s > 16 ? ['Сложная', 3] : ['Экстремальная', 4]; }

function showStart() {
  G = null; window.G_ = null; MV.sel = null; MV.mode = 'political'; MV.hoverP = -1; miniDirty = true; MV.fxs = [];
  $('hud').classList.add('hidden'); $('modal-back').classList.add('hidden'); $('start').classList.remove('hidden');
  $('mini-wrap').style.display = 'none';
  if (document.querySelector('.over')) document.querySelector('.over').remove();
  overShown = false; UI.modal = null; SEL.units.clear(); SEL.prov = SEL.sea = -1;
  MV.startHi = -1; MV.cam.z = minZoom() * 1.0001; clampCam(); MV.dirty = true;
  const order = CTY.map((c, i) => i).sort((a, b) => importance(CTY[b]) - importance(CTY[a]));
  UI.startOrder = order;
  let hasAuto = false; try { hasAuto = !!localStorage.getItem('conww3_auto'); } catch (e) { }
  $('start').innerHTML = `
  <div class="stl">
    <p class="logo">FAN-MADE RECREATION</p>
    <div class="title">CONFLICT<br>OF <em>NATIONS</em><br><span style="font-size:20px;letter-spacing:6px">WORLD WAR 3</span></div>
    <div class="note">Стратегия в реальном времени на карте мира. Выберите державу, постройте армию и поведите её к мировому господству.</div>
    <input type="text" id="cs" placeholder="🔍 Поиск страны…" oninput="renderStartList()">
    <div class="clist" id="clist"></div>
    <div class="cardc" id="ccard"><div class="note">Выберите страну в списке или кликом по карте.</div></div>
  </div>
  <div class="str">
    <h3 style="margin:0">Сценарий</h3>
    <div class="opt" id="o-sc" style="flex-direction:column">${Object.entries(SCENARIOS).map(([k, s]) => `<button class="btn ${UI.start.scenario === k ? 'on' : ''}" style="text-align:left" data-act="opt" data-g="scenario" data-v="${k}"><b>${s.n}</b><br><small>${s.d}</small></button>`).join('')}</div>
    <h3 style="margin:6px 0 0">Сложность ИИ</h3>
    <div class="opt">${Object.entries(DIFF).map(([k, s]) => `<button class="btn ${UI.start.diff === k ? 'on' : ''}" data-act="opt" data-g="diff" data-v="${k}">${s.n}</button>`).join('')}</div>
    <h3 style="margin:6px 0 0">Победа: <span id="winv">${UI.start.win}</span>% победных очков</h3>
    <input type="range" min="25" max="80" value="${UI.start.win}" oninput="UI.start.win=+this.value;$('winv').textContent=this.value">
    <button class="btn pri" id="gobtn" style="font-size:17px;padding:12px;margin-top:8px" data-act="startgo" disabled>▶ НАЧАТЬ ИГРУ</button>
    ${hasAuto ? '<button class="btn" data-act="loadauto">📂 Продолжить с автосохранения</button>' : ''}
    <div class="note">Управление: ЛКМ — выбор, ПКМ — приказ, колесо — масштаб, Пробел — пауза. На телефоне: щипок, долгое нажатие — приказ.</div>
  </div>`;
  renderStartList();
  window.startSelect(UI.start.c >= 0 ? UI.start.c : cidx['POL']);
  // slow idle drift not needed; show whole world
}
function renderStartList() {
  const q = (($('cs') || {}).value || '').toLowerCase();
  const feat = FEATURED.map(k => cidx[k]).filter(i => i !== undefined);
  let list = UI.startOrder.filter(i => !q || CTY[i].n.toLowerCase().includes(q));
  if (!q) list = feat.concat(list.filter(i => !feat.includes(i)));
  $('clist').innerHTML = list.slice(0, 200).map(i => { const c = CTY[i]; return `<div class="it ${i === UI.start.c ? 'on' : ''}" data-act="startselect" data-c="${i}">${flagImg(i)}<span style="flex:1">${esc(c.n)}</span><span class="stars" style="font-size:10px">${'★'.repeat(Math.max(1, Math.round(c.mil / 2)))}</span></div>`; }).join('');
}
window.startSelect = function (ci) {
  UI.start.c = ci; const c = CTY[ci];
  MV.startHi = ci; const L = CLABEL[ci]; centerOn(L.x, L.y, Math.max(MV.cam.z, Math.min(5, 1100 / Math.max(L.w, L.h, 40) * 0.9)));
  const el = $('clist'); if (el) { el.querySelectorAll('.it').forEach(e => e.classList.toggle('on', +e.dataset.c === ci)); const on = el.querySelector('.it.on'); if (on) on.scrollIntoView({ block: 'nearest' }); }
  const [dn, dl] = diffRating(c);
  const nb = new Set(); for (const p of c.provs) for (const a of PROV[p].adj) if (PROV[a].c !== ci) nb.add(CTY[PROV[a].c].n);
  const al = c.bloc !== 'NONE' ? BLOCS[c.bloc].n : 'нет';
  const card = $('ccard'); if (!card) return;
  const inc = Math.round(0.9 * Math.pow(Math.max(c.gdp, 300) / 1000, 0.78) * 1.15);
  card.innerHTML = `<div class="row">${flagImg(ci, 'lg')}<div style="flex:1"><b style="font-size:19px">${esc(c.n)}</b><div class="note">${GOV[c.gov]} · столица: ${esc(PROV[c.cap].name)}</div></div></div>
  <div class="grid2" style="margin-top:8px"><div class="kv"><span>Население</span><span>${fmtPop(c.pop)}</span></div><div class="kv"><span>Провинций</span><span>${c.provs.length}</span></div><div class="kv"><span>Доход</span><span>≈ ${fmt(inc)}/сут</span></div><div class="kv"><span>Альянс</span><span>${esc(al)}</span></div>
  <div class="kv"><span>Армия</span><span class="stars">${'★'.repeat(Math.round(c.mil / 2))}</span></div><div class="kv"><span>Технологии</span><span class="stars">${'★'.repeat(c.tech)}</span></div><div class="kv"><span>Ядерное оружие</span><span>${c.nukes ? '☢ есть' : 'нет'}</span></div><div class="kv"><span>Сложность</span><span style="color:${['#5fd35f', '#e6c34a', '#e0803c', '#e0503c'][dl - 1]}">${dn}</span></div></div>
  <div class="note" style="margin-top:6px">Соседи: ${[...nb].slice(0, 8).map(esc).join(', ') || 'нет (остров)'}</div>`;
  const b = $('gobtn'); if (b) b.disabled = false;
};
window.actStart = function (a, d) {
  if (a === 'opt') { UI.start[d.g] = d.v; const row = document.querySelectorAll(`[data-g="${d.g}"]`); row.forEach(b => b.classList.toggle('on', b.dataset.v === d.v)); }
  else if (a === 'startselect') window.startSelect(+d.c);
  else if (a === 'startgo') startNew();
  else if (a === 'loadauto') { if (doLoad('conww3_auto')) { /* afterLoad handles UI */ } }
};
const _act = act; act = function (a, d, el, e) { if (['opt', 'startselect', 'startgo', 'loadauto'].includes(a)) return window.actStart(a, d); return _act(a, d, el, e); };

function startNew() {
  const o = UI.start;
  $('gobtn').disabled = true; $('gobtn').textContent = 'Загрузка мира…';
  setTimeout(() => {
    newGame({ player: o.c, scenario: o.scenario, diff: o.diff, win: o.win / 100 });
    afterNew();
  }, 30);
}
function afterNew() {
  $('start').classList.add('hidden'); $('hud').classList.remove('hidden'); $('mini-wrap').style.display = 'block';
  SEL.units.clear(); SEL.prov = SEL.sea = -1; MV.sel = SEL; MV.startHi = -1; MV.mode = 'political'; miniDirty = true;
  UI.newsSeen = G.news.length ? G.news[G.news.length - 1].id : 0; UI.unseen = 0; UI._up = ''; UI.dc = -1;
  G.paused = true; G.speed = 1; G.fogOff = !UI.fog; lastAutoHour = G.hour; overShown = false;
  buildHUD(); closeModalSilently();
  const c = G.C[G.player]; focusLoc(c.cap, 3.4); selectProv(c.cap);
  refreshHUD(true);
  openModal('tutorial');
}
function closeModalSilently() { UI.modal = null; $('modal-back').classList.add('hidden'); }
function afterLoad() {
  $('start').classList.add('hidden'); $('hud').classList.remove('hidden'); $('mini-wrap').style.display = 'block';
  SEL.units.clear(); SEL.prov = SEL.sea = -1; MV.sel = SEL; MV.startHi = -1; miniDirty = true;
  UI.newsSeen = G.news.length ? G.news[G.news.length - 1].id : 0; UI.unseen = 0; UI._up = '';
  G.paused = true; G.speed = 1; G.fogOff = !UI.fog; lastAutoHour = G.hour; overShown = false;
  buildHUD(); closeModalSilently();
  focusLoc(G.C[G.player].cap, 3.2); refreshHUD(true); toast('Игра загружена', 'good');
}

function showOver() {
  overShown = true; G.paused = true;
  const d = document.createElement('div'); d.className = 'over';
  d.innerHTML = `<h1 style="color:${G.over.win ? '#5fd35f' : '#e0503c'}">${G.over.win ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ'}</h1><p style="font-size:17px;max-width:600px">${esc(G.over.text)}</p><p class="note">${dateStr(G.hour)} · ${G.C[G.player].n}</p><div class="row">${G.over.win ? '<button class="btn pri" id="ovc">Продолжить игру</button>' : ''}<button class="btn" id="ovn">Новая игра</button></div>`;
  document.body.appendChild(d);
  const c = d.querySelector('#ovc'); if (c) c.onclick = () => { G.over = null; G.opts.win = 5; d.remove(); G.paused = false; overShown = false; };
  d.querySelector('#ovn').onclick = () => { d.remove(); showStart(); };
}

function loop(t) {
  requestAnimationFrame(loop);
  if (!G) { loopLast = t; return; }
  const dt = Math.min(120, t - loopLast); loopLast = t;
  if (!G.paused && !G.over) {
    acc += dt; const tm = TICK_MS[G.speed]; let n = 0; const t0 = performance.now();
    while (acc >= tm && n < 40 && performance.now() - t0 < 16) { tick(); acc -= tm; n++; if (G.over) break; }
    if (acc > tm * 6) acc = 0;
    MV.dirty = true;
  }
  if (t - UI.last > 260) { UI.last = t; refreshHUD(); }
  if (G.over && !overShown) showOver();
  if (G.hour - lastAutoHour >= 24 * 8 && !G.paused) { lastAutoHour = G.hour; try { localStorage.setItem('conww3_auto', saveGame()); } catch (e) { } }
}

window.addEventListener('load', () => {
  initMap($('map'), $('mini')); wireMap();
  requestAnimationFrame(loop);
  showStart();
});
