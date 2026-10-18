'use strict';
/* ===== Modal windows ===== */
const TITLES = { overview: '🌍 Обзор', army: '🎖 Армия и производство', research: '🔬 Исследования', diplomacy: '🤝 Дипломатия', market: '💱 Мировой рынок', events: '📰 События', help: '❓ Справочник командира', menu: '☰ Меню', layers: '🗺 Слои карты', tutorial: '🎖 Добро пожаловать, командующий' };
const TABS = { overview: [['country', 'Моя страна'], ['world', 'Страны мира'], ['wars', 'Войны'], ['victory', 'Победа']], army: [['units', 'Войска'], ['prod', 'Производство'], ['build', 'Строительство'], ['spies', 'Разведка']], events: [['mine', 'Мои'], ['all', 'Мировые']] };
function openModal(m) { hideTip(); UI.hoverTip = null; UI.modal = m; if (m === 'events') UI.unseen = 0; $('modal-back').classList.remove('hidden'); renderModal(false); }
function closeModal() { UI.modal = null; $('modal-back').classList.add('hidden'); hideTip(); }
$('modal-back').addEventListener('mousedown', e => { if (e.target.id === 'modal-back') closeModal(); });

function renderModal(keepScroll) {
  const m = UI.modal; if (!m) return;
  const box = $('modal'); const mb0 = box.querySelector('.mb'); const st = keepScroll && mb0 ? mb0.scrollTop : 0;
  const sm = m === 'menu' || m === 'layers' || m === 'tutorial';
  box.className = sm ? 'sm' : '';
  const tab = UI.tab[m] || (TABS[m] ? TABS[m][0][0] : '');
  let body = '';
  switch (m) {
    case 'overview': body = overviewHTML(tab); break;
    case 'army': body = armyHTML(tab); break;
    case 'research': body = researchHTML(); break;
    case 'diplomacy': body = diplHTML(); break;
    case 'market': body = marketHTML(); break;
    case 'events': body = eventsHTML(tab); break;
    case 'help': body = helpHTML(); break;
    case 'menu': body = menuHTML(); break;
    case 'layers': body = layersHTML(); break;
    case 'tutorial': body = tutorialHTML(); break;
  }
  let h = `<div class="mh"><h2>${TITLES[m]}</h2><button class="btn" data-act="closemodal">✕ Закрыть</button></div>`;
  if (TABS[m]) h += `<div class="tabs">${TABS[m].map(([k, n]) => `<button class="${k === tab ? 'on' : ''}" data-act="tab" data-m="${m}" data-t="${k}">${n}</button>`).join('')}</div>`;
  h += `<div class="mb scroll">${body}</div>`;
  if (m === 'diplomacy') { const l = box.querySelector('#dlist'); UI._dlistScroll = l ? l.scrollTop : UI._dlistScroll; }
  box.innerHTML = h;
  const mb = box.querySelector('.mb'); if (mb) mb.scrollTop = st;
  if (m === 'diplomacy') { const l = box.querySelector('#dlist'); if (l && UI._dlistScroll) l.scrollTop = UI._dlistScroll; }
}

