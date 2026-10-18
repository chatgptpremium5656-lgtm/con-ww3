'use strict';
/* ===== Simulation: tick, production, movement, flights, combat, capture ===== */
for (const t in UNITS) { const d = UNITS[t]; if (d.dom === 'air') d.fuel = Math.ceil(d.rng / d.spd * 2 + (d.dom === 'air' && t === 'heli' ? 6 : 5)); }

function news(type, text, loc, cs, flag) {
  G.newsId = (G.newsId || 0) + 1;
  G.news.push({ id: G.newsId, h: G.hour, t: type, x: text, l: loc === undefined ? -1 : loc, c: cs || [], f: flag || '' });
  if (G.news.length > 400) G.news.splice(0, 100);
}
function inv(c, ally) { return c === G.player || (ally !== false && areAllied(c, G.player)); }
function note(c, type, text, loc) { if (c === G.player) news(type, text, loc, [c], 'p'); }

function tick() {
  G.hour++;
  const h = G.hour;
  economyTick();
  productionTick();
  movementTick();
  flightTick();
  combatTick();
  captureTick();
  for (const pv of G.pv) { if (pv.dmg > 0) pv.dmg = Math.max(0, pv.dmg - 0.03); if (pv.fall > 0) pv.fall = Math.max(0, pv.fall - 0.0008); }
  if (h % 6 === 0) { for (const c of G.C) if (c.alive) { if (c.dirty || h % 24 === 0) recalc(c); calcUse(c); } updateVis(); }
  if (h % 24 === 0) dayTick();
  // AI scheduling
  for (const c of G.C) {
    if (!c.alive || !c.ai) continue;
    if ((h + c.id) % 6 === 0) aiMilitary(c);
    if ((h + c.id) % 24 === 5) aiEconomy(c);
    if ((h + c.id) % 24 === 11) aiProduction(c);
    if ((h + c.id) % 24 === 17) aiResearch(c);
    if ((h + c.id * 7) % 240 === 3) aiDiplomacy(c);
  }
  if (G.fx.length > 200) G.fx.splice(0, G.fx.length - 200);
}

function dayTick() {
  // relations drift, tension, market, victory check
  G.tension += 0.002 * (SCENARIOS[G.opts.scenario].tension);
  for (const k in G.market.m) G.market.m[k] += (1 - G.market.m[k]) * 0.03;
  for (const al of G.al) al.members = al.members.filter(m => G.C[m].alive);
  for (let a = 0; a < NC; a++) {
    if (!G.C[a].alive) continue;
    const A = G.C[a];
    A.pwr = armyPower(a);
  }
  for (let a = 0; a < NC; a++) for (let b = a + 1; b < NC; b++) {
    const i = a * NC + b, j = b * NC + a;
    let v = G.rel[i];
    if (G.war[i]) v = Math.max(-100, v - 0.5);
    else v += v > 0 ? -0.05 : 0.05;
    if (G.C[a].alliance >= 0 && G.C[a].alliance === G.C[b].alliance) v = Math.min(100, v + 0.2);
    G.rel[i] = G.rel[j] = clamp(v, -100, 100);
  }
  checkVictory();
}

/* ---------- economy ---------- */
function economyTick() {
  for (const c of G.C) {
    if (!c.alive) continue;
    const inc = c.inc, use = c.use, r = c.res;
    for (const k of RES) {
      let v = r[k] + ((inc[k] || 0) - (use[k] || 0)) / 24;
      if (v < 0) { v = 0; if (k === 'food' || k === 'supp' || k === 'fuel') { if (!c.short[k]) note(c.id, 'warn', `⚠ Дефицит: ${RES_INFO[k].n}! Войска слабеют — купите на рынке или повысьте добычу`, -1); c.short[k] = true; } }
      else if (c.short[k] && v > 8) c.short[k] = false;
      const cap = Math.max(3000, (inc[k] || 0) * 80);
      if (v > cap) v = cap;
      r[k] = v;
    }
    r.man = Math.min(c.manCap, r.man + c.manCap * 0.04 / 24);
  }
}
const MAN_FRAC = 1;

/* ---------- production & construction & research ---------- */
function airCapacity(p) { return 5 + 4 * G.pv[p].b.airfield; }
function basedAir(p) { let n = 0; for (const id of G.at[p]) { const u = G.U.get(id); if (u && UNITS[u.t].dom === 'air' && u.st !== 'cargo') n++; } return n; }
function productionTick() {
  for (let i = 0; i < P; i++) {
    const pv = G.pv[i], c = G.C[pv.o];
    if (!c.alive) continue;
    if (pv.bq) {
      pv.bq.left -= 1 + 0.1 * (c.techs.infra || 0);
      if (pv.bq.left <= 0) {
        pv.b[pv.bq.b] = pv.bq.lvl; c.dirty = true;
        note(pv.o, 'build', `${BLD[pv.bq.b].n} (ур. ${pv.bq.lvl}) построено: ${PROV[i].name}`, i);
        pv.bq = null;
      }
    }
    if (pv.q.length) {
      const it = pv.q[0], d = UNITS[it.t];
      const lvl = pv.b[d.req[0]];
      if (lvl < d.req[1]) { continue; } // building destroyed
      const sp = (1 + 0.12 * (lvl - d.req[1])) * (pv.dmg > 50 ? 0.5 : 1);
      it.left -= sp;
      if (it.left <= 0) {
        if (d.dom === 'air' && basedAir(i) >= airCapacity(i)) { it.left = 0; continue; }
        pv.q.shift();
        const u = spawnUnit(pv.o, it.t, i);
        c.dirty = true;
        note(pv.o, 'unit', `${d.n} готов: ${PROV[i].name}`, i);
      }
    }
  }
  for (const c of G.C) {
    if (!c.alive) continue;
    for (const br in c.rs) {
      const r = c.rs[br];
      if (!r) continue;
      r.left--;
      if (r.left <= 0) {
        if (r.k === 'u') { c.gen[r.id] = r.lvl; }
        else c.techs[r.id] = r.lvl;
        c.rs[br] = null; c.dirty = true;
        note(c.id, 'research', `Исследование завершено: ${r.k === 'u' ? UNITS[r.id].n + ' — поколение ' + GEN_NAMES[r.lvl] : TECHS[r.id].n + ' ур. ' + r.lvl}`, -1);
        if (r.k === 'u') for (const [, u] of G.U) if (u.o === c.id && u.t === r.id && false) u.g = r.lvl;
      }
    }
  }
}

