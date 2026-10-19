'use strict';
/* ===== Core state, setup and helpers ===== */
const PROV = WORLD.provs, SEA = WORLD.seas, CTY = WORLD.countries;
const P = PROV.length, S = SEA.length, N = P + S, NC = CTY.length;
const isSea = l => l >= P;
const lx = l => l < P ? PROV[l].x : SEA[l - P].x;
const ly = l => l < P ? PROV[l].y : SEA[l - P].y;
const locName = l => l < P ? PROV[l].name : SEA[l - P].name;
const dist = (a, b) => Math.hypot(lx(a) - lx(b), ly(a) - ly(b));
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

/* adjacency by location (provinces <P, seas >=P) */
const ADJL = new Array(N), ADJS = new Array(N); // ADJL: land graph for provinces; ADJS: sea graph incl. ports
for (let i = 0; i < P; i++) {
  ADJL[i] = PROV[i].adj.slice();
  ADJS[i] = PROV[i].seas.map(s => s + P);
}
for (let i = 0; i < S; i++) {
  ADJL[P + i] = [];
  ADJS[P + i] = SEA[i].adj.map(s => s + P).concat(SEA[i].ports);
}
const ADJ = new Array(N);
for (let i = 0; i < N; i++) ADJ[i] = ADJL[i].concat(ADJS[i]);
const isCoastal = p => PROV[p].seas.length > 0;
const cidx = {}; CTY.forEach((c, i) => cidx[c.key] = i);

let G = null;
let SHELL_N = 0;

/* seeded rng (mulberry32) */
function makeRng(seed) { let a = seed >>> 0; const f = function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; f.get = () => a; f.set = v => { a = v; }; return f; }
const R = () => G.rng();
const rr = (a, b) => a + (b - a) * R();
const pick = arr => arr[(R() * arr.length) | 0];

function fmt(n) {
  n = Math.round(n);
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
  if (a >= 1e4) return (n / 1e3).toFixed(a >= 1e5 ? 0 : 1) + 'K';
  return String(n);
}
function fmtPop(n) { return n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + ' млн' : n >= 1e3 ? Math.round(n / 1e3) + ' тыс.' : String(n); }

/* colors for countries: greedy graph colouring over palette */
const PALETTE = ['#5b8def', '#e0605a', '#58b368', '#e0b34a', '#a770d6', '#d9854a', '#4fb8c4', '#c9689a', '#8fb85a', '#7388c9', '#c4a05a', '#5aa58f', '#d06f6f', '#9a8ad0', '#b3b35a'];
function assignColors() {
  const nb = CTY.map(() => new Set());
  for (const p of PROV) for (const a of p.adj) if (PROV[a].c !== p.c) { nb[p.c].add(PROV[a].c); }
  const order = CTY.map((c, i) => i).sort((a, b) => nb[b].size - nb[a].size);
  const use = new Array(PALETTE.length).fill(0);
  const col = new Array(NC).fill(-1);
  for (const i of order) {
    const bad = new Set(); for (const j of nb[i]) if (col[j] >= 0) bad.add(col[j]);
    let best = -1, bu = 1e9;
    for (let k = 0; k < PALETTE.length; k++) if (!bad.has(k) && use[k] < bu) { bu = use[k]; best = k; }
    if (best < 0) best = i % PALETTE.length;
    col[i] = best; use[best]++;
  }
  return col.map(k => PALETTE[k]);
}
const CCOLORS = assignColors();

