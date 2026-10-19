'use strict';
/* Campaign systems. All simulation state lives in G and uses the seeded clock. */
const GAME_VERSION = '0.3.0';
const SAVE_VERSION = 2;
const WORLD_ID = `${P}:${S}:${NC}`;
const PERSONALITIES = {
  cautious: { n: 'Осторожный', aggression: 0.55, threshold: 1.5, peace: 0.3 },
  bold: { n: 'Наступательный', aggression: 1.2, threshold: 1.1, peace: -0.2 },
  trader: { n: 'Торговый', aggression: 0.35, threshold: 1.7, peace: 0.5 },
  balanced: { n: 'Прагматичный', aggression: 0.8, threshold: 1.3, peace: 0.1 }
};
const STANCES = { balanced: 'Манёвр', attack: 'Наступление', defend: 'Оборона', ambush: 'Засада' };
const ARMY_TEMPLATES = {
  assault: { n: 'Ударная группа', units: ['inf', 'inf', 'tank', 'arty', 'aa'] },
  guard: { n: 'Гарнизон', units: ['inf', 'inf', 'aa'] },
  scout: { n: 'Разведгруппа', units: ['recon', 'spec'] },
  escort: { n: 'Морское охранение', units: ['frigate', 'destroyer'] }
};
BLD.depot = { n: 'Склад снабжения', i: '🚚', d: 'Источник снабжения для частей, связанных с ним дружественной территорией. Уязвим к захвату.', cost: { c: 160, m: 35, s: 20 }, time: 36, max: 2 };
BLD_ORDER.push('depot');
SCENARIOS.sandbox = { n: 'Песочница', d: 'Нет начальных войн и самостоятельных объявлений войны ИИ. Можно спокойно освоить экономику.', wars: [], tension: 0 };
DIFF.realism = { n: 'Реализм', aiEco: 1, aiAgg: 1, pace: 1 };