function unitCostFor(c, t) { return UNITS[t].cost; }
function canQueue(p, t) {
  const pv = G.pv[p], d = UNITS[t], c = G.C[pv.o];
  if (!c.alive) return 'Страна уничтожена';
  if (pv.b[d.req[0]] < d.req[1]) return `Нужно: ${BLD[d.req[0]].n} ур. ${d.req[1]}`;
  if (!unitAvail(c.id, t)) return 'Нужны технологии';
  if (pv.q.length >= 5) return 'Очередь полна';
  if (d.dom === 'sea' && !isCoastal(p)) return 'Нужен выход к морю';
  if (!canAfford(c.id, d.cost)) return 'Не хватает ресурсов';
  if (c.res.man < (d.cost.p || 0)) return 'Не хватает живой силы';
  return '';
}
function queueUnit(p, t) {
  const err = canQueue(p, t); if (err) return err;
  const pv = G.pv[p], d = UNITS[t];
  pay(pv.o, d.cost);
  pv.q.push({ t, left: d.time, total: d.time });
  return '';
}
function cancelQueue(p, idx) {
  const pv = G.pv[p], it = pv.q[idx]; if (!it) return;
  refund(pv.o, UNITS[it.t].cost, 0.9); pv.q.splice(idx, 1);
}
function bldCost(b, lvl) { const d = BLD[b], m = Math.pow(lvl, 1.4); const o = {}; for (const k in d.cost) o[k] = Math.round(d.cost[k] * m); return o; }
function bldMax(c, b) { const co = G.C[c]; return Math.min(BLD[b].max, b === 'silo' ? 1 : (3 + Math.floor((co.techs.infra || 0) / 1.5))); }
function canBuild(p, b) {
  const pv = G.pv[p], c = G.C[pv.o];
  if (pv.bq) return 'Идёт строительство';
  const lvl = pv.b[b] + 1;
  if (lvl > bldMax(pv.o, b)) return 'Максимальный уровень';
  if (b === 'naval' && !isCoastal(p)) return 'Нужен выход к морю';
  if (b === 'silo' && !(c.techs.rockets >= 2)) return 'Нужно: Ракетостроение ур.2';
  if (b !== 'infra' && b !== 'eco' && pv.b.infra < Math.min(2, lvl) && lvl > 1) return 'Нужна инфраструктура ур. ' + Math.min(2, lvl);
  if (pv.since > -9000 && (G.hour - pv.since) < 24 * 5) return 'Провинция недавно захвачена';
  if (!canAfford(c.id, bldCost(b, lvl))) return 'Не хватает ресурсов';
  return '';
}
function startBuild(p, b) {
  const err = canBuild(p, b); if (err) return err;
  const pv = G.pv[p], lvl = pv.b[b] + 1;
  pay(pv.o, bldCost(b, lvl));
  const t = Math.round(BLD[b].time * Math.pow(lvl, 0.75));
  pv.bq = { b, lvl, left: t, total: t };
  return '';
}
function cancelBuild(p) { const pv = G.pv[p]; if (!pv.bq) return; refund(pv.o, bldCost(pv.bq.b, pv.bq.lvl), 0.9); pv.bq = null; }

function researchCost(c, kind, id, lvl) { return techCost(kind, id, lvl); }
function researchOptions(c) {
  const co = G.C[c], out = [];
  for (const u of UNIT_ORDER) {
    const g = co.gen[u];
    if (g >= MAX_GEN) continue;
    if (UNITS[u].tech && (co.techs[UNITS[u].tech[0]] || 0) < UNITS[u].tech[1]) continue;
    out.push({ k: 'u', id: u, lvl: g + 1, br: UNIT_BRANCH(u) });
  }
  for (const t in TECHS) {
    const l = co.techs[t] || 0; if (l >= TECHS[t].max) continue;
    if (TECHS[t].need && TECHS[t].need.some(([x, y]) => (co.techs[x] || 0) < y)) continue;
    out.push({ k: 't', id: t, lvl: l + 1, br: TECHS[t].br });
  }
  return out;
}
function startResearch(c, kind, id, lvl) {
  const co = G.C[c];
  const opt = researchOptions(c).find(o => o.k === kind && o.id === id && o.lvl === lvl);
  if (!opt) return 'Недоступно';
  if (co.rs[opt.br]) return 'Ветка занята';
  const cost = techCost(kind, id, lvl);
  if (!canAfford(c, cost)) return 'Не хватает ресурсов';
  pay(c, cost);
  const total = techDays(kind, id, lvl) * 24;
  co.rs[opt.br] = { k: kind, id, lvl, left: total, total };
  return '';
}

function upgradeCost(u) { const c = {}, d = UNITS[u.t]; for (const k in d.cost) if (k !== 'p') c[k] = d.cost[k] * 0.45 * (G.C[u.o].gen[u.t] - u.g); return c; }
function canUpgrade(u) { return u.g < G.C[u.o].gen[u.t] && u.loc < P && G.pv[u.loc].o === u.o && (u.st === 'idle' || u.st === 'base'); }
function upgradeUnits(ids) {
  let n = 0, fail = 0;
  for (const id of ids) {
    const u = G.U.get(id); if (!u || !canUpgrade(u)) continue;
    const cost = upgradeCost(u);
    if (!canAfford(u.o, cost)) { fail++; continue; }
    pay(u.o, cost); u.g = G.C[u.o].gen[u.t]; n++;
  }
  return { n, fail };
}