/* ----- unit helpers ----- */
function ustat(u) {
  const d = UNITS[u.t], c = G.C[u.o], g = u.g;
  return {
    atk: campaignAttack(u) * GEN_ATK[g] * (DOCS[c.doc] ? DOCS[c.doc].atk : 1) * (c.short && (c.short.supp || c.short.fuel) ? 0.8 : 1),
    arm: d.arm + GEN_ARM[g] + (u.stance === 'defend' ? 1 : 0) + Math.min(2, (u.entrench || 0) / 12) + (DOCS[c.doc] ? DOCS[c.doc].arm : 0),
    spd: campaignSpeed(u) * d.spd * GEN_SPD[g] * (1 + 0.04 * (c.techs.logist || 0))
  };
}
function unitAvail(c, t) { // can country c build unit type t (tech-wise)?
  const d = UNITS[t], co = G.C[c];
  if (d.dom === 'msl' || G.opts.casual && !QUICK_UNITS.includes(t)) return false;
  if (d.tech && (co.techs[d.tech[0]] || 0) < d.tech[1]) return false;
  if (d.dom === 'sea' && t === 'carrier' && (co.techs.indus || 0) < 2) return false;
  return true;
}

/* ---------- setup ---------- */
function newGameShell(opts) {
  const seed = opts.seed || ((Math.random() * 1e9) | 0);
  G = {
    opts: Object.assign({ scenario: 'eve', diff: 'normal', win: 0.55, casual: true, supply: false, seed }, opts),
    seed, rng: makeRng(seed), hour: 0, speed: 1, paused: true,
    C: [], pv: [], U: new Map(), nextU: 1, at: Array.from({ length: N }, () => []),
    rel: new Int8Array(NC * NC), war: new Uint8Array(NC * NC), acc: new Uint8Array(NC * NC), warStart: new Int32Array(NC * NC),
    al: [], news: [], fx: [], market: { m: { food: 1, supp: 1, fuel: 1, comp: 1, elec: 1, rare: 1 } },
    player: -1, over: null, tension: 1, stats: { battles: 0, nukes: 0 }, vis: new Uint8Array(N), visHour: -99, totalVP: 0, wlost: new Int16Array(NC * NC), spies: [], spyId: 0, intel: {}, ownVer: (++SHELL_N) * 100000, bat: new Map(), truce: new Int32Array(NC * NC)
  };
  G.opts.seed = seed;
  const sc0 = SCENARIOS[G.opts.scenario] || SCENARIOS.eve;
  G.tension = sc0.tension;
  G.player = G.opts.player !== undefined && G.opts.player >= 0 ? G.opts.player : cidx[G.opts.playerKey] || 0;
  // countries
  CTY.forEach((c, i) => {
    G.C.push({
      id: i, key: c.key, n: c.n, color: CCOLORS[i], alive: true, ai: i !== G.player, cap: c.cap,
      pop: c.pop, gdp: c.gdp, gov: c.gov, mil: c.mil, tech: c.tech, nukes: c.nukes, agg: c.agg, bloc: c.bloc, rivals: c.rivals, flag: c.flag,
      res: { cash: 0, food: 0, supp: 0, fuel: 0, comp: 0, elec: 0, rare: 0, man: 0 }, inc: {}, use: {}, manCap: 0,
      techs: {}, gen: {}, rs: {}, alliance: -1, short: {}, foodScale: 1, stats: { lost: 0, taken: 0, kills: 0, losses: 0 }, ai_s: { lastWar: -999 },
      provs: [], dirty: true, vp: 0, doc: c.bloc === 'NATO' || c.bloc === 'PACIFIC' ? 'west' : (c.bloc === 'CSTO' || c.bloc === 'CHINA' || c.gov === 'communist') ? 'east' : 'euro'
    });
  });
  // provinces
  PROV.forEach((p, i) => {
    G.pv.push({ id: i, o: p.c, b: { infra: 0, barracks: 0, factory: 0, airfield: 0, naval: 0, aa: 0, fort: 0, radar: 0, eco: 0, silo: 0, depot: 0 }, bq: null, q: [], dmg: 0, cap: null, fall: 0, since: -9999, pop: p.pop });
  });
  for (const pv of G.pv) G.C[pv.o].provs.push(pv.id);
  G.totalVP = PROV.reduce((a, p) => a + p.vp, 0);
  return G;
}
function newGame(opts) {
  newGameShell(opts);
  const sc = SCENARIOS[G.opts.scenario] || SCENARIOS.eve;
  initDiplomacy();
  for (const c of G.C) initCountry(c);
  for (const c of G.C) { recalc(c); }
  for (const c of G.C) for (const k of RES) { /* starting stock */ c.res[k] = Math.max(c.res[k], 0); }
  // scenario wars
  for (const [a, b] of sc.wars) {
    if (cidx[a] !== undefined && cidx[b] !== undefined && !G.war[cidx[a] * NC + cidx[b]]) { setWar(cidx[a], cidx[b]); addRel(cidx[a], cidx[b], -70); }
  }
  initCampaign(); applyQuickRules();
  if (G.opts.stock && G.opts.stock !== 1) for (const k of RES) G.C[G.player].res[k] *= G.opts.stock;
  G.vp0 = G.C[G.player].vp;
  if (G.opts.doc && DOCS[G.opts.doc]) G.C[G.player].doc = G.opts.doc;
  updateVis(true);
  return G;
}