/* ---------- overview ---------- */
function overviewHTML(tab) {
  const C = G.C[G.player];
  if (tab === 'country') {
    let units = 0, byDom = { land: 0, air: 0, sea: 0, msl: 0 };
    for (const [, u] of G.U) if (u.o === G.player) { units++; byDom[UNITS[u.t].dom]++; }
    let h = `<div class="row" style="align-items:flex-start;gap:20px;flex-wrap:wrap"><div style="flex:1;min-width:280px"><div class="row" style="margin-bottom:10px">${flagImg(G.player, 'lg')}<div><b style="font-size:20px">${esc(C.n)}</b><div class="note">${GOV[C.gov]} · ${C.alliance >= 0 ? esc(G.al[C.alliance].n) : 'без альянса'}</div></div></div>`;
    h += `<div class="grid2" style="font-size:13px">`;
    const kv = (a, b) => `<div class="kv"><span>${a}</span><span>${b}</span></div>`;
    h += kv('Доктрина', `<span data-tip="${DOCS[C.doc].d}">${DOCS[C.doc].n}</span>`) + kv('Строй', `<span data-tip="${(GOV_FX[C.gov] || {}).t}">${GOV[C.gov]}</span>`) + kv('Место в мире', rankOf(G.player) + ' из ' + G.C.filter(c => c.alive).length) + kv('Очки', fmt(scoreOf(G.player))) + kv('Провинций', C.provs.length) + kv('Победные очки', C.vp) + kv('Население', fmtPop(C.inc.pop || 0)) + kv('Войска', units) + kv('🪖 Сухопутные', byDom.land) + kv('✈ Авиация', byDom.air) + kv('⚓ Флот', byDom.sea) + kv('🚀 Ракеты', byDom.msl) + kv('Военная мощь', fmt(C.pwr || armyPower(G.player))) + kv('Захвачено провинций', C.stats.taken) + kv('Потеряно провинций', C.stats.lost) + kv('Потери юнитов', C.stats.losses);
    h += `</div></div><div style="flex:1.2;min-width:320px"><table class="t"><tr><th>Ресурс</th><th>Запас</th><th>Доход/сут</th><th>Расход/сут</th><th>Баланс</th></tr>`;
    for (const k of RES) { const inc = C.inc[k] || 0, use = C.use[k] || 0; h += `<tr><td>${RES_INFO[k].i} ${RES_INFO[k].n}</td><td>${fmt(C.res[k])}</td><td style="color:#5fd35f">+${fmt(inc)}</td><td style="color:#e0a050">−${fmt(use)}</td><td style="color:${inc - use >= 0 ? '#5fd35f' : '#e0503c'}">${inc - use >= 0 ? '+' : ''}${fmt(inc - use)}</td></tr>`; }
    h += `<tr><td>👥 Живая сила</td><td>${fmt(C.res.man)}</td><td colspan="3">максимум ${fmt(C.manCap)}</td></tr></table></div></div>`;
    h += `<h4 style="color:var(--tx2);margin:16px 0 6px;text-transform:uppercase;font-size:11px;letter-spacing:1px">Ваши провинции</h4><table class="t"><tr><th>Провинция</th><th>Население</th><th>★</th><th>Здания</th></tr>`;
    for (const p of C.provs.slice().sort((a, b) => PROV[b].pop - PROV[a].pop).slice(0, 40)) { const b = G.pv[p].b; h += `<tr data-act="focus" data-l="${p}" style="cursor:pointer"><td>${esc(PROV[p].name)}${C.cap === p ? ' ⭐' : ''}</td><td>${fmtPop(G.pv[p].pop)}</td><td>${PROV[p].vp || ''}</td><td>${BLD_ORDER.filter(k => b[k]).map(k => BLD[k].i + b[k]).join(' ')}</td></tr>`; }
    return h + '</table>';
  }
  if (tab === 'world') {
    const sort = UI.wsort || 'sc';
    const rows = G.C.filter(c => c.alive).map(c => ({ c, p: c.provs.length, vp: c.vp, pw: c.pwr || 0, pop: c.inc.pop || 0, sc: scoreOf(c.id) }));
    rows.sort((a, b) => b[sort] - a[sort]);
    let h = `<table class="t"><tr><th>#</th><th>Страна</th><th>Альянс</th><th data-act="wsort" data-s="sc">Очки</th><th data-act="wsort" data-s="p">Провинции</th><th data-act="wsort" data-s="vp">★ ПО</th><th data-act="wsort" data-s="pw">Мощь</th><th data-act="wsort" data-s="pop">Население</th><th>Отн.</th></tr>`;
    rows.slice(0, 80).forEach((r, i) => {
      const c = r.c, rel = relOf(G.player, c.id), war = G.war[G.player * NC + c.id];
      h += `<tr class="${c.id === G.player ? 'me' : ''}" data-act="dipl" data-c="${c.id}" style="cursor:pointer"><td>${i + 1}</td><td>${flagImg(c.id)} ${esc(c.n)}${c.nukes ? ' ☢' : ''}</td><td>${c.alliance >= 0 ? esc(G.al[c.alliance].n) : '—'}</td><td><b>${fmt(r.sc)}</b></td><td>${r.p}</td><td>${r.vp}</td><td>${fmt(r.pw)}</td><td>${fmtPop(r.pop)}</td><td>${c.id === G.player ? '' : war ? '<span class="pill war">война</span>' : areAllied(c.id, G.player) ? '<span class="pill ally">союзник</span>' : Math.round(rel)}</td></tr>`;
    });
    return h + '</table><div class="note" style="margin-top:6px">Показаны 80 сильнейших. Клик — дипломатия со страной.</div>';
  }
  if (tab === 'wars') {
    const list = [];
    for (let a = 0; a < NC; a++) for (let b = a + 1; b < NC; b++) if (G.war[a * NC + b] && G.C[a].alive && G.C[b].alive) list.push([a, b]);
    if (!list.length) return '<div class="note">Сейчас в мире нет войн.</div>';
    return `<table class="t"><tr><th>Сторона A</th><th>Сторона B</th><th>Длительность</th><th>Захваты A / B</th></tr>${list.map(([a, b]) => `<tr><td>${flagImg(a)} ${esc(G.C[a].n)}</td><td>${flagImg(b)} ${esc(G.C[b].n)}</td><td>${Math.floor((G.hour - G.warStart[a * NC + b]) / 24)} дн.</td><td>${G.wlost[b * NC + a]} / ${G.wlost[a * NC + b]}</td></tr>`).join('')}</table>`;
  }
  // victory
  const need = Math.ceil(G.totalVP * G.opts.win);
  const als = G.al.map(al => ({ al, vp: al.members.reduce((a, m) => a + G.C[m].vp, 0) })).filter(x => x.al.members.length).sort((a, b) => b.vp - a.vp);
  const solo = G.C.filter(c => c.alive && c.alliance < 0).map(c => ({ al: { n: c.n, color: c.color, members: [c.id] }, vp: c.vp })).sort((a, b) => b.vp - a.vp).slice(0, 5);
  const all = als.concat(solo).sort((a, b) => b.vp - a.vp).slice(0, 10);
  let h = `<p>Для победы нужно контролировать <b>${need}</b> победных очков из ${G.totalVP} (${Math.round(G.opts.win * 100)}%) — одним государством или альянсом.</p>`;
  for (const x of all) h += `<div class="row" style="margin:6px 0"><div style="width:190px">${esc(x.al.n)} <span class="note">(${x.al.members.length})</span></div><div class="bar2" style="flex:1"><i style="width:${Math.min(100, x.vp / need * 100)}%;background:${x.al.color}"></i></div><div style="width:80px;text-align:right">${x.vp} / ${need}</div></div>`;
  return h;
}

