'use strict';
/* ===== Diplomacy, alliances, trade ===== */
function areAllied(a, b) { if (a === b) return true; const x = G.C[a].alliance; return x >= 0 && x === G.C[b].alliance; }
function atWar(a, b) { return G.war[a * NC + b] === 1; }
function relOf(a, b) { return G.rel[a * NC + b]; }
function addRel(a, b, v) { const i = a * NC + b, j = b * NC + a; G.rel[i] = G.rel[j] = clamp(G.rel[i] + v, -100, 100); }
function warsOf(c) { const o = []; for (let i = 0; i < NC; i++) if (G.war[c * NC + i] && G.C[i].alive) o.push(i); return o; }
function neighborsOf(c) {
  const s = new Set();
  for (const p of G.C[c].provs) for (const a of PROV[p].adj) { const o = G.pv[a].o; if (o !== c) s.add(o); }
  return [...s];
}
function alliancePower(c) {
  const C = G.C[c]; if (C.alliance < 0) return C.pwr || 0;
  let s = 0; for (const m of G.al[C.alliance].members) s += (G.C[m].pwr || 0); return s;
}

function declareWar(a, b, silent) {
  if (a === b || !G.C[a].alive || !G.C[b].alive) return 'invalid';
  if (G.war[a * NC + b]) return 'Уже идёт война';
  if (areAllied(a, b)) return 'Нельзя воевать с союзником';
  if (!silent && pactBetween(a, b)) return 'Действует пакт о ненападении';
  if (!silent && G.truce && G.truce[a * NC + b] > G.hour) return 'Действует перемирие';
  setWar(a, b); if (!silent) bump(a, 'wars');
  if (!silent) news('war', `⚔ ${G.C[a].n} объявляет войну государству ${G.C[b].n}!`, G.C[b].cap, [a, b], 'g');
  addRel(a, b, -60);
  // third parties: defenders join
  const joined = [];
  for (const g of G.campaign?.guarantees || []) if (g.b === b && g.a !== a && g.until > G.hour && G.C[g.a].alive && !areAllied(g.a, a) && !atWar(g.a, a)) { setWar(g.a, a); joined.push(g.a); }
  const defAl = G.C[b].alliance;
  if (defAl >= 0) for (const m of G.al[defAl].members) {
    if (m === b || m === a || !G.C[m].alive || G.war[m * NC + a] || areAllied(m, a)) continue;
    if (relOf(m, a) > 55 || (!silent && R() < 0.22)) continue;
    setWar(m, a); joined.push(m); addRel(m, a, -40);
  }
  const atkAl = G.C[a].alliance;
  if (atkAl >= 0) for (const m of G.al[atkAl].members) {
    if (m === a || !G.C[m].alive || G.war[m * NC + b] || areAllied(m, b)) continue;
    if (silent || relOf(m, b) > 5 || R() > 0.3) continue;
    setWar(m, b); joined.push(m); addRel(m, b, -30);
  }
  if (!silent && joined.length) {
    const sa = joined.filter(m => areAllied(m, a) || G.war[m * NC + b]).map(m => G.C[m].n), sb = joined.filter(m => !(areAllied(m, a) || G.war[m * NC + b])).map(m => G.C[m].n);
    news('join', `В войну вступают. На стороне ${G.C[a].n}: ${sa.join(', ') || '—'}. На стороне ${G.C[b].n}: ${sb.join(', ') || '—'}`, -1, joined, 'g');
  }
  if (!silent) for (const c of G.C) if (c.alive && c.id !== a && c.id !== b && !joined.includes(c.id)) addRel(c.id, a, c.gov === 'democracy' ? -3 : -1);
  return '';
}
function previewWar(a, b) {
  const against = [], withUs = [];
  for (const g of G.campaign?.guarantees || []) if (g.b === b && g.a !== a && g.until > G.hour && G.C[g.a].alive && !areAllied(g.a, a)) against.push(g.a);
  const defAl = G.C[b].alliance;
  if (defAl >= 0) for (const m of G.al[defAl].members) { if (m === b || m === a || !G.C[m].alive || areAllied(m, a)) continue; if (relOf(m, a) > 55) continue; if (!against.includes(m)) against.push(m); }
  const atkAl = G.C[a].alliance;
  if (atkAl >= 0) for (const m of G.al[atkAl].members) { if (m === a || !G.C[m].alive || areAllied(m, b) || relOf(m, b) > 5) continue; withUs.push(m); }
  return { against, withUs };
}
function setWar(a, b) { G.war[a * NC + b] = G.war[b * NC + a] = 1; G.warStart[a * NC + b] = G.warStart[b * NC + a] = G.hour; G.wlost[a * NC + b] = G.wlost[b * NC + a] = 0; }
function makePeace(a, b) {
  if (!G.war[a * NC + b]) return;
  G.war[a * NC + b] = G.war[b * NC + a] = 0;
  if (!G.truce) G.truce = new Int32Array(NC * NC);
  G.truce[a * NC + b] = G.truce[b * NC + a] = G.hour + 24 * 25;
  addRel(a, b, 25);
  expelUnits(a, b); expelUnits(b, a);
  news('peace', `🕊 ${G.C[a].n} и ${G.C[b].n} заключили мир.`, -1, [a, b], 'g');
}
function expelUnits(c, from) {
  // units of c on territory of `from` are moved to the nearest own province
  for (const [, u] of Array.from(G.U)) {
    if (u.o !== c || u.st === 'cargo') continue;
    const dom = UNITS[u.t].dom;
    if (dom === 'msl') continue;
    const inLoc = u.loc < P ? G.pv[u.loc].o === from : false;
    if (!inLoc) continue;
    if (u.st === 'out' || u.st === 'back') continue;
    let best = -1, bd = 1e9;
    for (const p of G.C[c].provs) { if (dom === 'sea' && !isCoastal(p)) continue; const d = dist(p, u.loc); if (d < bd) { bd = d; best = p; } }
    if (best < 0) { killUnit(u); continue; }
    if (dom === 'air') { u.bs = best; if (u.st === 'patrol' || u.st === 'strike') returnToBase(u); else place(u, best); } else { place(u, best); u.path = []; u.leg = null; u.st = 'idle'; }
  }
}
/* AI's reaction to a peace offer */
function aiPeaceEval(b, a) { // b = AI deciding, a = proposer
  const B = G.C[b], A = G.C[a];
  const days = (G.hour - G.warStart[a * NC + b]) / 24;
  if (days < 3) return { ok: false, why: 'Слишком рано для переговоров' };
  const pb = alliancePower(b), pa = alliancePower(a) + 1;
  const ratio = pb / pa;
  const lost = G.wlost[b * NC + a], took = G.wlost[a * NC + b];
  const initial = CTY[b].provs.length;
  let score = personality(B).peace;
  score += (1 - ratio) * 1.5;
  score += (lost - took) * 0.5;
  score += days > 30 ? 0.7 : days / 45;
  score += (1 - B.provs.length / Math.max(1, initial)) * 2;
  score -= (B.agg - 2) * 0.25;
  if (took > lost + 1) score -= 0.8;
  if (score > 0.4) return { ok: true, why: '' };
  return { ok: false, why: score > 0.2 ? 'Противник пока не готов к миру' : 'Противник уверен в победе и отказывается' };
}
function proposePeace(a, b) {
  if (!G.war[a * NC + b]) return { ok: false, why: 'Нет войны' };
  if (!G.C[b].ai) { return { ok: true }; }
  const r = aiPeaceEval(b, a);
  if (r.ok) makePeace(a, b);
  return r;
}