function initDiplomacy() {
  const byBloc = {};
  G.C.forEach(c => { if (c.bloc && c.bloc !== 'NONE') (byBloc[c.bloc] = byBloc[c.bloc] || []).push(c.id); });
  for (const b in byBloc) {
    if (byBloc[b].length < 2) continue;
    const mem = byBloc[b].sort((x, y) => (CTY[y].mil * 5 + Math.log10(CTY[y].gdp + 1)) - (CTY[x].mil * 5 + Math.log10(CTY[x].gdp + 1)));
    const al = { id: G.al.length, n: BLOCS[b].n, color: BLOCS[b].c, members: mem.slice(), leader: mem[0], bloc: b };
    G.al.push(al);
    mem.forEach(m => G.C[m].alliance = al.id);
  }
  const blocRel = { 'NATO|PACIFIC': 45, 'NATO|CSTO': -40, 'NATO|CHINA': -30, 'PACIFIC|CHINA': -35, 'PACIFIC|CSTO': -25, 'CSTO|CHINA': 30, 'NATO|ARAB': 12, 'ARAB|CSTO': -5, 'ARAB|CHINA': 5, 'ARAB|PACIFIC': 10 };
  for (let a = 0; a < NC; a++) for (let b = a + 1; b < NC; b++) {
    const A = G.C[a], B = G.C[b];
    let v = ((R() * 24) | 0) - 12;
    if (A.bloc !== 'NONE' && A.bloc === B.bloc) v += 45;
    else if (A.bloc !== 'NONE' && B.bloc !== 'NONE') v += (blocRel[A.bloc + '|' + B.bloc] || blocRel[B.bloc + '|' + A.bloc] || 0);
    if (A.alliance >= 0 && A.alliance === B.alliance) v += 25;
    if (A.rivals.indexOf(B.key) >= 0 || B.rivals.indexOf(A.key) >= 0) v -= 55;
    // geographic neighbours are slightly cooler
    v = clamp(v, -100, 100);
    G.rel[a * NC + b] = G.rel[b * NC + a] = v;
  }
  for (const al of G.al) for (const a of al.members) for (const b of al.members) if (a !== b) G.acc[a * NC + b] = 1;
  // friendly pacts: NATO <-> PACIFIC access
  const nato = G.al.find(x => x.bloc === 'NATO'), pac = G.al.find(x => x.bloc === 'PACIFIC');
  if (nato && pac) for (const a of nato.members) for (const b of pac.members) { G.acc[a * NC + b] = 1; G.acc[b * NC + a] = 1; }
}