function initCampaign(saved) {
  G.campaign = Object.assign({ pacts: [], guarantees: [], embargoes: [], routes: [], debts: [], reparations: [], objectives: [], reports: [], history: [], groups: [], markers: [], achievements: [], treasury: { days: 3, floor: 300, maxPrice: 1.6, budget: 250 }, decision: null, lastDecision: -1, marketEvent: null }, saved || {});
  for (const c of G.C) {
    if (!Number.isFinite(c.tax)) c.tax = 1;
    if (!Number.isFinite(c.inflation)) c.inflation = 0;
    if (!Number.isFinite(c.reserveFuel)) c.reserveFuel = 0;
    if (!Number.isFinite(c.reputation)) c.reputation = 70;
    if (!PERSONALITIES[c.personality]) c.personality = Object.keys(PERSONALITIES)[c.id % 4];
    if (!c.lossTypes) c.lossTypes = {};
    if (G.opts.observer) c.ai = true;
  }
  for (const pv of G.pv) { if (!Number.isFinite(pv.loyalty)) pv.loyalty = pv.o === PROV[pv.id].c ? 80 : 45; if (!pv.b.depot) pv.b.depot = 0; }
  for (const u of G.U.values()) initVeteran(u);
  G.supply = null;
  updateSupply();
  if (!saved) recordEconomy();
  if (G.opts.observer) G.fogOff = true;
}
function initVeteran(u) {
  if (!Number.isFinite(u.xp)) u.xp = 0;
  if (!Number.isFinite(u.fatigue)) u.fatigue = 0;
  if (!Number.isFinite(u.entrench)) u.entrench = 0;
  if (!STANCES[u.stance]) u.stance = 'balanced';
}
function rankOfUnit(u) { return Math.min(5, Math.floor((u.xp || 0) / 25)); }
function personality(c) { return PERSONALITIES[c.personality] || PERSONALITIES.balanced; }
function weatherAt(p) {
  const region = Math.floor(lx(p) / 180) + Math.floor(ly(p) / 130) * 17;
  const h = Math.imul((G.seed + region * 7919 + Math.floor(G.hour / 48) * 104729) | 0, 1597334677) >>> 0;
  const n = h % 100;
  if (p < P && PROV[p].terr === 'arctic' && n < 65) return { n: 'Снег', i: '❄', move: 0.8, air: 0.85 };
  if (n < 15) return { n: 'Шторм', i: '⛈', move: 0.85, air: 0.75 };
  if (n < 35) return { n: 'Дождь', i: '🌧', move: 0.92, air: 0.9 };
  return { n: 'Ясно', i: '☀', move: 1, air: 1 };
}
function isNight(p) { const local = (G.hour + lx(p) / WORLD.W * 24 + 12) % 24; return local < 6 || local > 20; }
function portBlockaded(c, p) {
  if (!isCoastal(p)) return false;
  let enemy = 0, friendly = 0;
  for (const sea of PROV[p].seas) for (const id of G.at[P + sea]) {
    const u = G.U.get(id); if (!u || UNITS[u.t].dom !== 'sea' || u.t === 'transport' || u.st === 'cargo') continue;
    const power = unitPower(u);
    if (atWar(c, u.o)) enemy += power;
    else if (sameSide(c, u.o)) friendly += power;
  }
  return enemy > friendly + 10;
}
function updateSupply() {
  if (!G.campaign) return;
  const supply = G.supply = Array.from({ length: NC }, () => new Uint8Array(P));
  for (const c of G.C) {
    if (!c.alive) continue;
    const seen = supply[c.id], queue = [];
    for (const p of c.provs) {
      const pv = G.pv[p];
      if (p === c.cap || pv.b.depot > 0 || pv.b.naval > 0 && !portBlockaded(c.id, p)) { seen[p] = 1; queue.push(p); }
    }
    for (let i = 0; i < queue.length; i++) for (const n of ADJL[queue[i]]) {
      if (seen[n] || !isFriendlyProv(c.id, n)) continue;
      seen[n] = 1; queue.push(n);
    }
  }
  G.supplyHour = G.hour; G.supplyVersion = G.ownVer;
}
function supplied(u) {
  if (!G.campaign || G.opts.supply === false || UNITS[u.t].dom !== 'land' || u.st === 'cargo') return true;
  if (!G.supply) updateSupply();
  if (u.loc >= P) return false;
  const seen = G.supply[u.o];
  return !!seen[u.loc] || ADJL[u.loc].some(p => seen[p]);
}
function campaignAttack(u) {
  if (!G.campaign) return 1;
  const dom = UNITS[u.t].dom;
  const stance = u.stance === 'attack' ? 1.12 : u.stance === 'defend' ? 0.9 : u.stance === 'ambush' && u.entrench >= 6 && u.loc < P && ['forest', 'jungle', 'mountain'].includes(PROV[u.loc].terr) ? 1.18 : 1;
  return (1 + rankOfUnit(u) * 0.035) * (1 - (u.fatigue || 0) * 0.002) * stance * (supplied(u) ? 1 : 0.7) * (dom === 'air' ? weatherAt(u.loc).air : 1);
}
function campaignSpeed(u) { return !G.campaign ? 1 : weatherAt(u.loc).move * (supplied(u) ? 1 : 0.7) * (1 - (u.fatigue || 0) * 0.0015); }
function campaignTick() {
  if (!G.campaign) return;
  if (G.hour % 6 === 0 || G.supplyVersion !== G.ownVer) updateSupply();
  for (const u of G.U.values()) {
    initVeteran(u);
    const fighting = G.bat.get(u.loc) === G.hour;
    u.fatigue = clamp(u.fatigue + (fighting ? 1.5 : u.st === 'move' || u.st === 'out' ? 0.3 : -1.5), 0, 100);
    if (fighting) u.xp = Math.min(150, u.xp + 0.6);
    if (u.loc < P && G.pv[u.loc].o === u.o && u.st === 'idle' && !fighting) u.entrench = Math.min(24, u.entrench + 1);
    else u.entrench = 0;
    if (!supplied(u)) u.mor = Math.max(10, u.mor - 0.2);
    if (u.repair && u.hp >= 98) u.repair = false;
    if (u.st === 'idle' && u.waypoints && u.waypoints.length && !fighting) orderMove([u.id], u.waypoints.shift(), true);
  }
  if (G.hour % 24 === 0) campaignDay();
}
function setStance(ids, stance) {
  if (!STANCES[stance]) return 0;
  let n = 0;
  for (const id of ids) { const u = G.U.get(id); if (u && u.o === G.player && UNITS[u.t].dom === 'land') { u.stance = stance; u.hold = stance === 'defend' || stance === 'ambush'; n++; } }
  return n;
}
function sendToRepair(ids) {
  let n = 0;
  for (const id of ids) {
    const u = G.U.get(id); if (!u || u.o !== G.player) continue;
    const dom = UNITS[u.t].dom;
    if (dom === 'air') { if (['strike', 'patrol'].includes(u.st)) { returnToBase(u); n++; } continue; }
    if (!['land', 'sea'].includes(dom) || u.st === 'cargo') continue;
    const bases = G.C[u.o].provs.filter(p => !hostileAt(u, p) && (dom === 'sea' ? G.pv[p].b.naval > 0 : G.pv[p].b.barracks > 0));
    bases.sort((a, b) => dist(u.loc, a) - dist(u.loc, b));
    for (const p of bases) if (orderMove([u.id], p).n) { u.repair = true; u.hold = true; n++; break; }
  }
  return n;
}
function routeETA(u, path) {
  let hours = 0, from = u.loc;
  for (const p of path) { let d = dist(from, p); if (p === u.leg?.to && from === u.loc) d = Math.max(0, u.leg.d - u.leg.done); let v = ustat(u).spd; if (UNITS[u.t].dom === 'land') v *= (1 + 0.12 * G.pv[p].b.infra) / TERRAIN[PROV[p].terr].mv; hours += d / Math.max(0.01, v); from = p; }
  return Math.ceil(hours);
}
function queueTemplate(p, key) {
  if (!ARMY_TEMPLATES[key] || !G.pv[p] || G.pv[p].o !== G.player) return { n: 0, errors: ['Выберите свою провинцию'] };
  const result = { n: 0, errors: [] };
  for (const t of ARMY_TEMPLATES[key].units) { const err = queueUnit(p, t); if (err) result.errors.push(`${UNITS[t].n}: ${err}`); else result.n++; }
  return result;
}
function reorderQueue(p, index, direction) {
  const pv = G.pv[p]; if (!pv || pv.o !== G.player) return false;
  const other = index + direction;
  if (!Number.isInteger(index) || ![-1, 1].includes(direction) || index < 0 || other < 0 || index >= pv.q.length || other >= pv.q.length) return false;
  [pv.q[index], pv.q[other]] = [pv.q[other], pv.q[index]]; return true;
}
function battleReport(loc, arena, damage) {
  if (!G.campaign || !arena.some(u => u.o === G.player) && !G.opts.observer) return;
  let r = G.campaign.reports.find(x => x.loc === loc && G.hour - x.end <= 3);
  if (!r) { r = { loc, start: G.hour, end: G.hour, sides: {}, terrain: loc < P ? PROV[loc].terr : 'sea', weather: weatherAt(loc).n }; G.campaign.reports.unshift(r); G.campaign.reports.length = Math.min(100, G.campaign.reports.length); }
  r.end = G.hour;
  for (const u of arena) { const side = r.sides[u.o] || (r.sides[u.o] = { lost: {}, damage: 0, units: 0 }); side.units = Math.max(side.units, arena.filter(e => e.o === u.o).length); }
  for (const [u, dm] of damage) { const side = r.sides[u.o] || (r.sides[u.o] = { lost: {}, damage: 0, units: 0 }); side.damage += Math.min(u.hp, dm); }
}
function campaignLoss(u) {
  if (!G.campaign || UNITS[u.t].oneshot) return;
  const c = G.C[u.o]; c.lossTypes[u.t] = (c.lossTypes[u.t] || 0) + 1;
  const r = G.campaign.reports.find(x => x.loc === u.loc && x.end === G.hour);
  if (r && r.sides[u.o]) { const loss = r.sides[u.o].lost; loss[u.t] = (loss[u.t] || 0) + 1; }
}
function budgetFor(c) {
  const C = G.C[c];
  return RES.map(k => { const income = C.inc[k] || 0, expense = C.use[k] || 0, net = income - expense, stock = C.res[k]; return { k, income, expense, net, stock, days: net < 0 ? stock / -net : Infinity, forecast: Math.max(0, stock + net * 7), cap: Math.max(3000, income * 80) }; });
}
function taxRate(c, value) {
  if (!Number.isFinite(value) || value < 0.6 || value > 1.4) return 'Ставка должна быть от 60 до 140%';
  G.C[c].tax = Math.round(value * 100) / 100; recalc(c); return '';
}
function reserveTransfer(c, qty) {
  const C = G.C[c]; if (!Number.isFinite(qty) || !qty) return false;
  if (qty > 0 && C.res.fuel >= qty) { C.res.fuel -= qty; C.reserveFuel += qty; return true; }
  if (qty < 0 && C.reserveFuel >= -qty) { C.reserveFuel += qty; C.res.fuel -= qty; return true; }
  return false;
}
function emergencyMoney(c) {
  const C = G.C[c]; if (C.printUntil > G.hour) return 'Эмиссия доступна раз в 10 дней';
  C.res.cash += Math.max(100, C.inc.cash * 3); C.inflation = Math.min(0.8, C.inflation + 0.08); C.printUntil = G.hour + 240;
  news('economy', `${C.n}: экстренная эмиссия. Военная продукция дорожает на 8%.`, C.cap, [c], c === G.player ? 'p' : ''); return '';
}
function campaignAutoBuy(C) {
  const t = G.campaign.treasury; let remaining = t.budget;
  for (const k of ['food', 'supp', 'fuel', 'comp', 'elec', 'rare']) {
    const net = (C.inc[k] || 0) - (C.use[k] || 0), price = priceOf(k, true);
    if (price > BASE_PRICE[k] * t.maxPrice) continue;
    const wanted = Math.max(20, -net * t.days) - C.res[k];
    const qty = Math.floor(Math.min(wanted, remaining / price, Math.max(0, C.res.cash - t.floor) / price));
    if (qty > 0 && !trade(C.id, k, qty, true)) remaining -= qty * price;
  }
}
function recordEconomy() {
  if (!G.campaign) return;
  const c = G.C[G.player];
  const row = { hour: G.hour, player: G.player, res: Object.assign({}, c.res), inc: Object.assign({}, c.inc), use: Object.assign({}, c.use), prices: Object.fromEntries(Object.keys(BASE_PRICE).map(k => [k, priceOf(k, true)])), vp: c.vp, score: scoreOf(c.id) };
  G.campaign.history.push(row); if (G.campaign.history.length > 120) G.campaign.history.shift();
}
function pactBetween(a, b) { return G.campaign?.pacts.find(p => (p.a === a && p.b === b || p.a === b && p.b === a) && p.until > G.hour); }
function embargoed(a, b) { return !!G.campaign?.embargoes.some(e => e.a === a && e.b === b || e.a === b && e.b === a); }
function signPact(a, b) {
  if (!G.C[b]?.alive || a === b || atWar(a, b)) return 'Нужен мир между странами';
  if (pactBetween(a, b)) return 'Пакт уже действует';
  if (relOf(a, b) < 10 || G.C[a].reputation < 35) return 'Нужны отношения +10 и репутация 35';
  G.campaign.pacts.push({ a, b, until: G.hour + 720 }); addRel(a, b, 5);
  news('pact', `${G.C[a].n} и ${G.C[b].n}: пакт о ненападении на 30 дней.`, -1, [a, b], 'g'); return '';
}
function breakPact(a, b) { const p = pactBetween(a, b); if (!p) return false; p.until = G.hour; G.C[a].reputation = Math.max(0, G.C[a].reputation - 20); addRel(a, b, -25); news('pact', `${G.C[a].n} нарушила пакт с ${G.C[b].n}. Доверие утрачено.`, -1, [a, b], 'g'); return true; }
function toggleEmbargo(a, b) {
  const list = G.campaign.embargoes, i = list.findIndex(e => e.a === a && e.b === b);
  if (i >= 0) list.splice(i, 1); else { list.push({ a, b }); addRel(a, b, -8); }
}
function guaranteeCountry(a, b) {
  if (a === b || atWar(a, b) || !G.C[b]?.alive) return 'Нельзя гарантировать эту страну';
  if (G.campaign.guarantees.some(g => g.a === a && g.b === b)) return 'Гарантия уже действует';
  G.campaign.guarantees.push({ a, b, until: G.hour + 720 }); return '';
}
function requestLoan(a, b) {
  const amount = 500;
  if (!areAllied(a, b) || atWar(a, b) || relOf(a, b) < 30 || G.C[a].reputation < 40) return 'Нужны союз, отношения +30 и репутация 40';
  if (G.C[b].res.cash < amount + 300) return 'У союзника нет свободных денег';
  if (G.campaign.debts.some(d => d.a === a && (d.left > 0 || d.arrears > 0))) return 'Сначала погасите текущий заём';
  G.C[b].res.cash -= amount; G.C[a].res.cash += amount; G.campaign.debts.push({ a, b, left: 10, payment: 52.5 }); return '';
}
function createTradeRoute(buyer, seller, res, qty) {
  if (!BASE_PRICE[res] || !Number.isInteger(qty) || qty < 1 || qty > 500) return 'Объём от 1 до 500';
  if (atWar(buyer, seller) || embargoed(buyer, seller) || relOf(buyer, seller) < 20) return 'Нужны мир, отсутствие эмбарго и отношения +20';
  if (G.campaign.routes.some(r => r.buyer === buyer && r.seller === seller && r.res === res && r.left > 0)) return 'Такой контракт уже есть';
  G.campaign.routes.push({ buyer, seller, res, qty, price: BASE_PRICE[res] * G.market.m[res], left: 10, delivered: 0, missed: 0 }); return '';
}
function settlePeace(a, b, terms) {
  if (!atWar(a, b)) return 'Нет войны';
  if (!['white', 'return', 'payments'].includes(terms)) return 'Неизвестные условия';
  const r = aiPeaceEval(b, a);
  if (!r.ok) return r.why;
  if (terms !== 'white' && G.wlost[b * NC + a] < G.wlost[a * NC + b] + 1) return 'Противник не принимает требования: у вас нет преимущества по захватам';
  makePeace(a, b);
  if (terms === 'payments') G.campaign.reparations.push({ a: b, b: a, left: 10, payment: Math.max(5, G.C[b].inc.cash * 0.1) });
  if (terms === 'return') for (const p of G.C[b].provs.slice()) if (PROV[p].c === a) peacefulTransfer(p, a);
  return '';
}
function peacefulTransfer(p, to) {
  const pv = G.pv[p], from = pv.o;
  if (from === to) return;
  G.C[from].provs = G.C[from].provs.filter(x => x !== p); G.C[to].provs.push(p);
  pv.o = to; pv.cap = null; pv.bq = null; pv.q = []; pv.since = G.hour; pv.loyalty = 60;
  G.C[to].alive = true; G.C[from].dirty = G.C[to].dirty = true; G.ownVer++;
  if (G.C[from].cap === p) pickCapital(G.C[from]);
  if (!G.C[from].provs.length) eliminate(from, to);
  expelUnits(from, to);
  recalc(from); recalc(to); updateSupply(); updateVis(true);
}
function civicAid(c) {
  const C = G.C[c]; if (C.res.cash < 100 || C.res.food < 25) return 'Нужно 100 денег и 25 продовольствия';
  if (C.aidUntil > G.hour) return 'Программа уже действует';
  C.res.cash -= 100; C.res.food -= 25; C.aidUntil = G.hour + 120; return '';
}
function resolveDecision(choice) {
  const d = G.campaign.decision; if (!d || d.resolved) return 'Нет открытого события';
  const c = G.C[G.player];
  if (choice === 'aid') { if (c.res.cash < 150 || c.res.food < 50) return 'Нужно 150 денег и 50 еды'; c.res.cash -= 150; c.res.food -= 50; for (const p of c.provs) G.pv[p].loyalty = Math.min(100, G.pv[p].loyalty + 6); c.reputation = Math.min(100, c.reputation + 3); }
  else if (choice !== 'wait') return 'Неизвестное решение';
  d.resolved = true; return '';
}
function campaignDay() {
  const cp = G.campaign;
  cp.pacts = cp.pacts.filter(p => p.until > G.hour);
  cp.guarantees = cp.guarantees.filter(p => p.until > G.hour && G.C[p.a].alive && G.C[p.b].alive);
  cp.objectives = cp.objectives.filter(o => o.until > G.hour && G.C[o.owner].alive);
  for (const c of G.C) {
    c.inflation = Math.max(0, c.inflation - 0.001);
    c.reputation = Math.min(100, c.reputation + 0.05);
    if (c.leaveAt && c.leaveAt <= G.hour) { c.leaveAt = 0; leaveAlliance(c.id, true); }
  }
  for (const pv of G.pv) {
    const c = G.C[pv.o], occupied = pv.o !== PROV[pv.id].c;
    const garrison = G.at[pv.id].some(id => { const u = G.U.get(id); return u && u.o === pv.o && UNITS[u.t].dom === 'land'; });
    const target = clamp(85 - (c.tax - 1) * 80 - (occupied ? 25 : 0) - pv.dmg * 0.25 - pv.fall * 30 + (garrison ? 8 : 0) + (c.aidUntil > G.hour ? 12 : 0), 5, 100);
    pv.loyalty = clamp(pv.loyalty + clamp((target - pv.loyalty) * 0.1, -4, 3), 0, 100);
    if (pv.loyalty < 25 && occupied && !garrison && G.C[PROV[pv.id].c].alive && R() < 0.04) {
      const old = pv.o, native = PROV[pv.id].c;
      setWar(native, old); captureProv(pv.id, native); spawnUnit(native, 'inf', pv.id);
      news('revolt', `Восстание: ${PROV[pv.id].name} вернулась под контроль ${G.C[native].n}`, pv.id, [old, native], 'g');
    }
    if (pv.pop > 0 && pv.dmg < 30 && pv.fall < 0.1) pv.pop = Math.round(pv.pop * (1 + 0.000025 * pv.loyalty / 80));
  }
  for (const r of cp.routes) {
    if (r.left <= 0) continue;
    const A = G.C[r.buyer], B = G.C[r.seller], cost = r.qty * r.price;
    if (A.alive && B.alive && !atWar(A.id, B.id) && !embargoed(A.id, B.id) && A.res.cash >= cost && B.res[r.res] >= r.qty) {
      A.res.cash -= cost; B.res.cash += cost; B.res[r.res] -= r.qty; A.res[r.res] += r.qty; r.delivered++; addRel(A.id, B.id, 0.5);
    } else { r.missed++; note(A.id, 'trade', `Контракт с ${B.n}: поставка ${RES_INFO[r.res].n} пропущена — война, эмбарго или нехватка запасов.`, -1); }
    r.left--;
  }
  cp.routes = cp.routes.filter(r => r.left > 0);
  for (const d of cp.debts.concat(cp.reparations)) {
    if (d.left <= 0 && !(d.arrears > 0)) continue;
    const A = G.C[d.a], B = G.C[d.b];
    const due = (d.left > 0 ? d.payment : 0) + (d.arrears || 0);
    const amount = Math.min(A.res.cash, due); A.res.cash -= amount; B.res.cash += amount;
    d.arrears = Math.max(0, due - amount);
    if (d.arrears > 0) { A.reputation = Math.max(0, A.reputation - 3); addRel(d.a, d.b, -2); note(d.a, 'debt', 'Не хватает денег для полного платежа. Репутация снизилась.', -1); }
    if (d.left > 0) d.left--;
  }
  cp.debts = cp.debts.filter(d => d.left > 0 || d.arrears > 0); cp.reparations = cp.reparations.filter(d => d.left > 0 || d.arrears > 0);
  const day = Math.floor(G.hour / 24);
  if (day % 10 === 0 && day !== cp.lastDecision && (!cp.decision || cp.decision.resolved)) {
    cp.lastDecision = day;
    cp.decision = { day, resolved: false, title: 'Помощь населению', text: 'Местные администрации просят профинансировать продовольственные центры. Помощь повысит лояльность и международную репутацию.' };
    note(G.player, 'decision', 'Новое гражданское решение: помощь населению (Штаб → Решения).', G.C[G.player].cap);
  }
  if (day % 15 === 0) {
    const res = pick(Object.keys(BASE_PRICE)), change = R() < 0.5 ? 0.7 : 1.4;
    G.market.m[res] = clamp(G.market.m[res] * change, 0.4, 3);
    cp.marketEvent = { hour: G.hour, res, change };
    news('market', `${change > 1 ? 'Рост спроса' : 'Избыток предложения'}: ${RES_INFO[res].n}. Рыночная цена изменилась.`, -1, [], 'g');
  }
  for (const c of G.C) if (c.alive) recalc(c);
  recordEconomy(); checkAchievements();
}
const ACHIEVEMENTS = [
  { id: 'week', n: 'Первая неделя', d: 'Продержаться 7 игровых дней', check: () => G.hour >= 168 },
  { id: 'builder', n: 'Строитель', d: 'Начать 10 строек', check: () => (G.C[G.player].stats.built || 0) >= 10 },
  { id: 'scientist', n: 'Научная держава', d: 'Начать 5 исследований', check: () => (G.C[G.player].stats.researched || 0) >= 5 },
  { id: 'diplomat', n: 'Дипломат', d: 'Заключить пакт о ненападении', check: () => G.campaign.pacts.some(p => p.a === G.player || p.b === G.player) },
  { id: 'victor', n: 'Победитель', d: 'Выиграть партию', check: () => !!G.over?.win },
  { id: 'veteran', n: 'Ветераны', d: 'Получить часть с опытом 75', check: () => [...G.U.values()].some(u => u.o === G.player && u.xp >= 75) }
];
function checkAchievements() {
  if (G.opts.observer) return;
  for (const a of ACHIEVEMENTS) if (!G.campaign.achievements.includes(a.id) && a.check()) { G.campaign.achievements.push(a.id); note(G.player, 'goal', `🏅 Достижение: ${a.n}`, -1); }
}

