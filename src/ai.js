'use strict';
/* ===== AI for non-player countries ===== */
function unitPower(u) {
  const d = UNITS[u.t];
  const a = Math.max(d.a.s, d.a.h, d.a.a, d.a.n, d.a.x * 0.5);
  return a * (0.3 + 0.7 * u.hp / 100) * GEN_ATK[u.g] * (1 + 0.08 * (d.arm + GEN_ARM[u.g]));
}
function unitsOf(c) { const o = []; for (const [, u] of G.U) if (u.o === c) o.push(u); return o; }
function enemyPowerAt(c, loc, domFilter) {
  let p = 0;
  for (const id of G.at[loc]) { const u = G.U.get(id); if (!u || !G.war[c * NC + u.o] || u.st === 'cargo') continue; const dm = UNITS[u.t].dom; if (domFilter && dm !== domFilter) continue; if (dm === 'msl') continue; p += unitPower(u); }
  return p;
}
function isFriendlyProv(c, p) { const o = G.pv[p].o; return o === c || areAllied(c, o); }

/* ---------- economy ---------- */
function aiBuildPlan(C, p, ctx) {
  const pv = G.pv[p], pr = PROV[p], b = pv.b, isCap = p === C.cap;
  const big = pr.pop > ctx.avgPop * 1.2 || pr.vp > 0;
  const war = ctx.atWar;
  const border = ctx.border.has(p);
  const rsum = pr.res[0] + pr.res[1] + pr.res[2] + pr.res[3] + pr.res[4] + pr.res[5];
  const plan = [];
  plan.push(['infra', isCap ? 4 : big ? 3 : 2]);
  if (rsum >= 5) plan.push(['eco', rsum >= 10 ? 3 : 2]);
  if (big || isCap) plan.push(['barracks', 1 + (C.mil >= 5 ? 1 : 0) + (war ? 1 : 0) + (isCap ? 1 : 0)]);
  if ((pr.res[4] >= 2 || isCap || big) && ctx.factories < ctx.nFactMax) plan.push(['factory', 1 + (C.mil >= 5 ? 1 : 0) + (C.mil >= 8 ? 1 : 0) + (war ? 1 : 0)]);
  if (isCap || pr.vp >= 2) plan.push(['aa', clamp(Math.round(C.mil / 3), 1, 3) + (war ? 1 : 0)]);
  if ((isCap || big) && C.mil >= 3 && (b.airfield > 0 || ctx.airfields < ctx.nAirMax)) plan.push(['airfield', clamp(Math.round(C.mil / 3), 1, 4)]);
  if (pr.seas.length && big && C.mil >= 4 && (b.naval > 0 || ctx.navals < ctx.nNavMax)) plan.push(['naval', clamp(Math.round(C.mil / 3), 1, 4)]);
  if (border && war) plan.push(['fort', 2]), plan.push(['aa', 1]);
  if (isCap) plan.push(['radar', 2]);
  if (C.nukes && (isCap || big) && ctx.silos < clamp(Math.round(C.mil / 2.5), 1, 4)) plan.push(['silo', 1]);
  if (war && border) plan.push(['barracks', 2]);
  return plan;
}
function aiEconomy(C) {
  if (!C.provs.length) return;
  const ps = C.provs;
  const ctx = { avgPop: ps.reduce((a, p) => a + PROV[p].pop, 0) / ps.length, atWar: warsOf(C.id).length > 0, border: new Set(), factories: 0, airfields: 0, navals: 0, silos: 0 };
  for (const p of ps) {
    const b = G.pv[p].b; if (b.factory) ctx.factories++; if (b.airfield) ctx.airfields++; if (b.naval) ctx.navals++; if (b.silo) ctx.silos++;
    if (PROV[p].adj.some(a => !isFriendlyProv(C.id, a))) ctx.border.add(p);
  }
  ctx.nFactMax = Math.max(2, Math.round(ps.length * 0.35)); ctx.nAirMax = Math.max(1, Math.round(C.mil / 1.8)); ctx.nNavMax = Math.round(C.mil / 2.6);
  const reserve = Math.max(150, (C.inc.cash || 0) * (ctx.atWar ? 1.2 : 3));
  let builds = (ctx.atWar ? 3 : 2) + (C.inc.cash > 1500 ? 2 : 0) + (C.res.cash > reserve * 6 ? 4 : 0);
  aiTrade(C);
  const order = ps.slice(); for (let i = order.length - 1; i > 0; i--) { const j = (R() * (i + 1)) | 0;[order[i], order[j]] = [order[j], order[i]]; }
  let tried = 0;
  for (const p of order) {
    if (builds <= 0 || tried++ > 40) break;
    const pv = G.pv[p]; if (pv.bq) continue;
    const plan = aiBuildPlan(C, p, ctx);
    for (const [b, tgt] of plan) {
      if (pv.b[b] >= tgt) continue;
      if (canBuild(p, b) !== '') continue;
      const cost = bldCost(b, pv.b[b] + 1);
      if (C.res.cash - (cost.c || 0) < reserve) continue;
      startBuild(p, b); builds--; break;
    }
  }
}