function initCountry(c) {
  const co = CTY[c.id];
  // tech levels from profile
  const t = c.tech;
  for (const u in UNITS) {
    let g = clamp(t - 2, 0, MAX_GEN);
    if (UNITS[u].dom === 'sea' || UNITS[u].dom === 'air') g = clamp(t - 2 + (c.mil >= 7 ? 1 : 0), 0, MAX_GEN);
    c.gen[u] = g;
  }
  c.techs = {
    infra: t >= 4 ? 2 : t >= 2 ? 1 : 0, agri: t >= 4 ? 1 : 0, mine: t >= 3 ? 1 : 0, indus: t >= 4 ? 2 : t >= 3 ? 1 : 0, elect: t >= 4 ? 2 : t >= 3 ? 1 : 0,
    logist: t >= 4 ? 1 : 0, radar: t >= 4 ? 2 : t >= 3 ? 1 : 0, rockets: c.nukes ? 3 : (t >= 4 ? 2 : t >= 3 ? 1 : 0), nuclear: c.nukes ? 1 : 0, abm: t >= 5 ? 2 : t >= 4 ? 1 : 0
  };
  if (c.mil >= 7 && t >= 4) c.techs.rockets = Math.max(c.techs.rockets, 2);
  // buildings
  const ps = c.provs.map(i => PROV[i]);
  const totalPop = ps.reduce((a, p) => a + p.pop, 0) || 1;
  const avgPop = totalPop / Math.max(1, ps.length);
  for (const pr of ps) {
    const pv = G.pv[pr.id], b = pv.b;
    const big = pr.pop > avgPop * 1.3 || pr.vp > 0;
    b.infra = clamp(Math.round(t * 0.55 + (big ? 0.7 : 0) + (R() * 0.8 - 0.4)), 0, 4);
    if (b.infra < 1 && t >= 2) b.infra = 1;
    if (big && pr.pop > 400000) b.barracks = clamp(Math.round(c.mil / 3.5), 1, 3);
    if (pr.res[4] >= 2 || pr.res[5] >= 2) b.factory = clamp(Math.round(pr.res[4] * 0.5 + c.mil / 6), 1, 3);
    if (pr.res[0] + pr.res[1] + pr.res[2] + pr.res[3] >= 6 && t >= 2 && R() < 0.5) b.eco = 1;
    if (pr.vp >= 2 && c.mil >= 3) b.fort = 1;
  }
  const cap = G.pv[c.cap];
  if (cap) {
    const b = cap.b; b.barracks = Math.max(b.barracks, clamp(Math.round(c.mil / 3), 1, 4)); b.infra = Math.max(b.infra, clamp(t, 1, 4));
    b.factory = Math.max(b.factory, clamp(Math.round(c.mil / 3.5), 1, 3)); b.aa = clamp(Math.round(c.mil / 3.5), 1, 4); b.radar = c.mil >= 4 ? 1 : 0;
    if (c.mil >= 3) b.airfield = clamp(Math.round(c.mil / 2.8), 1, 4);
    if (c.nukes) b.silo = 1;
  }
  // airfields / naval bases in strong countries
  if (c.mil >= 4) {
    const sorted = ps.slice().sort((a, b) => b.pop - a.pop);
    const nAir = clamp(Math.round(c.mil / 2.2), 1, 7), nNav = clamp(Math.round(c.mil / 3), 0, 5);
    let ai = 0, ni = 0;
    for (const pr of sorted) {
      const b = G.pv[pr.id].b;
      if (ai < nAir && b.airfield === 0 && R() < 0.8) { b.airfield = clamp(Math.round(c.mil / 3.5), 1, 3); ai++; }
      if (ni < nNav && pr.seas.length && b.naval === 0) { b.naval = clamp(Math.round(c.mil / 3), 1, 4); ni++; }
      if (c.nukes && b.silo === 0 && ni + ai > 2 && R() < 0.35) b.silo = 1;
    }
  } else if (c.mil >= 2) {
    const pr = ps.slice().sort((a, b) => b.pop - a.pop)[0];
    if (pr) { G.pv[pr.id].b.airfield = Math.max(G.pv[pr.id].b.airfield, 1); }
    const port = ps.filter(p => p.seas.length).sort((a, b) => b.pop - a.pop)[0];
    if (port && c.mil >= 3) G.pv[port.id].b.naval = 1;
  }
  // resources: ~12 days of income, computed after recalc (so do a first recalc)
  recalc(c);
  for (const k of RES) c.res[k] = Math.max(k === 'elec' || k === 'rare' ? 150 : 450, (c.inc[k] || 0) * (k === 'cash' ? 14 : 12));
  c.res.man = c.manCap * 0.85;
  c.res.cash += 300; c.res.comp += 120; c.res.elec += 40; c.res.rare += 10;
  // food scaling: need = pop^0.85 * 0.8, never starting in huge deficit
  const need = Math.pow(totalPop / 1e6, 0.85) * 0.8;
  const prod = c.inc.food || 0;
  c.foodScale = need > 0 ? Math.min(1, (prod * 1.08) / need) : 1;
  c.foodNeed = need * c.foodScale;
  deployStart(c);
}