/* ---------- army ---------- */
function armyHTML(tab) {
  const C = G.C[G.player];
  if (tab === 'units') {
    const by = {}; for (const [, u] of G.U) if (u.o === G.player) { (by[u.t] = by[u.t] || []).push(u); }
    let h = `<table class="t"><tr><th>Тип</th><th>Кол-во</th><th>Поколение</th><th>Прочность</th><th>Мораль</th><th>Содержание/сут</th><th></th></tr>`;
    for (const t of UNIT_ORDER) { const g = by[t]; if (!g) continue; const hp = g.reduce((a, u) => a + u.hp, 0) / g.length, mo = g.reduce((a, u) => a + u.mor, 0) / g.length; const up = UNITS[t].up; h += `<tr><td>${unitIcon(t, '#fff', 22)} ${UNITS[t].n}</td><td>${g.length}</td><td>${GEN_NAMES[C.gen[t]]}</td><td>${Math.round(hp)}%</td><td>${Math.round(mo)}%</td><td>${Object.keys(up).map(k => RES_INFO[RES_SHORT[k]].i + (up[k] * g.length).toFixed(1)).join(' ')}</td><td><button class="btn sm" data-act="selunitsT" data-t="${t}">Выбрать все</button></td></tr>`; }
    return h + '</table>' + (Object.keys(by).length ? '' : '<div class="note">У вас нет войск.</div>');
  }
  if (tab === 'prod') {
    let h = `<table class="t"><tr><th>Провинция</th><th>Юнит</th><th>Прогресс</th><th>Осталось</th><th></th></tr>`; let n = 0;
    for (const p of C.provs) for (const [i, it] of G.pv[p].q.entries()) { n++; h += `<tr><td data-act="focus" data-l="${p}" style="cursor:pointer">${esc(PROV[p].name)}</td><td>${unitIcon(it.t, '#fff', 20)} ${UNITS[it.t].n}</td><td><div class="bar2"><i style="width:${Math.round((1 - it.left / it.total) * 100)}%;background:#4a90e2"></i></div></td><td>${Math.ceil(it.left)} ч</td><td><button class="btn sm" data-act="cancelq" data-p="${p}" data-i="${i}">✕</button></td></tr>`; }
    return h + '</table>' + (n ? '' : '<div class="note" style="margin-top:8px">Очереди пусты. Выберите провинцию со зданиями и закажите юнитов.</div>');
  }
  if (tab === 'spies') {
    const my = spiesOf(G.player);
    let h = `<p class="note">Агентов: ${my.length}/${spyCap(G.player)}. Отправляйте агентов из панели чужой провинции (🔍 разведка, 💣 саботаж, 💰 коррупция) или в свою провинцию (🛡 контрразведка).</p>`;
    h += my.length ? `<table class="t"><tr><th>Провинция</th><th>Страна</th><th>Миссия</th><th>Осталось</th></tr>${my.map(s => `<tr data-act="focus" data-l="${s.loc}" style="cursor:pointer"><td>${esc(PROV[s.loc].name)}</td><td>${flagImg(G.pv[s.loc].o)} ${esc(G.C[G.pv[s.loc].o].n)}</td><td>${SPY[s.mission].i} ${SPY[s.mission].n}${s.active ? ' (активен)' : ''}</td><td>${Math.ceil(s.left / (s.active ? 24 : 1))} ${s.active ? 'сут' : 'ч'}</td></tr>`).join('')}</table>` : '<div class="note">Нет активных агентов.</div>';
    return h;
  }
  let h = `<table class="t"><tr><th>Провинция</th><th>Здание</th><th>Прогресс</th><th>Осталось</th><th></th></tr>`; let n = 0;
  for (const p of C.provs) { const b = G.pv[p].bq; if (!b) continue; n++; h += `<tr><td data-act="focus" data-l="${p}" style="cursor:pointer">${esc(PROV[p].name)}</td><td>${BLD[b.b].i} ${BLD[b.b].n} → ${b.lvl}</td><td><div class="bar2"><i style="width:${Math.round((1 - b.left / b.total) * 100)}%;background:#5fd35f"></i></div></td><td>${Math.ceil(b.left)} ч</td><td><button class="btn sm" data-act="cancelbuild" data-p="${p}">✕</button></td></tr>`; }
  return h + '</table>' + (n ? '' : '<div class="note" style="margin-top:8px">Нет активного строительства.</div>');
}