/* ---------- movement ---------- */
function canEnter(c, p) {
  const o = G.pv[p].o;
  return o === c || G.war[c * NC + o] || areAllied(c, o) || G.acc[o * NC + c] === 1;
}
function legAllowed(u, from, to) {
  const dom = UNITS[u.t].dom;
  if (dom === 'land') return from < P && to < P && ADJL[from].indexOf(to) >= 0 && canEnter(u.o, to);
  if (dom === 'sea') {
    if (ADJS[from].indexOf(to) < 0) return false;
    if (from >= P && to >= P) return true;
    const p = from < P ? from : to;
    return canEnter(u.o, p);
  }
  return false;
}
/* Dijkstra on the location graph for a unit. Returns array of locs (excluding start), or null */
function findPath(u, from, to) {
  if (to < 0 || to >= N || from < 0) return null;
  if (from === to) return [];
  const dom = UNITS[u.t].dom;
  const spd = ustat(u).spd;
  const D = new Float32Array(N).fill(1e9), prev = new Int16Array(N).fill(-1), done = new Uint8Array(N);
  D[from] = 0;
  const heap = [[0, from]];
  const push = (d, n) => { heap.push([d, n]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break;[heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const popH = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (; ;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break;[heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  while (heap.length) {
    const [d, v] = popH();
    if (done[v]) continue; done[v] = 1;
    if (v === to) break;
    const nb = dom === 'land' ? ADJL[v] : ADJS[v];
    for (let i = 0; i < nb.length; i++) {
      const n = nb[i];
      if (done[n]) continue;
      if (!legAllowed(u, v, n)) continue;
      let cost = dist(v, n) / spd;
      if (dom === 'land') cost *= TERRAIN[PROV[n].terr].mv / (1 + 0.12 * G.pv[n].b.infra);
      const nd = d + cost;
      if (nd < D[n]) { D[n] = nd; prev[n] = v; push(nd, n); }
    }
  }
  if (prev[to] < 0) return null;
  const path = []; let c = to; while (c !== from) { path.push(c); c = prev[c]; }
  return path.reverse();
}
function orderMove(ids, dest) {
  let n = 0, fail = 0;
  for (const id of ids) {
    const u = G.U.get(id); if (!u) continue;
    const dom = UNITS[u.t].dom;
    if (dom === 'air' || dom === 'msl') continue;
    if (u.st === 'cargo') continue;
    const from = u.loc;
    let path = findPath(u, from, dest);
    if (!path) { fail++; continue; }
    if (u.leg && (path.length === 0 || path[0] !== u.leg.to)) {
      // turn around mid-leg
      u.leg = { fx: u.leg.fx + (u.leg.tx - u.leg.fx) * u.leg.done / u.leg.d, fy: u.leg.fy + (u.leg.ty - u.leg.fy) * u.leg.done / u.leg.d, tx: lx(from), ty: ly(from), d: Math.max(0.1, u.leg.done), done: 0, to: from, back: true };
      path = [from].concat(path);
    }
    u.path = path; u.lock = false;
    u.st = path.length || u.leg ? 'move' : 'idle';
    n++;
  }
  return { n, fail };
}
function stopUnits(ids) { for (const id of ids) { const u = G.U.get(id); if (!u) continue; if (u.st === 'move') { u.path = u.leg ? [u.leg.to] : []; if (!u.leg) u.st = 'idle'; } } }
function hostileAt(u, loc) {
  const a = G.at[loc];
  for (let i = 0; i < a.length; i++) { const e = G.U.get(a[i]); if (e && e.o !== u.o && G.war[u.o * NC + e.o] && e.st !== 'base' && e.st !== 'cargo' && UNITS[e.t].dom !== 'msl') return true; }
  return false;
}
function movementTick() {
  for (const [, u] of G.U) {
    if (u.st !== 'move') continue;
    if (u.lock) { if (hostileAt(u, u.loc)) continue; u.lock = false; }
    if (!u.leg) {
      const to = u.path[0];
      if (to === undefined) { u.st = 'idle'; continue; }
      if (!legAllowed(u, u.loc, to)) { u.path = []; u.st = 'idle'; continue; }
      u.leg = { fx: lx(u.loc), fy: ly(u.loc), tx: lx(to), ty: ly(to), d: dist(u.loc, to), done: 0, to };
    }
    const L = u.leg; const dom = UNITS[u.t].dom;
    let spd = ustat(u).spd;
    if (dom === 'land') spd *= (1 + 0.12 * G.pv[L.to < P ? L.to : u.loc].b.infra) / TERRAIN[PROV[L.to < P ? L.to : u.loc].terr].mv;
    if (u.mor < 30) spd *= 0.8;
    L.done += spd;
    if (L.done >= L.d) {
      const to = L.to;
      place(u, to); u.leg = null;
      if (u.path[0] === to) u.path.shift();
      if (u.cargo.length) for (const cid of u.cargo) { const cu = G.U.get(cid); if (cu) cu.loc = to; }
      if (!u.path.length) { u.st = 'idle'; if (dom === 'sea' && to < P) onDock(u, to); }
      if (u.st === 'move' && hostileAt(u, to)) { u.lock = true; }
    }
  }
}
function onDock(u, p) {
  if (u.t !== 'transport' && u.t !== 'carrier') return;
  if (!u.cargo.length) return;
  // transports unload automatically in friendly provinces; carriers keep their air wing
  if (u.t === 'transport') unloadAll(u, p);
}
function unloadAll(u, p) {
  const ids = u.cargo.slice(); u.cargo = [];
  const hostile = G.pv[p].o !== u.o && !areAllied(u.o, G.pv[p].o);
  for (const id of ids) {
    const cu = G.U.get(id); if (!cu) continue;
    cu.st = 'idle'; cu.carrier = 0; cu.loc = u.loc; G.at[p].push(cu.id);
    if (hostile) cu.mor = Math.max(30, cu.mor - 15);
    if (cu.loc !== p) cu.loc = p;
  }
  if (ids.length) note(u.o, 'land', `Высадка войск: ${PROV[p].name}`, p);
}
function loadOnTransport(tid, ids) {
  const t = G.U.get(tid); if (!t || t.t !== 'transport' || t.loc >= P) return 0;
  let n = 0;
  for (const id of ids) {
    if (t.cargo.length >= UNITS.transport.cap) break;
    const u = G.U.get(id); if (!u || u.o !== t.o || u.loc !== t.loc || UNITS[u.t].dom !== 'land' || u.st === 'cargo' || u.st === 'move') continue;
    atRemove(u); u.st = 'cargo'; u.carrier = t.id; u.path = []; t.cargo.push(u.id); n++;
  }
  return n;
}
function loadOnCarrier(cid, ids) {
  const t = G.U.get(cid); if (!t || t.t !== 'carrier') return 0;
  let n = 0;
  for (const id of ids) {
    if (t.cargo.length >= UNITS.carrier.cap) break;
    const u = G.U.get(id); if (!u || u.o !== t.o || UNITS[u.t].dom !== 'air' || u.st !== 'base' || u.loc !== t.loc) continue;
    atRemove(u); u.st = 'cargo'; u.carrier = t.id; u.bs = -t.id; t.cargo.push(u.id); n++;
  }
  return n;
}
function unloadCargo(tid, p) { const t = G.U.get(tid); if (!t) return; if (t.t === 'transport' && t.loc < P) unloadAll(t, t.loc); else if (t.t === 'transport') { /* adjacent landing */ if (p !== undefined && p < P && ADJS[t.loc].indexOf(p) >= 0) { t.st = 'move'; t.path = [p]; } } }

/* ---------- aviation & missiles ---------- */
function unitPos(u) {
  if (u.st === 'out' || u.st === 'back') { const f = u.fl; const k = f.d > 0 ? f.done / f.d : 1; return [f.fx + (f.tx - f.fx) * k, f.fy + (f.ty - f.fy) * k]; }
  if (u.leg) { const k = u.leg.done / u.leg.d; return [u.leg.fx + (u.leg.tx - u.leg.fx) * k, u.leg.fy + (u.leg.ty - u.leg.fy) * k]; }
  if (u.st === 'cargo') { const c = G.U.get(u.carrier); if (c) return unitPos(c); }
  return [lx(u.loc), ly(u.loc)];
}
function basePos(u) { if (u.bs >= 0) return [lx(u.bs), ly(u.bs)]; const c = G.U.get(-u.bs); return c ? unitPos(c) : null; }
function orderAir(ids, tgt, mission) {
  let n = 0; const fails = [];
  for (const id of ids) {
    const u = G.U.get(id); if (!u) continue;
    const d = UNITS[u.t];
    if (d.dom !== 'air') continue;
    if (u.st !== 'base' && u.st !== 'cargo') continue;
    if (u.hp < 35) continue;
    const bp = basePos(u); if (!bp) continue;
    const dd = Math.hypot(bp[0] - lx(tgt), bp[1] - ly(tgt));
    if (dd > d.rng) { fails.push('range'); continue; }
    if (u.bs >= 0 && G.pv[u.bs].dmg > 85) { fails.push('base'); continue; }
    // launch
    if (u.st === 'base') atRemove(u); else { const c = G.U.get(u.carrier); if (c) { const i = c.cargo.indexOf(u.id); if (i >= 0) c.cargo.splice(i, 1); } u.carrier = 0; }
    u.st = 'out'; u.tgt = tgt; u.mission = mission; u.fl = { fx: bp[0], fy: bp[1], tx: lx(tgt), ty: ly(tgt), d: dd, done: 0 }; u.fuel = d.fuel;
    n++;
  }
  return { n, fails };
}
function fireMissile(ids, tgt) {
  let n = 0;
  for (const id of ids) {
    const u = G.U.get(id); if (!u) continue; const d = UNITS[u.t];
    if (d.dom !== 'msl' || u.st !== 'base') continue;
    const dd = Math.hypot(lx(u.loc) - lx(tgt), ly(u.loc) - ly(tgt));
    if (dd > d.rng) continue;
    const to = tgt < P ? G.pv[tgt].o : -1;
    if (to >= 0 && !G.war[u.o * NC + to]) continue;
    atRemove(u); u.st = 'out'; u.tgt = tgt; u.mission = 'msl'; u.fl = { fx: lx(u.loc), fy: ly(u.loc), tx: lx(tgt), ty: ly(tgt), d: dd, done: 0 };
    if (d.nuke) news('nuke', `⚠ ${G.C[u.o].n} запустила ядерную ракету по цели: ${locName(tgt)}!`, tgt, [u.o], 'g');
    n++;
  }
  return n;
}
function returnToBase(u) {
  const bp = basePos(u);
  let base = u.bs;
  const ok = b => b >= 0 && G.pv[b].b.airfield > 0 && G.pv[b].dmg < 90 && (G.pv[b].o === u.o || areAllied(u.o, G.pv[b].o)) && (basedAir(b) < airCapacity(b));
  const cur = u.st === 'out' || u.st === 'back' ? [u.fl.fx + (u.fl.tx - u.fl.fx) * (u.fl.done / Math.max(1, u.fl.d)), u.fl.fy + (u.fl.ty - u.fl.fy) * (u.fl.done / Math.max(1, u.fl.d))] : [lx(u.loc), ly(u.loc)];
  if (u.bs >= 0 && !ok(u.bs) && G.pv[u.bs].b.airfield <= 0) base = -1;
  else if (u.bs >= 0 && !ok(u.bs) && (G.pv[u.bs].o !== u.o && !areAllied(u.o, G.pv[u.bs].o))) base = -1;
  if (base < 0 && !(u.bs < 0 && G.U.has(-u.bs))) {
    let best = -1, bd = 1e9;
    for (const p of G.C[u.o].provs) if (ok(p)) { const d = Math.hypot(lx(p) - cur[0], ly(p) - cur[1]); if (d < bd) { bd = d; best = p; } }
    if (best < 0) { killUnit(u); return; }
    base = best;
  }
  u.bs = base;
  const tp = base >= 0 ? [lx(base), ly(base)] : unitPos(G.U.get(-base));
  if (u.st === 'patrol' || u.st === 'strike') { atRemove(u); }
  u.st = 'back'; u.fl = { fx: cur[0], fy: cur[1], tx: tp[0], ty: tp[1], d: Math.hypot(tp[0] - cur[0], tp[1] - cur[1]), done: 0 };
}
function flightTick() {
  for (const [, u] of G.U) {
    const d = UNITS[u.t];
    if (d.dom !== 'air' && d.dom !== 'msl') continue;
    const st = u.st;
    if (st === 'out' || st === 'back') {
      const spd = d.spd * GEN_SPD[u.g];
      u.fl.done += spd;
      if (d.dom === 'air') u.fuel--;
      if (u.fl.done >= u.fl.d) {
        if (st === 'out') {
          if (d.dom === 'msl') { missileImpact(u); continue; }
          const to = u.tgt < P ? G.pv[u.tgt].o : -1;
          u.loc = u.tgt; u.st = u.mission; u.rounds = 0; G.at[u.loc].push(u.id);
          if (to >= 0 && !G.war[u.o * NC + to] && to !== u.o && !areAllied(u.o, to) && u.mission === 'strike') returnToBase(u);
        } else {
          // landing
          if (u.bs < 0) { const c = G.U.get(-u.bs); if (c && c.cargo.length < UNITS.carrier.cap) { u.st = 'cargo'; u.carrier = c.id; c.cargo.push(u.id); u.loc = c.loc; continue; } else { returnToBase(u); continue; } }
          const p = u.bs;
          if (G.pv[p].b.airfield <= 0 || (G.pv[p].o !== u.o && !areAllied(u.o, G.pv[p].o))) { returnToBase(u); continue; }
          u.loc = p; u.st = 'base'; G.at[p].push(u.id); u.fuel = d.fuel;
        }
      }
    } else if (st === 'patrol' || st === 'strike') {
      u.fuel--; u.rounds++;
      const home = basePos(u) || [lx(u.loc), ly(u.loc)];
      const back = Math.hypot(home[0] - lx(u.loc), home[1] - ly(u.loc)) / (d.spd * GEN_SPD[u.g]);
      if ((st === 'strike' && u.rounds >= 3) || u.fuel <= back + 1.5 || u.hp < 30) returnToBase(u);
    } else if (st === 'base') {
      const b = u.bs >= 0 ? G.pv[u.bs] : null;
      if (u.hp < 100 && b && b.b.airfield > 0) u.hp = Math.min(100, u.hp + 1.2);
      if (b && (b.b.airfield <= 0 || (b.o !== u.o && !areAllied(u.o, b.o)))) { if (d.dom === 'air') { u.st = 'back'; u.loc = u.bs; atRemove(u); u.fl = { fx: lx(u.loc), fy: ly(u.loc), tx: lx(u.loc), ty: ly(u.loc), d: 0, done: 0 }; returnToBase(u); } }
    }
  }
}
function missileImpact(u) {
  const d = UNITS[u.t], tgt = u.tgt;
  const pv = tgt < P ? G.pv[tgt] : null;
  let owner = pv ? pv.o : -1;
  // interception
  let chance = 0;
  if (pv) {
    const oc = G.C[owner];
    chance += pv.b.aa * (0.06 + 0.05 * (oc.techs.abm || 0)) * (1 - pv.dmg / 130);
    for (const id of G.at[tgt]) { const e = G.U.get(id); if (e && e.t === 'aa' && !G.war[e.o * NC + u.o] === true && (e.o === owner || areAllied(e.o, owner))) chance += 0.05 * (e.hp / 100); }
    if (d.nuke) chance = (oc.techs.abm || 0) > 0 ? chance * 0.9 : chance * 0.1;
  }
  chance = clamp(chance, 0, 0.85);
  G.fx.push({ t: 'msl', x: lx(tgt), y: ly(tgt), h: G.hour, n: !!d.nuke });
  if (R() < chance) { G.fx.push({ t: 'int', x: lx(tgt), y: ly(tgt), h: G.hour }); note(owner, 'defense', `Ракета перехвачена над: ${locName(tgt)}`, tgt); killUnit(u); return; }
  const k = ustat(u).atk;
  const victims = G.at[tgt].map(id => G.U.get(id)).filter(e => e && e.st !== 'cargo');
  if (d.nuke) {
    for (const e of victims) { e.hp -= rr(80, 105); if (e.hp <= 0) killUnit(e, u.o); }
    if (pv) {
      pv.dmg = 100; pv.fall = 0.75; pv.pop = Math.round(pv.pop * 0.55);
      for (const b of ['infra', 'factory', 'barracks', 'airfield', 'naval', 'aa', 'radar', 'eco', 'fort']) pv.b[b] = Math.max(0, pv.b[b] - 2);
      pv.q = []; G.C[owner].dirty = true;
      for (const o of G.C) { if (!o.alive || o.id === u.o) continue; const i = o.id * NC + u.o; G.rel[i] = G.rel[u.o * NC + o.id] = clamp(G.rel[i] - (o.id === owner ? 60 : 25), -100, 100); }
      G.stats.nukes++;
      news('nuke', `☢ ЯДЕРНЫЙ УДАР! ${G.C[u.o].n} → ${PROV[tgt].name} (${G.C[owner].n})`, tgt, [u.o, owner], 'g');
    }
    G.fx.push({ t: 'nuke', x: lx(tgt), y: ly(tgt), h: G.hour });
  } else {
    for (const e of victims) {
      if (!G.war[u.o * NC + e.o]) continue;
      const cls = UNITS[e.t].cls; const w = d.a[cls === 'soft' ? 's' : cls === 'hard' ? 'h' : cls === 'air' ? 'a' : 'n'];
      if (!w) continue;
      e.hp -= w * 0.55 * k * rr(0.7, 1.3) * 100 / (100 + 14 * ustat(e).arm) * (e.st === 'base' ? 1.4 : 1);
      if (e.hp <= 0) killUnit(e, u.o);
    }
    if (pv && G.war[u.o * NC + owner]) pv.dmg = Math.min(100, pv.dmg + d.a.x * 0.3 * k * 0.5);
    if (pv) G.C[owner].dirty = true;
    note(owner, 'attack', `Ракетный удар по ${locName(tgt)}!`, tgt);
  }
  killUnit(u);
}

/* ---------- combat ---------- */
function armyPower(c) {
  let p = 0;
  for (const [, u] of G.U) {
    if (u.o !== c) continue;
    const d = UNITS[u.t]; if (d.dom === 'msl' && !d.nuke) continue;
    const a = Math.max(d.a.s, d.a.h, d.a.a, d.a.n, d.a.x * 0.6);
    p += a * (0.3 + 0.7 * u.hp / 100) * GEN_ATK[u.g] * (1 + 0.08 * (d.arm + GEN_ARM[u.g])) * (d.dom === 'msl' ? 4 : 1);
  }
  return p;
}
const KDMG = 0.95;
function sameSide(a, b) { return a === b || areAllied(a, b); }
function combatTick() {
  G.bat = G.bat || new Map();
  for (let loc = 0; loc < N; loc++) {
    const ids = G.at[loc];
    if (ids.length < 2) continue;
    fightAt(loc);
  }
}
function wkey(cls) { return cls === 'soft' ? 's' : cls === 'hard' ? 'h' : cls === 'air' ? 'a' : 'n'; }
function fightAt(loc) {
  const ids = G.at[loc];
  const arena = [], vict = [];
  let owners = 0, first = -1, multi = false;
  for (let i = 0; i < ids.length; i++) {
    const u = G.U.get(ids[i]); if (!u || u.st === 'cargo') continue;
    const d = UNITS[u.t];
    if (d.dom === 'msl') continue;
    if (first < 0) first = u.o; else if (u.o !== first) multi = true;
    const inArena = d.dom !== 'air' || u.st === 'patrol' || u.st === 'strike' || (u.st === 'base' && u.t === 'fighter' && u.hp > 30);
    if (inArena) arena.push(u);
    vict.push(u);
  }
  if (!multi) return;
  // is there any war pair?
  let war = false;
  for (let i = 0; i < arena.length && !war; i++) for (let j = 0; j < vict.length; j++) if (G.war[arena[i].o * NC + vict[j].o]) { war = true; break; }
  if (!war) return;
  const pv = loc < P ? G.pv[loc] : null;
  const dmgMap = new Map();
  const terr = pv ? TERRAIN[PROV[loc].terr].def : 1;
  const bonusFort = pv ? 1 + 0.12 * pv.b.fort : 1;
  const hasAA = [];
  // AA building fire
  if (pv && pv.b.aa > 0 && !pv.fall) {
    const enemies = arena.filter(e => (e.st === 'patrol' || e.st === 'strike') && G.war[pv.o * NC + e.o]);
    for (let s = 0; s < Math.min(3, Math.ceil(pv.b.aa / 2)) && enemies.length; s++) {
      const e = pick(enemies); const dm = pv.b.aa * 3.6 * rr(0.6, 1.3) * (1 - pv.dmg / 130) * 100 / (100 + 14 * ustat(e).arm);
      dmgMap.set(e, (dmgMap.get(e) || 0) + dm);
    }
  }
  for (const a of arena) {
    const ad = UNITS[a.t];
    const st = ustat(a);
    let tries = 0, tgt = null, w = 0;
    while (tries++ < 6) {
      const e = vict[(R() * vict.length) | 0];
      if (e === a || !G.war[a.o * NC + e.o]) continue;
      const ed = UNITS[e.t];
      let key = wkey(ed.cls);
      if (e.st === 'base' && ed.dom === 'air') { if (ad.dom === 'land' && a.t !== 'aa') { key = 'h'; } else key = 'a'; }
      let ww = ad.a[key];
      if (ed.dom === 'sea' && ed.stealth && ad.sub !== undefined || (ed.stealth && ed.dom === 'sea')) {
        // submarines: need detection
        const detect = clamp(1 - ed.stealth + (ad.sub || 0) * 0.012 + (e.reveal > G.hour ? 1 : 0), 0, 1);
        if (R() > detect) continue;
        if (ad.sub) ww = Math.max(ww, ad.sub);
      }
      if (ad.dom === 'sea' && ed.dom === 'sea' && ad.sub && ed.stealth) ww = ad.sub;
      if (!ww || ww <= 0) continue;
      if (ed.backline && ad.dom === 'land' && R() < 0.6) continue;
      if (a.st === 'base' && ad.dom === 'air' && ed.dom !== 'air') continue; // grounded fighters only meet air
      if (a.st === 'base' && a.t === 'fighter' && !(ed.dom === 'air' && (e.st === 'strike' || e.st === 'patrol'))) continue;
      tgt = e; w = ww; break;
    }
    if (!tgt) continue;
    let dm = w * KDMG * st.atk * (0.35 + 0.65 * a.hp / 100) * (0.6 + 0.4 * a.mor / 100) * rr(0.75, 1.25);
    const te = ustat(tgt);
    dm *= 100 / (100 + 14 * te.arm);
    if (tgt.st === 'base' && UNITS[tgt.t].dom === 'air') dm *= 1.4;
    if (pv && UNITS[tgt.t].dom === 'land' && sameSide(tgt.o, pv.o)) dm /= terr * bonusFort;
    if (pv && UNITS[a.t].dom === 'land' && sameSide(a.o, pv.o)) dm *= 1.0;
    if (pv && ad.dom === 'land' && G.war[a.o * NC + pv.o] && (a.mor > 0) && a.st === 'idle' && false) dm *= 1;
    dmgMap.set(tgt, (dmgMap.get(tgt) || 0) + dm);
    // building damage by bombers & artillery
    if (pv && ad.a.x > 0 && G.war[a.o * NC + pv.o] && (ad.dom === 'air' || ad.dom === 'land' && ad.backline)) pv.dmg = Math.min(100, pv.dmg + ad.a.x * 0.012 * (a.hp / 100) * (ad.dom === 'air' ? 1 : 0.4));
    if (tgt.st !== 'base') tgt.reveal = G.hour + 3;
  }
  G.bat.set(loc, G.hour);
  G.stats.battles++;
  for (const [e, dm] of dmgMap) {
    e.hp -= dm; e.mor = Math.max(0, e.mor - dm * 0.45);
    if (e.hp <= 0) {
      const by = arena.find(a => G.war[a.o * NC + e.o]);
      if (pv) note(e.o, 'loss', `${UNITS[e.t].n} уничтожен: ${PROV[loc].name}`, loc);
      killUnit(e, by ? by.o : undefined);
      G.fx.push({ t: 'boom', x: lx(loc) + rr(-5, 5), y: ly(loc) + rr(-5, 5), h: G.hour });
    }
  }
  // morale effects & retreat
  for (const e of vict) {
    if (!G.U.has(e.id)) continue;
    const d = UNITS[e.t];
    if (d.dom === 'land' && e.mor < 12 && e.hp < 45 && e.st !== 'cargo') retreat(e);
    else if (d.dom === 'sea' && e.hp < 20 && loc >= P) retreat(e);
  }
  if (G.fx.length > 300) G.fx.splice(0, 100);
  // regain morale slowly in combat for the winner handled in captureTick
}
function retreat(u) {
  const dom = UNITS[u.t].dom;
  if (dom === 'land') {
    let best = -1, bs = -1e9;
    for (const n of ADJL[u.loc]) {
      if (!sameSide(u.o, G.pv[n].o) && !G.war[u.o * NC + G.pv[n].o] === false) continue;
      if (G.pv[n].o !== u.o && !areAllied(u.o, G.pv[n].o)) continue;
      if (hostileAt(u, n)) continue;
      const s = (G.pv[n].o === u.o ? 2 : 0) + R();
      if (s > bs) { bs = s; best = n; }
    }
    if (best >= 0) { u.mor = 25; u.path = [best]; u.st = 'move'; u.lock = false; u.leg = null; }
  } else if (dom === 'sea') {
    for (const n of ADJS[u.loc]) { if (n >= P && !hostileAt(u, n)) { u.path = [n]; u.st = 'move'; u.lock = false; u.leg = null; return; } }
  }
}

/* ---------- capture ---------- */
function captureTick() {
  for (let p = 0; p < P; p++) {
    const ids = G.at[p]; const pv = G.pv[p];
    if (!ids.length && !pv.cap) continue;
    const cnt = {}; let defenders = 0;
    const owner = pv.o;
    let any = false;
    for (let i = 0; i < ids.length; i++) {
      const u = G.U.get(ids[i]); if (!u) continue;
      const d = UNITS[u.t]; if (d.dom !== 'land' || u.st === 'cargo') continue;
      if (u.o === owner || areAllied(u.o, owner) && !G.war[u.o * NC + owner]) { defenders++; continue; }
      if (G.war[u.o * NC + owner]) { cnt[u.o] = (cnt[u.o] || 0) + u.hp / 100; any = true; }
    }
    if (any && !defenders) {
      // other wars among attackers?
      let by = -1, bc = 0; for (const k in cnt) if (cnt[k] > bc) { bc = cnt[k]; by = +k; }
      let contested = false;
      for (const k in cnt) if (+k !== by && G.war[by * NC + (+k)]) contested = true;
      if (!contested) {
        if (!pv.cap || pv.cap.by !== by) { pv.cap = { by, prog: 0 }; note(owner, 'attack', `⚠ ${G.C[by].n} штурмует ${PROV[p].name}!`, p); }
        pv.cap.prog += (1.7 + 1.3 * bc) / (1 + 0.08 * pv.b.infra + 0.25 * pv.b.fort);
        if (pv.cap.prog >= 100) captureProv(p, by);
        continue;
      }
    }
    if (pv.cap) { pv.cap.prog -= 4; if (pv.cap.prog <= 0) pv.cap = null; }
    // morale regen for idle units at home
    if (G.bat.get(p) !== G.hour) for (let i = 0; i < ids.length; i++) { const u = G.U.get(ids[i]); if (u && u.mor < 100) u.mor = Math.min(100, u.mor + (u.o === owner ? 0.8 : 0.3)); }
  }
  // naval morale + repair in port
  for (const [, u] of G.U) {
    if (UNITS[u.t].dom === 'sea' && u.loc < P && G.pv[u.loc].b.naval > 0 && u.hp < 100 && G.pv[u.loc].o === u.o) u.hp = Math.min(100, u.hp + 0.7);
    else if (UNITS[u.t].dom === 'land' && u.hp < 100 && u.st !== 'move' && G.pv[u.loc] && (G.pv[u.loc].o === u.o) && !G.C[u.o].short.supp) u.hp = Math.min(100, u.hp + 0.12 + 0.05 * G.pv[u.loc].b.barracks);
    if (G.C[u.o].short.food || G.C[u.o].short.supp) { u.mor = Math.max(5, u.mor - 0.12); }
  }
}
function captureProv(p, by) {
  const pv = G.pv[p], old = pv.o;
  if (old === by) return;
  const O = G.C[old], X = G.C[by];
  O.provs.splice(O.provs.indexOf(p), 1); X.provs.push(p);
  G.ownVer = (G.ownVer || 0) + 1;
  pv.o = by; pv.since = G.hour; pv.cap = null; pv.q = []; pv.bq = null; pv.dmg = Math.min(100, pv.dmg + 20);
  for (const b of ['factory', 'airfield', 'naval', 'silo', 'barracks', 'aa']) if (pv.b[b] > 0 && R() < 0.4) pv.b[b]--;
  for (const id of G.at[p].slice()) { const u = G.U.get(id); if (!u) continue; const d = UNITS[u.t]; if (u.o === old || (areAllied(u.o, old) && G.war[u.o * NC + by])) { if (d.dom !== 'land') killUnit(u, by); } }
  // aircraft that were based here are lost on ground; flying ones will relocate
  for (const [, u] of G.U) if (u.bs === p && u.st === 'base') { /* already handled above */ }
  O.dirty = X.dirty = true;
  O.stats.lost++; X.stats.taken++;
  G.wlost[old * NC + by]++;
  X.res.cash += pv.cashBase * 6;
  news('capture', `${X.n} захватила ${PROV[p].name} (${O.n})`, p, [by, old], (inv(by) || inv(old)) ? 'p' : '');
  if (p === O.cap) { news('capital', `${O.n} потеряла столицу ${PROV[p].name}!`, p, [old, by], 'g'); pickCapital(O); }
  if (!O.provs.length) eliminate(old, by);
}
function pickCapital(c) {
  let best = -1, bp = -1;
  for (const p of c.provs) if (PROV[p].pop > bp) { bp = PROV[p].pop; best = p; }
  if (best >= 0) { c.cap = best; }
}
function eliminate(c, by) {
  const C = G.C[c]; if (!C.alive) return;
  C.alive = false; G.ownVer = (G.ownVer || 0) + 1;
  for (const [, u] of Array.from(G.U)) if (u.o === c) killUnit(u);
  if (C.alliance >= 0) { const al = G.al[C.alliance]; al.members = al.members.filter(m => m !== c); if (al.leader === c && al.members.length) al.leader = al.members[0]; C.alliance = -1; }
  for (let o = 0; o < NC; o++) { G.war[c * NC + o] = G.war[o * NC + c] = 0; }
  news('elim', `${C.n} прекратила существование.`, -1, [c], 'g');
  if (c === G.player && !G.over) G.over = { win: false, text: 'Ваше государство разгромлено.' };
}
function checkVictory() {
  if (G.over) return;
  // alliance (or country) victory points
  const p = G.C[G.player];
  const members = p.alliance >= 0 ? G.al[p.alliance].members : [G.player];
  let vp = 0; for (const m of members) vp += G.C[m].vp;
  G.myVP = vp;
  if (vp >= G.totalVP * G.opts.win) G.over = { win: true, text: `Ваш ${p.alliance >= 0 ? 'альянс' : 'мир'} контролирует ${Math.round(vp / G.totalVP * 100)}% победных очков мира.` };
  if (G.over) return;
  // hostile alliance wins -> defeat
  for (const al of G.al) {
    if (p.alliance === al.id) continue;
    let v = 0; for (const m of al.members) v += G.C[m].vp;
    if (v >= G.totalVP * G.opts.win) G.over = { win: false, text: `${al.n} захватил мировое господство.` };
  }
}

/* ---------- fog of war ---------- */
function updateVis(force) {
  if (!force && G.hour - G.visHour < 3) return;
  G.visHour = G.hour;
  const vis = G.vis; vis.fill(0);
  const pl = G.C[G.player];
  const friends = []; for (const c of G.C) if (c.alive && (c.id === G.player || areAllied(c.id, G.player))) friends.push(c.id);
  const radar = pl.techs.radar || 0;
  const bfs = (s, depth) => {
    vis[s] = 1; let fr = [s];
    for (let d = 0; d < depth; d++) { const nx = []; for (const v of fr) for (const n of ADJ[v]) if (!vis[n]) { vis[n] = 1; nx.push(n); } fr = nx; if (!fr.length) break; }
  };
  for (const c of friends) for (const p of G.C[c].provs) { bfs(p, 1 + (G.pv[p].b.radar ? G.pv[p].b.radar + (radar >= 2 ? 1 : 0) : 0)); }
  for (const [, u] of G.U) {
    if (!friends.includes(u.o)) continue;
    if (u.st === 'cargo') continue;
    const d = UNITS[u.t];
    if (d.dom === 'msl') continue;
    bfs(u.loc, Math.max(0, d.vis - 1) + (radar >= 3 ? 1 : 0) + (u.st === 'patrol' ? 1 : 0));
  }
}
function isVisible(u) {
  if (G.fogOff) return true;
  if (u.o === G.player || areAllied(u.o, G.player)) return true;
  const d = UNITS[u.t];
  if (d.dom === 'msl') return u.st === 'out';
  if (u.st === 'out' || u.st === 'back') { const p = unitPos(u); return true && G.vis[nearestLoc(p[0], p[1])] === 1; }
  if (u.st === 'cargo') return false;
  if (!G.vis[u.loc]) return false;
  if (d.stealth && !(u.reveal > G.hour)) {
    // visible only with friendly ship/air in the same location
    for (const id of G.at[u.loc]) { const e = G.U.get(id); if (e && (e.o === G.player || areAllied(e.o, G.player)) && (UNITS[e.t].dom === 'sea' && e.t !== 'sub' || UNITS[e.t].dom === 'air')) return true; }
    return false;
  }
  return true;
}
let _nl = null;
function nearestLoc(x, y) {
  let best = 0, bd = 1e18;
  for (let i = 0; i < N; i++) { const d = (lx(i) - x) ** 2 + (ly(i) - y) ** 2; if (d < bd) { bd = d; best = i; } }
  return best;
}