function deployStart(c) {
  const co = CTY[c.id];
  const ps = c.provs.map(i => PROV[i]);
  const target = Math.round(clamp((2 + c.mil * c.mil * 0.4 + Math.log10(co.gdp + 10) * 1.2) * 0.9, 2, 70));
  const capP = c.cap;
  // border provinces: touching other countries
  const border = ps.filter(p => p.adj.some(a => PROV[a].c !== p.c));
  const interior = ps.filter(p => !border.includes(p));
  const mix = c.mil >= 3 ? { inf: 0.4, mot: 0.1, tank: 0.12, arty: 0.08, aa: 0.05, spec: 0.03, recon: 0.02 } : { inf: 0.7, mot: 0.1, tank: 0.05, arty: 0.05, aa: 0.04, recon: 0.04, spec: 0 };
  const landN = Math.round(target * (c.mil >= 3 ? 0.62 : 0.95));
  const types = [];
  for (const t in mix) { const n = Math.round(landN * mix[t]); for (let i = 0; i < n; i++) types.push(t); }
  for (const t of types) {
    if (!unitAvail(c.id, t)) continue;
    let loc;
    const r = R();
    if (r < 0.28) loc = capP; else if (r < 0.7 && border.length) loc = pick(border).id; else loc = pick(ps).id;
    const u = spawnUnit(c.id, t, loc);
    if (u) u.hp = rr(88, 100);
  }
  // air
  if (c.mil >= 3) {
    const bases = ps.filter(p => G.pv[p.id].b.airfield > 0);
    if (bases.length) {
      const airN = Math.round(target * 0.22);
      const mixA = c.mil >= 6 ? ['fighter', 'fighter', 'bomber', 'heli', 'fighter', 'uav', 'bomber', 'sbomber'] : ['fighter', 'heli', 'fighter', 'bomber'];
      for (let i = 0; i < airN; i++) { const t = mixA[i % mixA.length]; if (unitAvail(c.id, t) && G.pv[0] !== undefined) { const b = pick(bases); if (!(t === 'sbomber' && G.pv[b.id].b.airfield < 4)) spawnUnit(c.id, t, b.id); } }
    }
    // missiles
    const sil = ps.filter(p => G.pv[p.id].b.silo > 0);
    if (sil.length && c.techs.nuclear) { const n = Math.min(8, Math.round(c.mil * 0.7)); for (let i = 0; i < n; i++) spawnUnit(c.id, 'icbm', pick(sil).id); }
    if (c.techs.rockets >= 1 && c.mil >= 4) { const b = ps.filter(p => G.pv[p.id].b.airfield > 0); if (b.length) for (let i = 0; i < Math.round(c.mil * 0.8); i++) spawnUnit(c.id, 'cruise', pick(b).id); }
  }
  // navy
  const ports = ps.filter(p => G.pv[p.id].b.naval > 0);
  if (ports.length) {
    const navN = Math.round(target * 0.15);
    const mixN = c.mil >= 6 ? ['destroyer', 'frigate', 'sub', 'cruiser', 'destroyer', 'transport', 'sub', 'carrier'] : ['frigate', 'frigate', 'sub', 'transport', 'destroyer'];
    for (let i = 0; i < navN; i++) { const t = mixN[i % mixN.length]; if (!unitAvail(c.id, t)) continue; const b = pick(ports); const req = UNITS[t].req; if (G.pv[b.id].b[req[0]] >= req[1]) spawnUnit(c.id, t, b.id); }
  }
}