/* ---------- research ---------- */
function researchHTML() {
  const C = G.C[G.player]; const opts = researchOptions(G.player);
  let h = `<div class="scroll" style="overflow-x:auto"><div class="cols">`;
  for (const br in BRANCHES) {
    h += `<div class="col"><h4>${BRANCHES[br]}</h4>`;
    const cur = C.rs[br];
    if (cur) { const nm = cur.k === 'u' ? `${UNITS[cur.id].n} → пок. ${GEN_NAMES[cur.lvl]}` : `${TECHS[cur.id].n} ур. ${cur.lvl}`; h += `<div class="rcard rcur"><div class="tt">⏳ ${nm}</div><div class="bar2"><i style="width:${Math.round((1 - cur.left / cur.total) * 100)}%;background:#4a90e2"></i></div><p>Осталось ${Math.ceil(cur.left / 24)} дн. ${cur.left % 24 | 0} ч</p></div>`; }
    else h += `<div class="note" style="margin-bottom:6px">Ветка свободна</div>`;
    for (const o of opts.filter(x => x.br === br)) {
      const cost = techCost(o.k, o.id, o.lvl), days = techDays(o.k, o.id, o.lvl);
      const can = !C.rs[br] && canAfford(G.player, cost);
      const ico = o.k === 'u' ? unitIcon(o.id, '#fff', 22) : `<span style="font-size:18px">${TECHS[o.id].i}</span>`;
      const nm = o.k === 'u' ? `${UNITS[o.id].n} — пок. ${GEN_NAMES[o.lvl]}` : `${TECHS[o.id].n} — ур. ${o.lvl}`;
      const desc = o.k === 'u' ? `Атака +${Math.round((GEN_ATK[o.lvl] / GEN_ATK[o.lvl - 1] - 1) * 100)}%, броня +1, скорость +4%. Применяется к новым юнитам.` : TECHS[o.id].d;
      h += `<div class="rcard"><div class="tt">${ico} ${nm}</div><p>${desc}</p><div class="costs" style="margin:3px 0">${costHTML(cost, G.player)}<i>⏱ ${days} дн.</i></div><button class="btn sm ${can ? 'pri' : ''}" ${can ? '' : 'disabled'} data-act="research" data-k="${o.k}" data-id="${o.id}" data-l="${o.lvl}">Исследовать</button></div>`;
    }
    h += `</div>`;
  }
  return h + `</div></div>`;
}