/* ---------- production ---------- */
const AI_WEIGHTS = { inf: 0.3, recon: 0.02, mot: 0.1, tank: 0.14, arty: 0.09, mlrs: 0.04, aa: 0.07, spec: 0.04, fighter: 0.09, bomber: 0.07, heli: 0.05, uav: 0.03, sbomber: 0.015, frigate: 0.035, destroyer: 0.035, cruiser: 0.015, sub: 0.03, carrier: 0.006, transport: 0.02, cruise: 0.02, btm: 0.01, icbm: 0.01 };
function aiProduction(C) {
  const atWar = warsOf(C.id).length > 0;
  const co = CTY[C.id];
  const diff = DIFF[G.opts.diff];
  let T = clamp(2 + C.mil * C.mil * 0.4 + Math.log10(co.gdp + 10) * 1.2 + (C.inc.cash || 0) / 45, 2, 150) * (atWar ? 1.7 : 1) * (0.8 + 0.2 * diff.aiEco);
  const counts = {}; let total = 0;
  for (const [, u] of G.U) if (u.o === C.id) { counts[u.t] = (counts[u.t] || 0) + 1; if (UNITS[u.t].dom !== 'msl') total++; }
  for (const p of C.provs) for (const it of G.pv[p].q) { counts[it.t] = (counts[it.t] || 0) + 1; total++; }
  if (total >= T && !atWar) { /* still allow missile stock */ }
  const reserveCash = atWar ? 40 : Math.max(120, (C.inc.cash || 0) * 1.5);
  const order = C.provs.slice(); for (let i = order.length - 1; i > 0; i--) { const j = (R() * (i + 1)) | 0;[order[i], order[j]] = [order[j], order[i]]; }
  let started = 0;
  for (const p of order) {
    if (started >= 6) break;
    const pv = G.pv[p]; if (pv.q.length >= (atWar ? 2 : 1)) continue;
    const cands = [];
    for (const t of UNIT_ORDER) {
      const d = UNITS[t];
      if (d.dom === 'msl') { if (!C.nukes && t === 'icbm') continue; const have = counts[t] || 0; const cap = t === 'icbm' ? Math.ceil(C.mil * 0.9) : Math.ceil(C.mil * 1.1); if (have >= cap || C.mil < 4) continue; }
      else if (total >= T) continue;
      if (canQueue(p, t) !== '') continue;
      if (t === 'transport' && (counts.transport || 0) >= Math.max(1, Math.round(C.mil / 4))) continue;
      if (t === 'carrier' && (counts.carrier || 0) >= Math.max(1, Math.round(C.mil / 5))) continue;
      let w = AI_WEIGHTS[t] || 0.02;
      const share = (counts[t] || 0) / Math.max(1, total);
      w = Math.max(0.0005, w - share * 0.6 + w * 0.5);
      if (d.dom === 'land' && atWar) w *= 1.4;
      if (d.dom === 'sea' && !atWar && C.mil < 5) w *= 0.5;
      cands.push([t, w]);
    }
    if (!cands.length) continue;
    let sum = 0; for (const c of cands) sum += c[1];
    let r = R() * sum, ch = cands[0][0]; for (const c of cands) { r -= c[1]; if (r <= 0) { ch = c[0]; break; } }
    if (C.res.cash - (UNITS[ch].cost.c || 0) < reserveCash) continue;
    if (queueUnit(p, ch) === '') { counts[ch] = (counts[ch] || 0) + 1; total += UNITS[ch].dom === 'msl' ? 0 : 1; started++; }
  }
}