/* alliances */
function createAlliance(c, name) {
  const C = G.C[c]; if (C.alliance >= 0) return 'Вы уже состоите в альянсе';
  const al = { id: G.al.length, n: name || ('Союз ' + C.n), color: C.color, members: [c], leader: c, bloc: '' };
  G.al.push(al); C.alliance = al.id; return '';
}
function leaveAlliance(c, immediate) {
  const C = G.C[c]; if (C.alliance < 0) return;
  if (!immediate && c === G.player && G.campaign) { if (!C.leaveAt) C.leaveAt = G.hour + 72; return; }
  C.leaveAt = 0;
  const al = G.al[C.alliance];
  for (const m of al.members) if (m !== c) { G.acc[c * NC + m] = 0; G.acc[m * NC + c] = 0; addRel(c, m, -15); }
  al.members = al.members.filter(m => m !== c); C.alliance = -1;
  if (al.leader === c && al.members.length) al.leader = al.members[0];
  news('alliance', `${C.n} покидает альянс «${al.n}»`, -1, [c], 'g');
}
function joinAlliance(c, id) {
  const C = G.C[c], al = G.al[id];
  if (C.alliance >= 0) leaveAlliance(c, true);
  for (const m of al.members) { G.acc[c * NC + m] = G.acc[m * NC + c] = 1; }
  al.members.push(c); C.alliance = id;
  // inherit wars of the alliance leader
  news('alliance', `${C.n} вступает в альянс «${al.n}»`, -1, [c], 'g');
}
function allianceInviteEval(c, by) { // would AI country c join the alliance of `by`?
  const C = G.C[c], B = G.C[by];
  if (!C.ai) return { ok: true };
  if (B.alliance < 0) return { ok: false, why: 'Вы не состоите в альянсе' };
  if (C.alliance >= 0 && C.alliance !== B.alliance) return { ok: false, why: 'Уже состоит в другом альянсе' };
  const al = G.al[B.alliance];
  for (const m of al.members) if (G.war[c * NC + m]) return { ok: false, why: 'Воюет с членом альянса' };
  const rel = relOf(c, by);
  let shared = 0; for (const m of al.members) for (const o of warsOf(m)) if (G.war[c * NC + o] || C.rivals.indexOf(G.C[o].key) >= 0) shared++;
  const sc = rel + shared * 10 + (C.bloc === B.bloc && C.bloc !== 'NONE' ? 30 : 0);
  if (sc >= 55) return { ok: true };
  return { ok: false, why: 'Отношения недостаточно тёплые (' + Math.round(rel) + ')' };
}
function inviteToAlliance(by, c) {
  const r = allianceInviteEval(c, by); if (!r.ok) return r;
  joinAlliance(c, G.C[by].alliance); return r;
}
function requestAccess(from, to) { // `from` asks `to` for military access
  if (relOf(from, to) >= 20 || areAllied(from, to)) { G.acc[to * NC + from] = 1; bump(from, 'access'); addRel(from, to, 2); return { ok: true }; }
  return { ok: false, why: 'Отказано. Нужны отношения от +20 (сейчас ' + Math.round(relOf(from, to)) + ')' };
}
function giveGift(a, b, res, qty) {
  if (embargoed(a, b)) return false;
  const A = G.C[a]; if (!(qty > 0) || !isFinite(qty) || A.res[res] < qty) return false;
  A.res[res] -= qty; G.C[b].res[res] += qty;
  const base = { cash: 1, food: 1, supp: 1.6, fuel: 2, comp: 2.2, elec: 4, rare: 6, man: 8 }[res] || 1;
  addRel(a, b, clamp(qty * base / Math.max(60, G.C[b].inc.cash || 100) * 4, 0.3, 8));
  return true;
}