/* ---------- diplomacy ---------- */
function dipRows() {
  const f = UI.dfilter || 'all', q = (UI.dsearch || '').toLowerCase(); const nb = new Set(neighborsOf(G.player));
  return G.C.filter(c => c.alive && c.id !== G.player && (!q || c.n.toLowerCase().includes(q)) && (f === 'all' || (f === 'nb' && nb.has(c.id)) || (f === 'ally' && areAllied(c.id, G.player)) || (f === 'war' && G.war[G.player * NC + c.id]))).sort((a, b) => (b.mil * 4 + Math.log10(b.gdp + 1)) - (a.mil * 4 + Math.log10(a.gdp + 1))).slice(0, 120);
}
function diplListHTML() {
  return dipRows().map(c => { const rel = relOf(G.player, c.id), war = G.war[G.player * NC + c.id]; const col = rel > 25 ? '#5fd35f' : rel > -25 ? '#e6c34a' : '#e0503c'; return `<div class="it ${c.id === UI.dc ? 'on' : ''}" data-act="dsel" data-c="${c.id}">${flagImg(c.id)}<span style="flex:1">${esc(c.n)}${war ? ' ⚔' : ''}${areAllied(c.id, G.player) ? ' 🛡' : ''}</span><div class="bar2 relbar"><i style="width:${(rel + 100) / 2}%;background:${col}"></i></div></div>`; }).join('');
}
function renderDiplList() { const l = $('dlist'); if (l) { const s = l.scrollTop; l.innerHTML = diplListHTML(); l.scrollTop = s; } }
function diplHTML() {
  const f = UI.dfilter || 'all';
  let h = `<div class="split"><div><div class="row" style="margin-bottom:6px"><input type="text" placeholder="Поиск страны…" value="${esc(UI.dsearch || '')}" oninput="UI.dsearch=this.value;renderDiplList()" style="flex:1;min-width:0"></div><div class="opt" style="margin-bottom:6px">${[['all', 'Все'], ['nb', 'Соседи'], ['ally', 'Союзники'], ['war', 'Войны']].map(([k, n]) => `<button class="btn sm ${f === k ? 'on' : ''}" data-act="dfilter" data-f="${k}">${n}</button>`).join('')}</div><div class="dlist" id="dlist" style="max-height:calc(100% - 80px);overflow:auto">${diplListHTML()}</div></div><div>`;
  const me = G.C[G.player];
  if (UI.dc < 0 || !G.C[UI.dc] || !G.C[UI.dc].alive || UI.dc === G.player) {
    h += `<div class="cardc"><h3 style="margin-top:0">Ваш альянс</h3>`;
    if (me.alliance >= 0) { const al = G.al[me.alliance]; h += `<p><b>${esc(al.n)}</b> — ${al.members.length} членов. Лидер: ${esc(G.C[al.leader].n)}</p><div class="ulist">${al.members.map(m => `<span class="uchip" data-act="dsel" data-c="${m}">${flagImg(m)} ${esc(G.C[m].n)}</span>`).join('')}</div><p><button class="btn danger" data-act="dleave">Покинуть альянс</button></p>`; }
    else h += `<p class="note">Вы не состоите в альянсе. Вступите в союз или создайте свой, чтобы получить общую победу, обзор и помощь в войнах.</p><div class="row"><input type="text" id="alname" placeholder="Название альянса" value="Союз ${esc(me.n)}"><button class="btn pri" data-act="dcreate">Создать альянс</button></div>`;
    h += `</div><p class="note">Выберите страну слева, чтобы вести переговоры.</p>`;
    return h + '</div></div>';
  }
  const c = G.C[UI.dc], rel = relOf(G.player, c.id), war = G.war[G.player * NC + c.id], ally = areAllied(c.id, G.player);
  const wars = warsOf(c.id).map(w => esc(G.C[w].n)).join(', ') || '—';
  h += `<div class="cardc"><div class="row">${flagImg(c.id, 'lg')}<div style="flex:1"><b style="font-size:19px">${esc(c.n)}</b><div class="note">${GOV[c.gov]} · ${c.alliance >= 0 ? esc(G.al[c.alliance].n) : 'без альянса'}${c.nukes ? ' · ☢ ядерная держава' : ''}</div></div><button class="btn sm" data-act="focus" data-l="${c.cap}">📍 На карте</button></div>`;
  h += `<div class="grid2" style="margin-top:10px"><div class="kv"><span>Отношения</span><b style="color:${rel > 25 ? '#5fd35f' : rel > -25 ? '#e6c34a' : '#e0503c'}">${Math.round(rel)}</b></div><div class="kv"><span>Статус</span><span>${war ? '<span class="pill war">ВОЙНА</span>' : ally ? '<span class="pill ally">союзник</span>' : G.acc[c.id * NC + G.player] ? '<span class="pill acc">проход открыт</span>' : 'мир'}</span></div><div class="kv"><span>Провинции</span><span>${c.provs.length}</span></div><div class="kv"><span>Население</span><span>${fmtPop(c.inc.pop || 0)}</span></div><div class="kv"><span>Военная мощь</span><span>${fmt(c.pwr || 0)} (ваша ${fmt(me.pwr || 0)})</span></div><div class="kv"><span>Воюет с</span><span style="text-align:right;max-width:200px">${wars}</span></div></div></div>`;
  h += `<div class="cardc" style="margin-top:10px"><h4 style="margin:0 0 8px;color:var(--tx2);text-transform:uppercase;font-size:11px;letter-spacing:1px">Действия</h4><div class="row" style="flex-wrap:wrap;gap:6px">`;
  if (war) h += `<button class="btn pri" data-act="dpeace">🕊 Предложить мир</button>`;
  else if (!ally) h += `<button class="btn danger" data-act="dwar">⚔ Объявить войну</button>`;
  if (!war) h += `<button class="btn" data-act="daccess" data-tip="Попросить разрешение на проход ваших войск">🚶 Запросить военный доступ</button>`;
  if (me.alliance >= 0 && c.alliance !== me.alliance && !war) h += `<button class="btn" data-act="dinvite">🛡 Пригласить в альянс</button>`;
  if (me.alliance < 0 && c.alliance >= 0 && !war) h += `<button class="btn" data-act="djoin" data-tip="Проситься в альянс этой страны">🛡 Вступить в их альянс</button>`;
  h += `</div>`;
  if (!war) h += `<div class="row" style="margin-top:10px;flex-wrap:wrap"><span>🎁 Подарок:</span><select id="giftres">${['cash', 'food', 'supp', 'fuel', 'comp', 'elec', 'rare'].map(k => `<option value="${k}">${RES_INFO[k].n}</option>`).join('')}</select><input type="number" id="giftqty" value="100" min="1" style="width:90px"><button class="btn" data-act="dgift">Отправить (+отношения)</button></div>`;
  h += `<div id="dmsg" class="note" style="margin-top:10px;min-height:18px">${UI.dmsg || ''}</div></div>`;
  return h + '</div></div>';
}
function dmsg(t, bad) { UI.dmsg = `<span style="color:${bad ? '#ff9a80' : '#8fe0a8'}">${t}</span>`; renderModal(true); }

