'use strict';
/* A shorter game loop: earn, recruit, move, capture. Missile definitions remain
   readable only so old saves can be migrated safely; no one can create/fire them. */
const QUICK_UNITS = ['inf', 'recon', 'tank', 'arty', 'fighter', 'bomber', 'frigate', 'transport'];
function quickCost(cost) {
  if (!G?.opts.casual) return cost;
  return { c: Math.max(1, Math.round((cost.c || 0) * 0.65)), m: Math.round(((cost.m || 0) + (cost.s || 0) + (cost.e || 0) + (cost.r || 0)) * 0.6), p: cost.p || 0 };
}
function applyQuickRules() {
  // Removing old missiles must not inflate combat loss counters.
  for (const u of [...G.U.values()]) if (UNITS[u.t].dom === 'msl') {
    if (!['cargo', 'out', 'back'].includes(u.st)) atRemove(u);
    G.U.delete(u.id);
  }
  for (const pv of G.pv) {
    for (const q of pv.q) if (UNITS[q.t].dom === 'msl') refund(pv.o, UNITS[q.t].cost, q.m || 1);
    pv.q = pv.q.filter(q => UNITS[q.t].dom !== 'msl');
    if (pv.bq?.b === 'silo') { refund(pv.o, bldCost('silo', pv.bq.lvl), 0.9); pv.bq = null; }
    if (pv.b.silo) { pv.b.eco = Math.max(pv.b.eco, 1); pv.b.silo = 0; }
    if (G.opts.casual) { pv.fall = 0; pv.loyalty = 85; }
  }
  if (G.opts.casual) {
    G.opts.supply = false; G.autoBuy = false;
    for (const c of G.C) { c.tax = 1; c.inflation = 0; }
    G.campaign.routes = []; G.campaign.debts = []; G.campaign.reparations = [];
  }
  for (const c of G.C) c.nukes = false;
}
function quickDay() {
  const cp = G.campaign;
  // Close inherited optional contracts without leaving invisible payments running.
  cp.pacts = cp.pacts.filter(p => p.until > G.hour);
  for (const c of G.C) {
    if (c.leaveAt && c.leaveAt <= G.hour) { c.leaveAt = 0; leaveAlliance(c.id, true); }
    if (c.alive) recalc(c);
    if (G.hour % 168 === 0) for (const t of QUICK_UNITS) c.gen[t] = Math.min(MAX_GEN, c.gen[t] + 1);
  }
  if (G.hour % 168 === 0) { for (const u of G.U.values()) u.g = G.C[u.o].gen[u.t]; note(G.player, 'research', '⬆ Армия стала сильнее! Техника улучшена автоматически.', -1); }
  recordEconomy(); checkAchievements();
}
function quickEconomy(c) {
  if (!G.opts.casual) return;
  for (const k of ['food', 'supp', 'fuel', 'elec', 'rare']) {
    c.res[k] = Math.max(c.res[k], (c.use[k] || 0) * 10 + 500);
    c.short[k] = false;
  }
}