/* market */
const BASE_PRICE = { food: 1, supp: 1.6, fuel: 2, comp: 2.2, elec: 4, rare: 6 };
function priceOf(res, buy) { return BASE_PRICE[res] * G.market.m[res] * (buy ? 1.12 : 0.88); }
function trade(c, res, qty, buy) {
  const C = G.C[c];
  if (!Object.hasOwn(BASE_PRICE, res)) return 'Неизвестный ресурс';
  if (!(qty > 0) || !isFinite(qty)) return 'Количество?';
  if (buy) {
    const cost = priceOf(res, true) * qty;
    if (C.res.cash < cost) return 'Не хватает денег';
    C.res.cash -= cost; C.res[res] += qty; bump(c, 'trades'); G.market.m[res] = Math.min(3, G.market.m[res] + qty / 6000 / (BASE_PRICE[res] > 3 ? 0.5 : 1));
  } else {
    if (C.res[res] < qty) return 'Не хватает ресурса';
    C.res[res] -= qty; C.res.cash += priceOf(res, false) * qty; G.market.m[res] = Math.max(0.4, G.market.m[res] - qty / 6000 / (BASE_PRICE[res] > 3 ? 0.5 : 1));
  }
  return '';
}

/* serialization */
function sparse(a) { const o = []; for (let i = 0; i < a.length; i++) if (a[i]) o.push(i, a[i]); return o; }
function unsparse(s, T) { const a = new T(NC * NC); for (let i = 0; i < s.length; i += 2) a[s[i]] = s[i + 1]; return a; }
function saveGame() {
  const g = G;
  const o = {
    v: SAVE_VERSION, world: WORLD_ID, gameVersion: GAME_VERSION, campaign: g.campaign, autoBuy: g.autoBuy, autoDef: g.autoDef, fogOff: g.fogOff, opts: g.opts, seed: g.seed, rng: g.rng.get(), hour: g.hour, speed: g.speed, player: g.player, tension: g.tension, nextU: g.nextU, market: g.market, stats: g.stats, over: g.over,
    C: g.C.map(c => ({ alive: c.alive, cap: c.cap, res: c.res, techs: c.techs, gen: c.gen, rs: c.rs, alliance: c.alliance, foodScale: c.foodScale, stats: c.stats, provs: c.provs, doc: c.doc, ai: c.ai, ai_s: c.ai_s, pwr: c.pwr, vp: c.vp, inc: c.inc, use: c.use, manCap: c.manCap, foodNeed: c.foodNeed, dirty: c.dirty, cyberCd: c.cyberCd, tax: c.tax, inflation: c.inflation, reserveFuel: c.reserveFuel, reputation: c.reputation, personality: c.personality, lossTypes: c.lossTypes, printUntil: c.printUntil, aidUntil: c.aidUntil, leaveAt: c.leaveAt })),
    pv: g.pv.map(p => ({ o: p.o, b: p.b, bq: p.bq, q: p.q, dmg: p.dmg, cap: p.cap, fall: p.fall, since: p.since, pop: p.pop, cyber: p.cyber || 0, corrupt: p.corrupt || 0, loyalty: p.loyalty, cashBase: p.cashBase })),
    U: Array.from(g.U.values()),
    rel: sparse(g.rel), war: sparse(g.war), acc: sparse(g.acc), warStart: sparse(g.warStart), wlost: sparse(g.wlost), truce: g.truce ? sparse(g.truce) : null,
    al: g.al, goals: g.goalsDone || [], spies: g.spies, spyId: g.spyId, intel: g.intel, news: g.news.slice(-80)
  };
  return JSON.stringify(o);
}
function loadGame(str) {
  const o = JSON.parse(str, (key, value) => { if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Недопустимое поле сохранения'); return value; });
  validateSave(o);
  newGameShell(o.opts);
  G.seed = o.seed; G.rng.set(o.rng); G.hour = o.hour; G.speed = 0; G.paused = true; G.player = o.player; G.tension = o.tension; G.nextU = o.nextU; G.market = o.market; G.stats = o.stats; G.over = o.over;
  o.C.forEach((c, i) => Object.assign(G.C[i], c));
  G.C.forEach((c, i) => { c.ai = o.opts.observer ? true : (o.C[i].ai ?? i !== G.player); });
  o.pv.forEach((p, i) => Object.assign(G.pv[i], p));
  for (const id of G.at) id.length = 0;
  G.U = new Map();
  for (const u of o.U) { G.U.set(u.id, u); if (u.st !== 'cargo' && u.st !== 'out' && u.st !== 'back') G.at[u.loc].push(u.id); }
  G.rel = unsparse(o.rel, Int8Array); G.war = unsparse(o.war, Uint8Array); G.acc = unsparse(o.acc, Uint8Array); G.warStart = unsparse(o.warStart, Int32Array); G.wlost = unsparse(o.wlost, Int16Array); G.truce = o.truce ? unsparse(o.truce, Int32Array) : new Int32Array(NC * NC);
  G.al = o.al; G.goalsDone = o.goals || []; G.spies = o.spies || []; G.spyId = o.spyId || 0; G.intel = o.intel || {}; G.news = o.news; G.newsId = o.news.length ? o.news[o.news.length - 1].id || 0 : 0;
  G.autoBuy = o.autoBuy; G.autoDef = o.autoDef; G.fogOff = o.fogOff;
  initCampaign(o.campaign); applyQuickRules();
  for (const c of G.C) if (c.alive && (o.v === 1 || !c.inc || !c.use)) { c.dirty = true; recalc(c); calcUse(c); }
  G.totalVP = PROV.reduce((a, p) => a + p.vp, 0);
  updateVis(true);
  return G;
}