/* ---------- research ---------- */
function aiResearch(C) {
  if (C.res.cash > 600) { let n = 0; for (const [, u] of G.U) { if (u.o !== C.id || !canUpgrade(u) || R() > 0.25) continue; if (upgradeUnits([u.id]).n && ++n >= 4) break; } }
  const opts = researchOptions(C.id);
  const used = {}; for (const [, u] of G.U) if (u.o === C.id) used[u.t] = (used[u.t] || 0) + 1;
  for (const br in BRANCHES) {
    if (C.rs[br]) continue;
    const list = opts.filter(o => o.br === br && canAfford(C.id, techCost(o.k, o.id, o.lvl)) && C.res.cash > techCost(o.k, o.id, o.lvl).c * 1.6);
    if (!list.length) continue;
    let sum = 0; const ws = list.map(o => { const w = o.k === 'u' ? (used[o.id] || 0) + 0.4 : 1.2 + (o.id === 'infra' || o.id === 'indus' ? 1 : 0); sum += w; return w; });
    let r = R() * sum, ch = list[0]; for (let i = 0; i < list.length; i++) { r -= ws[i]; if (r <= 0) { ch = list[i]; break; } }
    startResearch(C.id, ch.k, ch.id, ch.lvl);
  }
}

/* ---------- diplomacy ---------- */
function aiDiplomacy(C) {
  const diff = DIFF[G.opts.diff];
  // seek peace in AI-vs-AI wars
  for (const e of warsOf(C.id)) {
    const E = G.C[e]; if (!E.ai) { if (aiPeaceEval(C.id, e).ok && R() < 0.5) news('peaceoffer', `🕊 ${C.n} готова обсудить мир с вами (Дипломатия → Предложить мир)`, C.cap, [C.id, e], 'p'); continue; }
    if (aiPeaceEval(e, C.id).ok && aiPeaceEval(C.id, e).ok) makePeace(C.id, e);
  }
  const wars = warsOf(C.id);
  if (G.hour < 24 * 6) return;
  if (wars.length >= (C.agg >= 4 ? 3 : C.agg >= 2 ? 2 : 1)) return;
  const myPow = alliancePower(C.id);
  if (myPow < 1) return;
  const chance = 0.011 * C.agg * G.tension * diff.aiAgg * (1 + (C.mil >= 7 ? 0.3 : 0));
  if (R() > chance) return;
  let totalWars = 0; for (let a = 0; a < NC; a++) for (let b = a + 1; b < NC; b++) if (G.war[a * NC + b]) totalWars++;
  if (totalWars > 10 + G.hour / 24 / 6) return;
  const nb = new Set(neighborsOf(C.id));
  let best = -1, bs = 0;
  for (const o of G.C) {
    if (!o.alive || o.id === C.id || areAllied(C.id, o.id) || G.war[C.id * NC + o.id]) continue;
    if (G.truce[C.id * NC + o.id] > G.hour) continue;
    const rival = C.rivals.indexOf(o.key) >= 0 || o.rivals.indexOf(C.key) >= 0;
    const rel = relOf(C.id, o.id);
    let sc = -rel * 0.8 + (rival ? 45 : 0) + (nb.has(o.id) ? 12 : 0);
    if (rel > 15 && !rival) continue;
    const tp = alliancePower(o.id) + 1;
    if (tp > myPow * (C.agg >= 5 ? 1.2 : 0.7)) continue;
    sc += Math.min(30, (myPow / tp) * 5);
    if (!nb.has(o.id) && !rival && !(G.al[C.alliance] && true)) sc -= 20;
    // island & far countries are rarely attacked unless a rival
    if (sc > bs) { bs = sc; best = o.id; }
  }
  if (best >= 0 && bs > 30) {
    declareWar(C.id, best);
    C.ai_s.lastWar = G.hour;
  }
}

