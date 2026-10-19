'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const E = require('./engine');
function setup(opts = {}) {
  E.newGame({ playerKey: 'POL', scenario: 'sandbox', diff: 'normal', casual: false, supply: true, seed: 42, ...opts });
  for (const c of E.G.C) c.ai = false;
  return E.G;
}
function close(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`); }
test('sandbox runs 30 days without spontaneous wars, negative resources or broken indices', () => {
  E.newGame({ playerKey: 'POL', scenario: 'sandbox', diff: 'normal', seed: 42 });
  for (let h = 0; h < 24 * 30; h++) E.tick();
  assert.equal(E.G.hour, 720);
  assert.equal([...E.G.war].some(Boolean), false);
  for (const c of E.G.C) for (const value of Object.values(c.res)) assert.ok(Number.isFinite(value) && value >= 0);
  for (const [loc, ids] of E.G.at.entries()) for (const id of ids) { assert.ok(E.G.U.has(id)); assert.equal(E.G.U.get(id).loc, loc); }
  E.loadGame(E.saveGame());
  assert.equal(E.G.hour, 720);
});
test('tax change increases cash income; population loyalty falls after prolonged high taxes', () => {
  const G = setup(), c = G.C[G.player], before = c.inc.cash, loyalty = G.pv[c.cap].loyalty;
  assert.equal(E.taxRate(c.id, 1.4), ''); assert.ok(c.inc.cash > before);
  for (let i = 0; i < 10; i++) { G.hour += 24; E.campaignDay(); }
  assert.ok(G.pv[c.cap].loyalty < loyalty);
  assert.ok(E.taxRate(c.id, NaN)); assert.ok(E.taxRate(c.id, 5));
});
test('fuel reserve transfers conserve fuel and reject overdrafts', () => {
  const G = setup(), c = G.C[G.player], before = c.res.fuel;
  assert.equal(E.reserveTransfer(c.id, 100), true);
  close(c.res.fuel + c.reserveFuel, before);
  assert.equal(E.reserveTransfer(c.id, -101), false);
  assert.equal(E.reserveTransfer(c.id, -100), true); close(c.res.fuel, before);
});
test('isolated overseas army loses supply and a depot restores it', () => {
  const G = setup(), c = G.C[G.player], far = E.CTY[E.cidx.AU1].provs[0], owner = G.pv[far].o;
  G.C[owner].provs = G.C[owner].provs.filter(p => p !== far); c.provs.push(far); G.pv[far].o = c.id; G.pv[far].b.naval = 0; G.pv[far].b.depot = 0;
  const u = E.spawnUnit(c.id, 'inf', far); E.updateSupply();
  assert.equal(E.supplied(u), false);
  const isolatedAttack = E.campaignAttack(u);
  G.pv[far].b.depot = 1; E.updateSupply();
  assert.equal(E.supplied(u), true); assert.ok(E.campaignAttack(u) > isolatedAttack);
});
test('pacts prevent war, breaking a pact has a real reputation and relationship cost', () => {
  const G = setup(), a = G.player, b = E.cidx.BRA;
  G.rel[a * E.NC + b] = G.rel[b * E.NC + a] = 30;
  assert.equal(E.signPact(a, b), '');
  assert.ok(E.declareWar(a, b).includes('пакт')); assert.equal(E.atWar(a, b), false);
  const reputation = G.C[a].reputation;
  assert.equal(E.breakPact(a, b), true); close(G.C[a].reputation, reputation - 20);
  assert.equal(E.declareWar(a, b), ''); assert.equal(E.atWar(a, b), true);
});
test('guarantee appears in war preview and brings its guarantor into the war', () => {
  const G = setup(), a = E.cidx.BRA, b = E.cidx.PAK, guarantor = G.player;
  E.leaveAlliance(b, true); E.leaveAlliance(a, true);
  assert.equal(E.guaranteeCountry(guarantor, b), '');
  assert.ok(E.previewWar(a, b).against.includes(guarantor));
  E.declareWar(a, b); assert.equal(E.atWar(a, guarantor), true);
});
test('trade contracts conserve cash and resources; embargo stops the next delivery', () => {
  const G = setup(), a = G.player, b = E.cidx.DEU;
  G.rel[a * E.NC + b] = 50;
  const A = G.C[a], B = G.C[b]; A.res.cash = 3000; B.res.fuel = 2000;
  const cash = A.res.cash + B.res.cash, fuel = A.res.fuel + B.res.fuel, initial = A.res.fuel;
  assert.equal(E.createTradeRoute(a, b, 'fuel', 20), '');
  G.hour += 24; E.campaignDay();
  close(A.res.cash + B.res.cash, cash); close(A.res.fuel + B.res.fuel, fuel); close(A.res.fuel, initial + 20);
  E.toggleEmbargo(a, b); G.hour += 24; E.campaignDay(); close(A.res.fuel, initial + 20);
  assert.equal(G.campaign.routes[0].missed, 1);
  assert.ok(E.createTradeRoute(a, b, 'not-a-resource', 20));
});
test('loan moves existing money and pays exactly 5% interest over ten days', () => {
  const G = setup(), A = G.C[G.player], B = G.C[E.cidx.DEU]; B.res.cash = 5000; G.rel[A.id * E.NC + B.id] = 60;
  const a0 = A.res.cash, b0 = B.res.cash;
  assert.equal(E.requestLoan(A.id, B.id), ''); close(A.res.cash, a0 + 500); close(B.res.cash, b0 - 500);
  for (let d = 0; d < 10; d++) { G.hour += 24; E.campaignDay(); }
  close(A.res.cash, a0 - 25); close(B.res.cash, b0 + 25); assert.equal(G.campaign.debts.length, 0);
});
test('saved unit experience, hold orders, groups, reserves and options survive a round trip', () => {
  const G = setup(), u = E.spawnUnit(G.player, 'inf', G.C[G.player].cap); u.xp = 76; u.fatigue = 15;
  E.setStance([u.id], 'defend'); G.campaign.groups.push({ name: 'Тест', ids: [u.id] }); G.autoBuy = false; G.autoDef = false;
  E.reserveTransfer(G.player, 100);
  E.loadGame(E.saveGame());
  const loaded = E.G.U.get(u.id);
  assert.equal(loaded.xp, 76); assert.equal(loaded.hold, true); assert.equal(loaded.stance, 'defend'); assert.equal(E.G.autoBuy, false); assert.equal(E.G.autoDef, false); assert.equal(E.G.C[E.G.player].reserveFuel, 100); assert.equal(E.G.campaign.groups[0].name, 'Тест');
});
test('old version-one save from before this update migrates to version two', () => {
  const files = ['world', 'world_decode', 'data', 'engine_core', 'engine_sim', 'engine_dipl', 'ai'];
  const code = files.map(f => execFileSync('git', ['show', '6b20006:src/' + f + '.js'], { encoding: 'utf8', maxBuffer: 8e6 })).join('\n');
  const legacy = new Function(code + '\nnewGame({playerKey:"POL",scenario:"cold",diff:"normal",seed:7});for(let h=0;h<48;h++)tick();return saveGame();')();
  assert.equal(JSON.parse(legacy).v, 1);
  E.loadGame(legacy); assert.equal(E.G.hour, 48); assert.ok(E.G.campaign); assert.equal(JSON.parse(E.saveGame()).v, 2);
  E.tick(); assert.equal(E.G.hour, 49);
});
test('future versions and corrupt files cannot replace the active game', () => {
  setup(); const before = E.G;
  for (const mutate of [o => o.v = 999, o => o.world = 'other', o => o.C[0].res.cash = -5, o => o.U[0].loc = 999999, o => o.campaign.treasury.days = -1, o => o.pv[0].o = 500, o => o.U.push(o.U[0])]) {
    const bad = JSON.parse(E.saveGame()); mutate(bad); assert.throws(() => E.loadGame(JSON.stringify(bad))); assert.equal(E.G, before);
  }
});
test('reordering a production queue preserves progress and paid resources', () => {
  const G = setup(), c = G.C[G.player], p = c.cap; c.res.cash = 10000;
  assert.equal(E.queueUnit(p, 'inf'), ''); assert.equal(E.queueUnit(p, 'recon'), '');
  G.pv[p].q[0].left = 4;
  const cash = c.res.cash; assert.equal(E.reorderQueue(p, 1, -1), true);
  assert.equal(G.pv[p].q[0].t, 'recon'); assert.equal(G.pv[p].q[1].left, 4); close(c.res.cash, cash);
});
test('combat produces loss reports and real experience rather than display-only counters', () => {
  const G = setup(), a = G.player, b = E.cidx.BLR, loc = G.C[a].cap;
  G.war[a * E.NC + b] = G.war[b * E.NC + a] = 1;
  const friendly = E.spawnUnit(a, 'tank', loc), enemy = E.spawnUnit(b, 'inf', loc); enemy.hp = 1;
  for (let i = 0; i < 8 && G.U.has(enemy.id); i++) { G.hour++; E.fightAt(loc); E.campaignTick(); }
  assert.ok(G.campaign.reports.length > 0); assert.ok(friendly.xp > 0); assert.equal(G.U.has(enemy.id), false); assert.ok(G.C[b].lossTypes.inf >= 1);
});
test('seeded sandbox simulation resumes identically after save/load', () => {
  setup(); for (let h = 0; h < 48; h++) E.tick();
  const saved = E.saveGame();
  for (let h = 0; h < 72; h++) E.tick();
  const expected = JSON.parse(E.saveGame());
  E.loadGame(saved); for (let h = 0; h < 72; h++) E.tick();
  const actual = JSON.parse(E.saveGame());
  assert.deepEqual(actual.C.map(c => c.res), expected.C.map(c => c.res)); assert.deepEqual(actual.U, expected.U); assert.equal(actual.rng, expected.rng);
});
test('history stays bounded and observer settings survive save/load', () => {
  setup({ observer: true });
  for (let i = 0; i < 150; i++) E.recordEconomy();
  assert.equal(E.G.campaign.history.length, 120);
  E.loadGame(E.saveGame()); assert.equal(E.G.C.every(c => c.ai), true); assert.equal(E.G.fogOff, true);
});
test('missed loan payments remain owed after the original schedule expires', () => {
  const G = setup(), A = G.C[G.player], B = G.C[E.cidx.DEU]; B.res.cash = 5000; G.rel[A.id * E.NC + B.id] = 60;
  assert.equal(E.requestLoan(A.id, B.id), ''); A.res.cash = 0;
  for (let d = 0; d < 10; d++) { G.hour += 24; E.campaignDay(); }
  assert.equal(G.campaign.debts.length, 1); close(G.campaign.debts[0].arrears, 525);
  const lenderCash = B.res.cash; A.res.cash = 600; G.hour += 24; E.campaignDay();
  close(A.res.cash, 75); close(B.res.cash, lenderCash + 525); assert.equal(G.campaign.debts.length, 0);
});
test('enemy naval superiority blocks ship production without deleting its queue', () => {
  const G = setup(), c = E.cidx.GB1, enemy = E.cidx.BRA;
  const port = G.C[c].provs.find(p => G.pv[p].b.naval > 0);
  assert.ok(port !== undefined); G.war[c * E.NC + enemy] = G.war[enemy * E.NC + c] = 1;
  for (const sea of E.PROV[port].seas) for (let i = 0; i < 10; i++) E.spawnUnit(enemy, 'cruiser', E.P + sea);
  assert.equal(E.portBlockaded(c, port), true);
  assert.ok(E.canQueue(port, 'frigate').includes('блокирован'));
});
test('explicit waypoints execute in order and stop cancels queued travel', () => {
  const G = setup(), c = G.C[G.player], a = c.provs.find(p => p !== c.cap), b = c.provs.find(p => p !== c.cap && p !== a);
  const u = E.spawnUnit(c.id, 'recon', c.cap); E.orderMove([u.id], a); u.waypoints = [b];
  for (let i = 0; i < 1000 && (u.loc !== b || u.st !== 'idle'); i++) E.tick();
  assert.equal(u.loc, b); assert.equal(u.st, 'idle'); assert.equal(u.waypoints.length, 0);
  E.orderMove([u.id], a); u.waypoints = [c.cap]; E.stopUnits([u.id]); assert.equal(u.waypoints.length, 0); assert.equal(u.hold, true);
});
test('leaving an alliance has a real 72-hour delay and updates access', () => {
  const G = setup(), c = G.C[G.player], alliance = c.alliance;
  E.leaveAlliance(c.id); assert.equal(c.alliance, alliance);
  G.hour += 48; E.campaignDay(); assert.equal(c.alliance, alliance);
  G.hour += 24; E.campaignDay(); assert.equal(c.alliance, -1); assert.equal(G.al[alliance].members.includes(c.id), false);
});
test('corruption reduces current tax production without making an occupied economy negative', () => {
  const G = setup(), c = G.C[G.player];
  for (const p of c.provs) { G.pv[p].dmg = 100; G.pv[p].fall = 0.75; G.pv[p].corrupt = 48; G.pv[p].since = 0; }
  E.recalc(c); assert.ok(c.inc.cash >= 0); E.loadGame(E.saveGame()); assert.ok(E.G.C[E.G.player].inc.cash >= 0);
});
test('default quick play has cheaper units, fast recruitment and no supply management', () => {
  E.newGame({ playerKey: 'POL', scenario: 'cold', diff: 'easy', seed: 7 });
  const G = E.G, c = G.C[G.player], p = c.cap;
  assert.equal(G.opts.casual, true); assert.equal(G.opts.supply, false);
  assert.ok(E.unitCostFor(c.id, 'inf').c < E.UNITS.inf.cost.c);
  assert.deepEqual(Object.keys(E.unitCostFor(c.id, 'tank')).sort(), ['c', 'm', 'p']);
  assert.equal(E.queueUnit(p, 'inf'), ''); assert.ok(G.pv[p].q[0].total < E.UNITS.inf.time);
  const count = G.U.size; for (let i = 0; i < 12; i++) E.tick(); assert.ok(G.U.size > count);
  for (const key of ['food', 'supp', 'fuel']) { c.res[key] = 0; c.short[key] = true; }
  E.tick(); for (const key of ['food', 'supp', 'fuel']) { assert.ok(c.res[key] > 0); assert.equal(c.short[key], false); }
});
test('missiles cannot be created, ordered, researched or fired in either game mode', () => {
  for (const casual of [true, false]) {
    setup({ casual }); const c = E.G.C[E.G.player], p = c.cap;
    for (const t of ['cruise', 'btm', 'icbm']) {
      assert.equal(E.spawnUnit(c.id, t, p), null); assert.ok(E.canQueue(p, t).includes('удалено'));
    }
    assert.equal(E.fireMissile([], p), 0);
    assert.equal(E.researchOptions(c.id).some(o => ['cruise', 'btm', 'icbm', 'rockets', 'nuclear', 'abm'].includes(o.id)), false);
    assert.equal([...E.G.U.values()].some(u => E.UNITS[u.t].dom === 'msl'), false);
  }
});
test('version 0.3 saves lose missiles on the ground, in flight and in production', () => {
  const files = ['world', 'world_decode', 'data', 'engine_core', 'engine_sim', 'engine_dipl', 'ai', 'campaign'];
  const code = files.map(f => execFileSync('git', ['show', 'e228af1:src/' + f + '.js'], { encoding: 'utf8', maxBuffer: 8e6 })).join('\n');
  const legacy = new Function(code + `
    newGame({playerKey:'US1',scenario:'cold',diff:'easy',seed:7});
    const p=G.C[G.player].cap, enemy=cidx.RUS;
    const rocket=spawnUnit(G.player,'icbm',p);
    G.war[G.player*NC+enemy]=G.war[enemy*NC+G.player]=1;
    fireMissile([rocket.id],G.C[enemy].cap);
    G.pv[p].q.push({t:'cruise',left:10,total:18,m:1});
    return saveGame();`)();
  assert.ok(JSON.parse(legacy).U.some(u => u.t === 'icbm' && u.st === 'out'));
  E.loadGame(legacy);
  assert.equal([...E.G.U.values()].some(u => E.UNITS[u.t].dom === 'msl'), false);
  assert.equal(E.G.pv.some(p => p.q.some(q => E.UNITS[q.t].dom === 'msl')), false);
  assert.equal(E.G.pv.some(p => p.b.silo > 0), false);
  E.tick(); E.loadGame(E.saveGame());
});