/* ---------- units ---------- */
function spawnUnit(c, t, loc) {
  const d = UNITS[t];
  if (d.dom === 'msl') return null;
  const u = { id: G.nextU++, t, o: c, g: G.C[c].gen[t] || 0, loc, hp: 100, mor: 100, st: 'idle', path: [], leg: null, cargo: [], carrier: 0, bs: 0, fuel: d.fuel || 0, tgt: -1, rounds: 0, born: G.hour, kills: 0 };
  if (d.dom === 'air' || d.dom === 'msl') { u.st = 'base'; u.bs = loc; }
  G.U.set(u.id, u);
  G.at[loc].push(u.id);
  return u;
}
function atRemove(u) { const a = G.at[u.loc]; const i = a.indexOf(u.id); if (i >= 0) { a[i] = a[a.length - 1]; a.pop(); } }
function place(u, loc) { atRemove(u); u.loc = loc; G.at[loc].push(u.id); }
function killUnit(u, by) {
  if (!G.U.has(u.id)) return;
  if (u.st !== 'cargo' && u.st !== 'out' && u.st !== 'back') atRemove(u); else if (u.st === 'cargo') { const c = G.U.get(u.carrier); if (c) { const i = c.cargo.indexOf(u.id); if (i >= 0) c.cargo.splice(i, 1); } }
  campaignLoss(u);
  G.U.delete(u.id);
  G.C[u.o].stats.losses++;
  if (by !== undefined && G.C[by]) G.C[by].stats.kills++;
  for (const id of u.cargo.slice()) { const cu = G.U.get(id); if (cu) { cu.st = 'idle'; killUnit(cu, by); } }
}

/* economy helpers */
function unitMult(c) { const C = G.C[c]; return (1 + (C.inflation || 0)) * (G.opts.diff === 'realism' ? 1.2 : 1) * (DOCS[C.doc] ? DOCS[C.doc].cost : 1) * ((GOV_FX[C.gov] || GOV_FX.autocracy).unit); }
function canAfford(c, cost, mult = 1) { for (const k in cost) { const r = RES_SHORT[k]; if (G.C[c].res[r] < cost[k] * mult - 1e-9) return false; } return true; }
function pay(c, cost, mult = 1) { for (const k in cost) G.C[c].res[RES_SHORT[k]] -= cost[k] * mult; }
function refund(c, cost, mult = 1) { for (const k in cost) G.C[c].res[RES_SHORT[k]] += cost[k] * mult; }

function lvlTable(a, l) { return a[Math.min(l, a.length - 1)]; }
const FOOD_T = [0, 3, 6, 10, 15, 22], ORE_T = [0, 2, 4, 7, 10, 14], OIL_T = [0, 3, 6, 10, 15, 22], RARE_T = [0, 1, 2, 3, 5, 7], IND_T = [0, 2, 4, 7, 10, 15], TECH_T = [0, 1, 2, 4, 6, 9];