/* ---------- market ---------- */
function marketHTML() {
  const C = G.C[G.player];
  let h = `<p class="note">Цены меняются от ваших сделок и со временем возвращаются к норме. Покупка дороже продажи на ~25%.</p><table class="t"><tr><th>Ресурс</th><th>Запас</th><th>Баланс/сут</th><th>Купить за 💵</th><th>Продать за 💵</th><th>Операции</th></tr>`;
  for (const k of ['food', 'supp', 'fuel', 'comp', 'elec', 'rare']) {
    const net = (C.inc[k] || 0) - (C.use[k] || 0);
    h += `<tr><td>${RES_INFO[k].i} ${RES_INFO[k].n}</td><td>${fmt(C.res[k])}</td><td style="color:${net >= 0 ? '#5fd35f' : '#e0503c'}">${net >= 0 ? '+' : ''}${net.toFixed(1)}</td><td>${priceOf(k, true).toFixed(2)}</td><td>${priceOf(k, false).toFixed(2)}</td><td><div class="row" style="gap:3px">`;
    for (const q of [50, 250, 1000]) h += `<button class="btn sm" data-act="trade" data-r="${k}" data-q="${q}" data-b="1">+${q}</button>`;
    h += `<span style="width:8px"></span>`;
    for (const q of [50, 250, 1000]) h += `<button class="btn sm" data-act="trade" data-r="${k}" data-q="${q}" data-b="0">−${q}</button>`;
    h += `</div></td></tr>`;
  }
  return h + `</table><p>💵 Деньги: <b>${fmt(C.res.cash)}</b></p>`;
}

/* ---------- events ---------- */
function eventsHTML(tab) {
  const list = G.news.filter(n => tab === 'all' ? (n.f === 'g' || n.f === 'p') : (n.f === 'p' || n.c.includes(G.player))).slice(-150).reverse();
  if (!list.length) return '<div class="note">Пока ничего не произошло.</div>';
  const ico = { goal: '🏅', spy: '🕵', war: '⚔', peace: '🕊', nuke: '☢', capture: '🚩', loss: '💀', build: '🏗', unit: '🪖', research: '🔬', elim: '☠', capital: '⭐', defense: '🛡', cyber: '💻', peaceoffer: '🕊', warn: '⚠', attack: '💥', alliance: '🤝', join: '➕', land: '⚓' };
  return `<table class="t">${list.map(n => `<tr data-act="focus" data-l="${n.l}" style="cursor:pointer"><td style="width:110px;color:var(--tx2)">${dateStr(n.h)} ${timeStr(n.h)}</td><td style="width:26px">${ico[n.t] || '•'}</td><td>${esc(n.x)}</td></tr>`).join('')}</table>`;
}

/* ---------- help ---------- */
function helpHTML() {
  return `<div style="max-width:820px;line-height:1.5">
<h3>Цель игры</h3><p>Расширяйте влияние своей державы: захватывайте провинции с <b>победными очками ★</b>. Побеждает государство или альянс, набравший ${Math.round(G.opts.win * 100)}% ПО мира. Если враждебный блок наберёт столько же раньше вас — поражение.</p>
<h3>Управление</h3><ul>
<li><b>ЛКМ</b> по провинции — информация, по значку войск — выбор. <b>Shift+перетаскивание</b> — рамка выбора. <b>Двойной клик</b> по значку — выбрать все такие же.</li>
<li><b>ПКМ</b> (на телефоне — долгое нажатие) — приказ выбранным войскам: идти / атаковать / удар авиации / пуск ракеты.</li>
<li>Колесо мыши (щипок) — масштаб, перетаскивание — перемещение карты. <b>Пробел</b> — пауза, <b>1–5</b> — скорость, <b>H</b> — к столице.</li>
<li>Кнопки в нижней панели: <b>R</b> идти, <b>B</b> удар, <b>P</b> патруль, <b>F</b> пуск.</li></ul>
<h3>Экономика</h3><p>Каждая провинция даёт ресурсы по своей природе и населению: 💵 деньги, 🌾 еда, 📦 припасы, ⛽ топливо, 🔩 компоненты, 💻 электроника, 💎 редкие материалы. Войска ежедневно потребляют еду, припасы и топливо — при дефиците армия слабеет. Недостающее можно купить на 💱 рынке. Стройте <b>инфраструктуру</b> и <b>ресурсные комплексы</b>.</p>
<h3>Армия</h3><p>Юниты производятся в провинциях со зданиями: <b>Казармы</b> (пехота, спецназ), <b>Военный завод</b> (танки, артиллерия, ПВО), <b>Аэродром</b> (авиация, крылатые ракеты), <b>База ВМФ</b> (корабли), <b>Ракетная шахта</b> (баллистические и ядерные ракеты). Повышайте уровень зданий для продвинутых юнитов. Исследуйте новые поколения техники.</p>
<h3>Война</h3><p>Объявите войну через 🤝 Дипломатию. Войска, вошедшие в провинцию с противником, вступают в бой. Чтобы захватить провинцию, уничтожьте защитников и удерживайте её. Авиация вылетает с аэродромов (радиус ограничен), ракеты бьют разово. Союзники по альянсу вступают в войну. <b>Ядерный удар</b> уничтожает всё — но весь мир обернётся против вас.</p>
<h3>Десант</h3><p>Постройте <b>Транспорт</b> в порту, погрузите на него войска из той же провинции (кнопка «Грузить»), отправьте его приказом в прибрежную провинцию врага — войска высадятся автоматически. Прикройте высадку флотом и авиацией.</p>
<h3>Туман войны</h3><p>Вы видите вражеские войска только возле своих провинций, юнитов и радаров. Субмарины скрыты, пока рядом нет кораблей/авиации.</p>
<h3>Юниты</h3>${unitTableHTML()}<p class="note">Это фан-проект-эксперимент в духе Conflict of Nations: WW3, написанный с нуля. Карта построена по данным Natural Earth.</p></div>`;
}