/* Reject incompatible or malformed files before changing the active game. */
function validateSave(o) {
  const fail = msg => { throw new Error('Сохранение: ' + msg); };
  const num = x => Number.isFinite(x) && x >= 0;
  const id = (x, max) => Number.isInteger(x) && x >= 0 && x < max;
  if (!o || ![1, SAVE_VERSION].includes(o.v)) fail('неподдерживаемая версия');
  if (o.world && o.world !== WORLD_ID) fail('другая карта');
  if (!o.opts || !SCENARIOS[o.opts.scenario] || !DIFF[o.opts.diff] || !num(o.opts.win)) fail('неверные настройки');
  if (!id(o.player, NC) || !num(o.hour) || !Number.isInteger(o.hour) || !Number.isInteger(o.seed) || !Number.isInteger(o.rng) || !num(o.tension)) fail('неверное состояние');
  if (!Array.isArray(o.C) || o.C.length !== NC || !Array.isArray(o.pv) || o.pv.length !== P || !Array.isArray(o.U) || o.U.length > 100000) fail('неверный размер мира');
  if (!o.market?.m || Object.keys(BASE_PRICE).some(k => !num(o.market.m[k])) || !Array.isArray(o.news) || !Array.isArray(o.al) || !o.stats) fail('неверные данные мира');
  const claimed = new Set();
  for (const [i, c] of o.C.entries()) {
    if (!c || !c.res || [...RES, 'man'].some(k => !num(c.res[k])) || !Array.isArray(c.provs) || !c.techs || !c.gen || !c.rs || !c.stats || !id(c.cap, P)) fail('неверная страна');
    for (const t of UNIT_ORDER) if (!id(c.gen[t], MAX_GEN + 1)) fail('неверное поколение');
    for (const [k, min, max] of [['tax', 0.6, 1.4], ['inflation', 0, 0.8], ['reserveFuel', 0, 1e12], ['reputation', 0, 100]]) if (c[k] !== undefined && (!Number.isFinite(c[k]) || c[k] < min || c[k] > max)) fail('неверная экономическая политика');
    if (o.v === 2 && (!c.inc || !c.use || !num(c.manCap) || !num(c.foodNeed) || !num(c.vp) || Object.values(c.inc).concat(Object.values(c.use)).some(n => !num(n)))) fail('неверные расчёты экономики');
    for (const k in c.techs) if (!TECHS[k] || !id(c.techs[k], TECHS[k].max + 1)) fail('неверная технология');
    if (!Number.isInteger(c.alliance) || c.alliance < -1 || c.alliance >= o.al.length) fail('неверный альянс');
    for (const p of c.provs) { if (!id(p, P) || claimed.has(p) || o.pv[p]?.o !== i) fail('неверное владение провинцией'); claimed.add(p); }
  }
  if (claimed.size !== P) fail('потерянные провинции');
  for (const pv of o.pv) {
    if (!pv || !id(pv.o, NC) || !pv.b || !Array.isArray(pv.q) || pv.q.length > 5 || !num(pv.pop) || !num(pv.dmg) || pv.dmg > 100 || !num(pv.fall)) fail('неверная провинция');
    for (const b of BLD_ORDER) if (b !== 'depot' || pv.b[b] !== undefined) if (!id(pv.b[b], BLD[b].max + 1)) fail('неверное здание');
    for (const q of pv.q) if (!UNITS[q.t] || !num(q.left) || !num(q.total) || q.total === 0) fail('неверная очередь');
    if (pv.bq && (!BLD[pv.bq.b] || !id(pv.bq.lvl, BLD[pv.bq.b].max + 1) || !num(pv.bq.left) || !num(pv.bq.total))) fail('неверная стройка');
    if (pv.loyalty !== undefined && (!num(pv.loyalty) || pv.loyalty > 100)) fail('неверная лояльность');
    if (pv.cap && (!id(pv.cap.by, NC) || !num(pv.cap.prog))) fail('неверный захват');
  }
  const units = new Set();
  for (const u of o.U) {
    if (!u || !Number.isInteger(u.id) || u.id <= 0 || units.has(u.id) || !UNITS[u.t] || !id(u.o, NC) || !id(u.loc, N) || !id(u.g, MAX_GEN + 1) || !num(u.hp) || u.hp > 100 || !num(u.mor) || u.mor > 100 || !Array.isArray(u.path) || u.path.some(p => !id(p, N)) || !Array.isArray(u.cargo) || !['idle', 'move', 'base', 'out', 'back', 'patrol', 'strike', 'cargo'].includes(u.st)) fail('неверная часть');
    if (['out', 'back'].includes(u.st) && (!u.fl || ['fx', 'fy', 'tx', 'ty', 'd', 'done'].some(k => !Number.isFinite(u.fl[k])))) fail('неверный полёт');
    if (u.leg && (!id(u.leg.to, N) || ['fx', 'fy', 'tx', 'ty', 'd', 'done'].some(k => !Number.isFinite(u.leg[k])))) fail('неверный маршрут');
    if (u.waypoints && (!Array.isArray(u.waypoints) || u.waypoints.length > 100 || u.waypoints.some(p => !id(p, N)))) fail('неверные точки маршрута');
    for (const [k, max] of [['xp', 150], ['fatigue', 100], ['entrench', 24]]) if (u[k] !== undefined && (!num(u[k]) || u[k] > max)) fail('неверное состояние части');
    units.add(u.id);
  }
  if (!Number.isInteger(o.nextU) || o.nextU <= Math.max(0, ...units)) fail('неверный счётчик частей');
  for (const u of o.U) if (u.cargo.some(n => !units.has(n)) || u.st === 'cargo' && !units.has(u.carrier)) fail('неверный транспорт');
  for (const k of ['rel', 'war', 'acc', 'warStart', 'wlost', 'truce']) {
    const a = o[k]; if (k === 'truce' && !a) continue;
    if (!Array.isArray(a) || a.length % 2) fail('неверная дипломатия');
    for (let i = 0; i < a.length; i += 2) if (!id(a[i], NC * NC) || !Number.isFinite(a[i + 1])) fail('неверная дипломатия');
  }
  for (const [i, al] of o.al.entries()) if (al.id !== i || !Array.isArray(al.members) || al.members.some(c => !id(c, NC)) || !id(al.leader, NC)) fail('неверный альянс');
  for (const n of o.news) if (!n || typeof n.x !== 'string' || !num(n.h) || !Array.isArray(n.c) || n.c.some(c => !id(c, NC)) || !Number.isInteger(n.l) || n.l < -1 || n.l >= N) fail('неверный журнал');
  if (o.campaign) validateCampaign(o.campaign, fail);
}
function validateCampaign(cp, fail) {
  const validId = n => Number.isInteger(n) && n >= 0 && n < NC;
  const lists = ['pacts', 'guarantees', 'embargoes', 'routes', 'debts', 'reparations', 'objectives', 'reports', 'history', 'groups', 'markers', 'achievements'];
  for (const k of lists) if (!Array.isArray(cp[k]) || cp[k].length > (k === 'groups' ? 10 : k === 'markers' ? 100 : 1000)) fail('неверный раздел кампании');
  for (const k of ['pacts', 'guarantees', 'embargoes', 'debts', 'reparations']) for (const d of cp[k]) if (!validId(d.a) || !validId(d.b)) fail('неверный договор');
  for (const d of cp.routes) if (!validId(d.buyer) || !validId(d.seller) || !BASE_PRICE[d.res] || !(d.qty > 0 && d.qty <= 500) || !Number.isFinite(d.price) || d.price < 0 || !Number.isInteger(d.left) || d.left < 0 || d.left > 10) fail('неверный контракт');
  for (const k of ['debts', 'reparations']) for (const d of cp[k]) if (!Number.isFinite(d.payment) || d.payment < 0 || !Number.isInteger(d.left) || d.left < 0 || d.left > 10) fail('неверный платёж');
  for (const k of ['debts', 'reparations']) for (const d of cp[k]) if (d.arrears !== undefined && (!Number.isFinite(d.arrears) || d.arrears < 0)) fail('неверная задолженность');
  for (const k of ['pacts', 'guarantees']) for (const d of cp[k]) if (!Number.isFinite(d.until) || d.until < 0) fail('неверный срок');
  for (const m of cp.markers) if (!Number.isInteger(m.loc) || m.loc < 0 || m.loc >= N || typeof m.name !== 'string' || m.name.length > 80) fail('неверная метка');
  for (const g of cp.groups) if (typeof g.name !== 'string' || !Array.isArray(g.ids) || g.ids.some(n => !Number.isInteger(n) || n <= 0)) fail('неверная группа');
  for (const g of cp.objectives) if (!validId(g.owner) || !Number.isInteger(g.loc) || g.loc < 0 || g.loc >= P || !Number.isFinite(g.until)) fail('неверная цель союзников');
  for (const h of cp.history) if (!h || !validId(h.player) || !Number.isFinite(h.hour) || !h.res || Object.values(h.res).some(n => !Number.isFinite(n) || n < 0)) fail('неверная история');
  for (const r of cp.reports) {
    if (!r || !Number.isInteger(r.loc) || r.loc < 0 || r.loc >= N || !Number.isFinite(r.start) || !Number.isFinite(r.end) || !r.sides) fail('неверный отчёт о бое');
    for (const [id, s] of Object.entries(r.sides)) if (!validId(+id) || !s || !s.lost || !Number.isFinite(s.units) || !Number.isFinite(s.damage) || Object.entries(s.lost).some(([t, n]) => !Object.hasOwn(UNITS, t) || !Number.isInteger(n) || n < 0)) fail('неверные потери');
  }
  if (!cp.treasury || !Number.isFinite(cp.treasury.days) || cp.treasury.days < 1 || cp.treasury.days > 30 || !Number.isFinite(cp.treasury.floor) || cp.treasury.floor < 0 || !Number.isFinite(cp.treasury.budget) || cp.treasury.budget < 0 || !Number.isFinite(cp.treasury.maxPrice) || cp.treasury.maxPrice < 1 || cp.treasury.maxPrice > 5) fail('неверные настройки казначейства');
}