/* province production per day */
function provProd(c, p, out) {
  const pr = PROV[p], pv = G.pv[p], b = pv.b, co = G.C[c];
  const t = co.techs;
  const eco = 1 + 0.18 * b.eco, inf = 1 + 0.05 * b.infra;
  let occ = 1;
  if (pv.since > -9000) { const days = (G.hour - pv.since) / 24; occ = 0.35 + 0.65 * Math.min(1, days / 25); }
  const dmg = 1 - pv.dmg / 100 * 0.75, fall = 1 - Math.min(0.9, pv.fall);
  const loyalty = Math.min(1.075, 0.7 + 0.3 * (pv.loyalty === undefined ? 80 : pv.loyalty) / 80);
  const m = eco * inf * occ * dmg * fall * loyalty * (pv.cyber > G.hour ? 0.35 : 1);
  const r = pr.res.map(v => Math.min(5, v));
  out.food += FOOD_T[r[0]] * m * (1 + 0.1 * (t.agri || 0));
  out.comp += ORE_T[r[1]] * m * (1 + 0.1 * (t.mine || 0));
  out.fuel += OIL_T[r[2]] * m * (1 + 0.1 * (t.mine || 0));
  out.rare += RARE_T[r[3]] * m * (1 + 0.1 * (t.mine || 0));
  out.supp += IND_T[r[4]] * m * (1 + 0.1 * (t.indus || 0));
  out.elec += TECH_T[r[5]] * m * (1 + 0.12 * (t.elect || 0));
  // cash: from gdp share
  const co0 = CTY[c];
  out.cash += (pv.corrupt > G.hour ? 0.6 : 1) * pv.cashBase * (1 + 0.04 * b.infra + 0.03 * b.eco) * occ * dmg * fall * (1 + 0.1 * (t.indus || 0)) * (co.tax || 1) * loyalty;
  out.pop += pv.pop;

}
function recalc(c) {
  const co = typeof c === 'number' ? G.C[c] : c;
  const out = { cash: 0, food: 0, supp: 0, fuel: 0, comp: 0, elec: 0, rare: 0, pop: 0 };
  // gdp share across *original* provinces of that country; conquered provinces use their own base
  let tp = 0;
  for (const p of co.provs) {
    const pv = G.pv[p];
    if (pv.cashBase === undefined) {
      // compute cash base from original owner gdp
      const oc = CTY[PROV[p].c], tot = oc.provs.reduce((a, q) => a + PROV[q].pop + 40000, 0) || 1;
      const urban = Math.min(1.5, Math.log10(1 + PROV[p].city / 300000) * 0.55);
      pv.cashBase = 0.9 * Math.pow(Math.max(oc.gdp, 300) / 1000, 0.78) * ((PROV[p].pop + 40000) / tot) * (0.65 + urban * 0.35) * 1.15;
      pv.cashBase = Math.max(pv.cashBase, 0.8);
    }
    provProd(co.id, p, out);
  }
  const gf = GOV_FX[co.gov] || GOV_FX.autocracy; out.cash *= gf.cash;
  out.fuel += 1.2 * co.provs.length * (co.techs.indus >= 1 ? 1.4 : 1); out.supp += 0.8 * co.provs.length;
  if (G.opts.casual) { out.cash *= 1.5; out.comp *= 1.5; }
  co.inc = out; co.vp = co.provs.reduce((a, p) => a + PROV[p].vp, 0);
  co.manCap = out.pop / 1000 * 0.009 * gf.man;
  co.dirty = false;
  // food need scales with current pop
  co.foodNeed = Math.pow(out.pop / 1e6, 0.85) * 0.8 * (co.foodScale || 1);
}

/* upkeep per day by country */
function calcUse(c) {
  const co = typeof c === "number" ? G.C[c] : c;
  const use = { food: 0, supp: 0, fuel: 0, cash: 0 };
  const lg = (1 - 0.08 * (co.techs.logist || 0)) * (DOCS[co.doc] ? DOCS[co.doc].up : 1);
  for (const [, u] of G.U) {
    if (u.o !== co.id) continue;
    const up = UNITS[u.t].up;
    for (const k in up) { const r = RES_SHORT[k]; use[r] = (use[r] || 0) + up[k] * (k === 's' || k === 'o' ? lg : 1) * (u.st === 'base' || u.st === 'idle' ? 0.6 : 1); }
    use.cash += 0.4 * (UNITS[u.t].cost.c || 5) / 10;
  }
  use.food += co.foodNeed;
  if (G.opts.casual) { use.cash *= 0.5; use.fuel *= 0.5; }
  co.use = use;
}