function tutorialHTML() {
  const c = G.C[G.player];
  return `<div style="line-height:1.55"><p>Вы командуете государством <b>${esc(c.n)}</b>. Мир на грани Третьей мировой войны. Цель — набрать <b>${Math.round(G.opts.win * 100)}%</b> победных очков ★ вместе с союзниками.</p>
  <ol style="padding-left:20px;margin:6px 0">
  <li><b>Экономика.</b> Выберите свою провинцию — стройте здания (кнопки «＋»). Начните с <b>Инфраструктуры</b> и <b>Ресурсного комплекса</b>.</li>
  <li><b>Армия.</b> В провинции с Казармами/Заводом/Аэродромом закажите войска. Ресурсы тратятся сразу, юнит появится по готовности.</li>
  <li><b>Приказы.</b> Кликните по значку войск, затем <b>правой кнопкой</b> (на телефоне — долгое нажатие) по цели. Кнопки внизу: идти, удар, патруль, пуск.</li>
  <li><b>Дипломатия.</b> Кнопка 🤝: объявляйте войну, просите мир, вступайте в альянсы. Союзники делят обзор и приходят на помощь.</li>
  <li><b>Время.</b> Игра идёт в реальном времени. Пауза — пробел, скорость — клавиши 1–5. Следите за дефицитом 🌾📦⛽ — покупайте на рынке 💱.</li></ol>
  <p class="note">Подсказка: подготовьтесь до начала войны, а затем объявляйте её слабому соседу.</p><div class="row"><button class="btn pri" style="flex:1" data-act="tutgo">▶ Начать игру</button></div></div>`;
}
function unitTableHTML() {
  let h = `<table class="t" style="font-size:12px"><tr><th>Юнит</th><th>Пехота</th><th>Техника</th><th>Воздух</th><th>Флот</th><th>Здания</th><th>Броня</th><th>Скор.</th><th>Дальн.</th></tr>`;
  for (const t of UNIT_ORDER) { const d = UNITS[t]; h += `<tr data-tip="${esc(d.desc)}"><td>${unitIcon(t, '#fff', 18)} ${d.n}</td><td>${d.a.s}</td><td>${d.a.h}</td><td>${d.a.a}</td><td>${d.a.n}</td><td>${d.a.x}</td><td>${d.arm}</td><td>${d.spd}</td><td>${d.rng || '—'}</td></tr>`; }
  return h + '</table>';
}
/* ---------- menu & layers ---------- */
function slotInfo(n) { try { const m = JSON.parse(localStorage.getItem('conww3_m' + n) || 'null'); return m; } catch (e) { return null; } }
function menuHTML() {
  let h = `<div style="display:flex;flex-direction:column;gap:8px"><button class="btn pri" data-act="closemodal">▶ Продолжить</button>`;
  for (const n of [1, 2, 3]) { const m = slotInfo(n); h += `<div class="row"><button class="btn" style="flex:1" data-act="save" data-n="${n}">💾 Сохранить в слот ${n}</button><button class="btn" style="flex:1" data-act="loadslot" data-n="${n}" ${m ? '' : 'disabled'}>📂 ${m ? esc(m.t) : 'пусто'}</button></div>`; }
  h += `<div class="row"><label><input type="checkbox" ${UI.sound ? 'checked' : ''} data-act="optsound"> 🔊 Звук</label><label><input type="checkbox" ${MV.labels ? 'checked' : ''} data-act="optlabels"> Подписи стран</label><label><input type="checkbox" ${G.fogOff ? '' : 'checked'} data-act="optfog"> Туман войны</label><label><input type="checkbox" ${MV.daynight === false ? '' : 'checked'} data-act="optdn"> День/ночь</label></div>`;
  h += `<div class="row"><button class="btn danger" style="flex:1" data-act="newgame">⟲ Новая игра</button></div></div>`;
  return h;
}
function layersHTML() { return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">${MODES.map(([m, i, t]) => `<button class="btn ${MV.mode === m ? 'pri' : ''}" data-act="mapmode" data-m="${m}">${i} ${t}</button>`).join('')}</div>`; }

/* ---------- save/load ---------- */
function doSave(n) {
  try { const s = saveGame(); localStorage.setItem('conww3_s' + n, s); localStorage.setItem('conww3_m' + n, JSON.stringify({ t: `${G.C[G.player].n} · ${dateStr(G.hour)}`, h: G.hour })); toast('Игра сохранена', 'good'); }
  catch (e) { toast('Не удалось сохранить (нет места в хранилище)', 'war'); }
}
function doLoad(key) {
  try { const s = localStorage.getItem(key); if (!s) return false; loadGame(s); afterLoad(); return true; } catch (e) { console.error(e); toast('Ошибка загрузки сохранения', 'war'); return false; }
}

/* ---------- modal actions ---------- */
window.actModal = function (a, d, el, e) {
  switch (a) {
    case 'tab': UI.tab[d.m] = d.t; renderModal(false); break;
    case 'focus': if (+d.l >= 0) { closeModal(); focusLoc(+d.l, 3.2); if (+d.l < P) selectProv(+d.l); } break;
    case 'wsort': UI.wsort = d.s; renderModal(true); break;
    case 'research': { const err = startResearch(G.player, d.k, d.id, +d.l); if (err) toast(err, 'war'); else Snd.play('ok'); renderModal(true); break; }
    case 'selunitsT': { const ids = []; for (const [, u] of G.U) if (u.o === G.player && u.t === d.t) ids.push(u.id); closeModal(); selectUnits(ids, false); break; }
    case 'dsel': UI.dc = +d.c; UI.dmsg = ''; renderModal(true); break;
    case 'dfilter': UI.dfilter = d.f; renderModal(true); break;
    case 'dwar': { const r = declareWar(G.player, UI.dc); if (r) dmsg(r, true); else { dmsg('Война объявлена!'); Snd.play('war'); } break; }
    case 'dpeace': { const r = proposePeace(G.player, UI.dc); if (r.ok) dmsg('Мир заключён!'); else dmsg(r.why || 'Отказ', true); break; }
    case 'daccess': { const r = requestAccess(G.player, UI.dc); dmsg(r.ok ? 'Доступ предоставлен — ваши войска могут проходить через их территорию' : r.why, !r.ok); break; }
    case 'dgift': { const res = $('giftres').value, q = +$('giftqty').value; if (giveGift(G.player, UI.dc, res, q)) dmsg('Подарок отправлен, отношения улучшились'); else dmsg('Не хватает ресурсов', true); break; }
    case 'dinvite': { const r = inviteToAlliance(G.player, UI.dc); dmsg(r.ok ? 'Страна вступила в ваш альянс!' : (r.why || 'Отказ'), !r.ok); break; }
    case 'djoin': {
      const c = G.C[UI.dc]; if (c.alliance < 0) { dmsg('Страна не состоит в альянсе', true); break; }
      const al = G.al[c.alliance]; let ok = relOf(G.player, c.id) >= 30; for (const m of al.members) if (G.war[G.player * NC + m]) ok = false;
      if (ok) { joinAlliance(G.player, al.id); dmsg('Вы вступили в альянс «' + al.n + '»'); } else dmsg('Альянс отклонил заявку (нужны отношения от +30 и мир со всеми членами)', true); break;
    }
    case 'dcreate': { const n = ($('alname').value || '').trim().slice(0, 30); createAlliance(G.player, n); renderModal(true); break; }
    case 'dleave': leaveAlliance(G.player); renderModal(true); break;
    case 'trade': { const err = trade(G.player, d.r, +d.q, d.b === '1'); if (err) toast(err, 'war'); else Snd.play('ok'); renderModal(true); break; }
    case 'save': doSave(+d.n); renderModal(true); break;
    case 'loadslot': if (doLoad('conww3_s' + d.n)) closeModal(); break;
    case 'tutgo': closeModal(); G.paused = false; G.speed = 2; updateSpeedBtns(); break;
    case 'optsound': UI.sound = el.checked; break;
    case 'optdn': MV.daynight = el.checked; MV.dirty = true; break;
    case 'optlabels': MV.labels = el.checked; MV.dirty = true; break;
    case 'optfog': G.fogOff = !el.checked; updateVis(true); MV.dirty = true; break;
    case 'newgame': if (UI.newConfirm) { UI.newConfirm = false; closeModal(); showStart(); } else { UI.newConfirm = true; el.textContent = '⚠ Нажмите ещё раз для подтверждения'; setTimeout(() => { UI.newConfirm = false; }, 4000); } break;
  }
};