/* ---------- military ---------- */
function provValue(c, p) {
  const pr = PROV[p];
  return pr.vp * 4 + pr.pop / 1.5e6 + (G.C[G.pv[p].o].cap === p ? 7 : 0) + (G.pv[p].b.factory + G.pv[p].b.airfield + G.pv[p].b.naval) * 0.4;
}
function aiMilitary(C) {
  const enemies = warsOf(C.id);
  if (!enemies.length) { C.ai_s.front = null; return; }
  const my = unitsOf(C.id);
  const land = my.filter(u => UNITS[u.t].dom === 'land' && u.st === 'idle');
  const grace = G.hour < 24 * 8;
  aiLand(C, enemies, land, my, grace);
  if (grace) return;
  aiSpies(C, enemies);
  aiAir(C, enemies, my);
  aiNavy(C, enemies, my);
  aiMissiles(C, enemies, my);
}
function aiLand(C, enemies, land, my, grace) {
  if (!land.length) return;
  const S = C.ai_s;
  // defend against invaders
  const threats = [];
  for (const p of C.provs) { let t = 0; for (const id of G.at[p]) { const u = G.U.get(id); if (u && G.war[C.id * NC + u.o] && UNITS[u.t].dom === 'land' && u.st !== 'cargo') t += unitPower(u); } if (t > 0) threats.push([p, t]); }
  threats.sort((a, b) => provValue(C.id, b[0]) * 1 - provValue(C.id, a[0]) * 1 || b[1] - a[1]);
  const used = new Set();
  for (const [tp, tpow] of threats.slice(0, 3)) {
    let have = 0; for (const id of G.at[tp]) { const u = G.U.get(id); if (u && u.o === C.id && UNITS[u.t].dom === 'land') have += unitPower(u); }
    if (have > tpow * 1.3) continue;
    const near = land.filter(u => !used.has(u.id) && u.loc !== tp && dist(u.loc, tp) < 260).sort((a, b) => dist(a.loc, tp) - dist(b.loc, tp)).slice(0, 8);
    for (const u of near) { const r = orderMove([u.id], tp); if (r.n) used.add(u.id); }
  }
  if (grace) return;
  // frontier target selection
  const enemySet = new Set(enemies);
  let target = S.front && G.pv[S.front.t].o !== C.id && enemySet.has(G.pv[S.front.t].o) ? S.front : null;
  if (!target || G.hour - S.front.h > 24 * 12) {
    let best = -1, bs = -1e9, bstage = -1;
    for (const p of C.provs) for (const a of PROV[p].adj) {
      const o = G.pv[a].o; if (!enemySet.has(o)) continue;
      const def = enemyPowerAt(C.id, a, 'land');
      const sc = provValue(C.id, a) + 3 - def * 0.05 - PROV[a].pop * 0 + (R() * 2);
      if (sc > bs) { bs = sc; best = a; bstage = p; }
    }
    if (best >= 0) { S.front = target = { t: best, s: bstage, h: G.hour }; }
    else {
      // look for enemy provinces reachable through allied/friendly territory
      const reach = new Set(); let bestA = -1, bsA = -1e9, stage = -1;
      for (const p of C.provs) for (const a of PROV[p].adj) { if (isFriendlyProv(C.id, a)) for (const b of PROV[a].adj) { const o = G.pv[b].o; if (enemySet.has(o)) { const sc = provValue(C.id, b) - enemyPowerAt(C.id, b, 'land') * 0.05; if (sc > bsA) { bsA = sc; bestA = b; stage = a; } } } }
      if (bestA >= 0) { S.front = target = { t: bestA, s: stage, h: G.hour }; }
      else { S.front = null; aiAmphibious(C, enemies, land, my); return; }
    }
  }
  const T = target.t;
  // stage: friendly (own/allied) province adjacent to target with most of my units
  let stage = target.s;
  if (!isFriendlyProv(C.id, stage) || PROV[stage].adj.indexOf(T) < 0) {
    let bs = -1; for (const a of PROV[T].adj) if (isFriendlyProv(C.id, a)) { let n = G.at[a].length; if (n > bs) { bs = n; stage = a; } }
    target.s = stage;
  }
  const reserve = Math.max(1, Math.floor(land.length * 0.12));
  let atStage = [], idleOthers = [];
  const cand = land.filter(u => !used.has(u.id)).sort((a, b) => dist(a.loc, C.cap) - dist(b.loc, C.cap));
  const keep = cand.slice(0, reserve);
  for (const u of cand.slice(reserve)) {
    if (u.loc === stage) atStage.push(u);
    else if (u.loc === T) { /* fighting or just captured */ }
    else idleOthers.push(u);
  }
  for (const u of idleOthers) { if (dist(u.loc, stage) < 520) orderMove([u.id], stage); }
  const defP = enemyPowerAt(C.id, T, 'land') * TERRAIN[PROV[T].terr].def * (1 + 0.12 * G.pv[T].b.fort);
  let myP = 0; for (const u of atStage) myP += unitPower(u);
  const attackNow = atStage.length >= 3 && (myP > defP * 1.0 || (G.hour - target.h > 24 * 3 && myP > defP * 0.6)) || (atStage.length >= 1 && defP === 0);
  if (attackNow) { orderMove(atStage.map(u => u.id), T); target.h = G.hour; }
}
function aiAmphibious(C, enemies, land, my) {
  // find transports docked with free capacity
  const trs = my.filter(u => u.t === 'transport' && u.st === 'idle' && u.loc < P);
  if (!trs.length) return;
  const enemySet = new Set(enemies);
  // best coastal enemy province
  let best = -1, bs = -1e9;
  for (const p of enemies.flatMap(e => G.C[e].provs)) { if (!isCoastal(p)) continue; const sc = provValue(C.id, p) - enemyPowerAt(C.id, p, 'land') * 0.04 - dist(trs[0].loc, p) * 0.01; if (sc > bs) { bs = sc; best = p; } }
  if (best < 0) return;
  const tr = trs[0];
  const grp = land.filter(u => u.loc === tr.loc);
  if (grp.length < 3) {
    // gather units to the port
    for (const u of land) if (u.loc !== tr.loc && dist(u.loc, tr.loc) < 300 && !G.at[tr.loc].includes(u.id)) orderMove([u.id], tr.loc);
    return;
  }
  const n = loadOnTransport(tr.id, grp.map(u => u.id));
  if (n >= 3 || tr.cargo.length >= 3) { orderMove([tr.id], best); }
}
function aiAir(C, enemies, my) {
  const air = my.filter(u => UNITS[u.t].dom === 'air' && u.st === 'base' && u.hp > 60 && u.bs >= 0);
  if (!air.length) return;
  const enemySet = new Set(enemies);
  // candidate targets: enemy provinces with units or value, near our airbases
  const cands = [];
  for (const e of enemies) for (const p of G.C[e].provs) {
    let sc = provValue(C.id, p) * 0.6;
    let pw = 0, nu = 0; for (const id of G.at[p]) { const u = G.U.get(id); if (u && G.war[C.id * NC + u.o]) { pw += unitPower(u); nu++; } }
    sc += nu * 1.2 + pw * 0.01 - G.pv[p].b.aa * 1.5;
    if (nu > 0 || G.pv[p].b.airfield || PROV[p].vp > 1) cands.push([p, sc]);
  }
  if (!cands.length) return;
  cands.sort((a, b) => b[1] - a[1]);
  const top = cands.slice(0, 20);
  let launched = 0; const maxLaunch = Math.max(2, Math.ceil(air.length * 0.5));
  const fighters = air.filter(u => u.t === 'fighter');
  for (const u of air) {
    if (launched >= maxLaunch) break;
    const d = UNITS[u.t];
    if (u.t === 'fighter') continue;
    const bp = basePos(u);
    let tgt = -1;
    for (const [p] of top) { if (Math.hypot(bp[0] - lx(p), bp[1] - ly(p)) < d.rng * 0.92) { tgt = p; break; } }
    if (tgt < 0) continue;
    if (orderAir([u.id], tgt, 'strike').n) launched++;
  }
  // fighters: patrol the front or capital
  const front = C.ai_s.front ? C.ai_s.front.s : C.cap;
  const enemyAirNear = cands.some(([p]) => G.at[p].some(id => { const e = G.U.get(id); return e && UNITS[e.t].dom === 'air' && G.war[C.id * NC + e.o]; }));
  let n = 0;
  for (const u of fighters) {
    if (n >= Math.ceil(fighters.length * 0.5)) break;
    const bp = basePos(u);
    // intercept enemy planes in range, else patrol front
    let tgt = -1;
    for (const [p] of top) { if (G.at[p].some(id => { const e = G.U.get(id); return e && UNITS[e.t].dom === 'air' && G.war[C.id * NC + e.o] && e.st !== 'cargo'; }) && Math.hypot(bp[0] - lx(p), bp[1] - ly(p)) < UNITS.fighter.rng * 0.9) { tgt = p; break; } }
    if (tgt < 0 && G.hour % 24 < 6 && Math.hypot(bp[0] - lx(front), bp[1] - ly(front)) < UNITS.fighter.rng * 0.8) tgt = front;
    if (tgt >= 0 && orderAir([u.id], tgt, tgt === front ? 'patrol' : 'strike').n) n++;
  }
}
function aiNavy(C, enemies, my) {
  const ships = my.filter(u => UNITS[u.t].dom === 'sea' && u.st === 'idle' && u.t !== 'transport' && u.hp > 55);
  if (ships.length < 2) return;
  const byLoc = new Map(); for (const u of ships) { if (!byLoc.has(u.loc)) byLoc.set(u.loc, []); byLoc.get(u.loc).push(u); }
  for (const [loc, grp] of byLoc) {
    const myP = grp.reduce((a, u) => a + unitPower(u), 0);
    // search nearby seas for enemy ships / enemy coast
    let best = -1, bs = -1e9;
    const seen = new Set([loc]); let fr = [loc];
    for (let d = 0; d < 5 && fr.length; d++) {
      const nx = [];
      for (const v of fr) for (const n of ADJS[v]) {
        if (seen.has(n)) continue; seen.add(n);
        if (n >= P) {
          nx.push(n);
          const ep = enemyPowerAt(C.id, n, 'sea');
          let coast = 0; for (const pp of SEA[n - P].ports) if (enemies.includes(G.pv[pp].o)) coast += provValue(C.id, pp);
          if (ep > 0 && ep > myP * 0.9) continue;
          const sc = ep * 0.1 + coast * 0.4 - d * 1.5 + (ep > 0 ? 3 : 0);
          if (sc > bs) { bs = sc; best = n; }
        }
      }
      fr = nx;
    }
    if (best >= 0 && bs > 0.5 && grp.length >= 2) orderMove(grp.map(u => u.id), best);
  }
}
function aiMissiles(C, enemies, my) {
  const msl = my.filter(u => UNITS[u.t].dom === 'msl' && u.st === 'base');
  if (!msl.length) return;
  // find high value targets
  let fired = 0;
  for (const u of msl) {
    const d = UNITS[u.t];
    if (fired >= 3) break;
    if (d.nuke) {
      // nuclear doctrine: retaliation for nukes that hit us / an ally, desperate last stand, or rare fanaticism
      const hits = G.news.filter(n => n.t === 'nuke' && n.c.length > 1 && G.hour - n.h < 24 * 8 && n.c[0] !== C.id && (n.c[1] === C.id || areAllied(n.c[1], C.id)) && !areAllied(n.c[0], C.id));
      const nuker = hits.length ? hits[hits.length - 1].c[0] : -1;
      const desperate = G.pv[C.cap].cap && G.pv[C.cap].cap.prog > 55 && C.agg >= 3 && G.hour > 24 * 14;
      const fanatic = C.agg >= 5 && G.hour > 24 * 150 && R() < 0.0015;
      if (nuker < 0 && !desperate && !fanatic) continue;
      if (nuker < 0 && G.lastAINuke && G.hour - G.lastAINuke < 48) continue;
      if (nuker >= 0 && !G.war[C.id * NC + nuker]) { if (G.C[nuker].alive) declareWar(C.id, nuker); else continue; }
      let best = -1, bs = -1;
      const pool = nuker >= 0 ? [nuker] : enemies;
      for (const e of pool) for (const p of G.C[e].provs) { if (dist(u.loc, p) > d.rng) continue; if (!G.war[C.id * NC + e]) continue; const sc = provValue(C.id, p) + (G.C[e].cap === p ? 6 : 0) + G.at[p].length * 0.3; if (sc > bs) { bs = sc; best = p; } }
      if (best >= 0 && fireMissile([u.id], best)) { fired++; if (nuker < 0) G.lastAINuke = G.hour; if (fired >= 2) break; }
    } else {
      let best = -1, bs = 0.5;
      for (const e of enemies) for (const p of G.C[e].provs) {
        if (dist(u.loc, p) > d.rng) continue;
        let n = 0, pw = 0; for (const id of G.at[p]) { const t = G.U.get(id); if (t && G.war[C.id * NC + t.o]) { n++; pw += unitPower(t); } }
        const sc = n * 1.0 + pw * 0.01 + (G.pv[p].b.airfield ? 1 : 0) + provValue(C.id, p) * 0.2 - G.pv[p].b.aa * 0.7;
        if (sc > bs) { bs = sc; best = p; }
      }
      if (best >= 0 && bs > 3 && R() < 0.5 && fireMissile([u.id], best)) fired++;
    }
  }
}

function aiTrade(C) {
  const use = C.use || {};
  for (const k of ['food', 'supp', 'fuel', 'comp', 'elec', 'rare']) {
    const net = (C.inc[k] || 0) - (use[k] || 0);
    const need = Math.max(0, -net) * 14 + 40;
    if (C.res[k] < need && C.res.cash > 400) {
      const qty = Math.min(need * 1.6 - C.res[k], C.res.cash * 0.2 / priceOf(k, true));
      if (qty > 5) trade(C.id, k, Math.floor(qty), true);
    }
  }
}

function aiSpies(C, enemies) {
  if (R() > 0.12 || C.res.cash < 600 || spiesOf(C.id).length >= spyCap(C.id)) return;
  const e = pick(enemies); const ps = G.C[e].provs.filter(p => G.pv[p].b.factory || G.pv[p].b.airfield || G.pv[p].b.naval);
  if (!ps.length) return;
  sendSpy(C.id, pick(ps), R() < 0.6 ? 'sabotage' : 'corrupt');
}
