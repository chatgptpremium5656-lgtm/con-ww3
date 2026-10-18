#!/usr/bin/env node
/* Generates src/world.js from Natural Earth data:
   - rasterises countries on a Miller-projected grid
   - splits countries into provinces (geodesic k-means around real cities)
   - splits oceans into sea zones
   - traces all region boundaries into shared arcs (topologically consistent)
   Usage: node tools/build_world.js
*/
const fs = require('fs');
const path = require('path');
const D = path.join(__dirname, 'data');

// ---------- parameters ----------
const RES = 5;                    // cells per degree of longitude
const LAT_TOP = 83.7, LAT_BOT = -56.5;
const TARGET_PROV = +(process.env.NPROV || 760);
const TARGET_SEAS = +(process.env.NSEA || 96);
let seed = 12345;
function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }

// ---------- projection (Miller) ----------
const RAD = Math.PI / 180;
const miller = lat => 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * lat * RAD)) / RAD;
const Y_TOP = miller(LAT_TOP), Y_BOT = miller(LAT_BOT);
const W = 360 * RES, H = Math.ceil((Y_TOP - Y_BOT) * RES);
const px = lon => (lon + 180) * RES;
const py = lat => (Y_TOP - miller(lat)) * RES;
const unY = y => { const m = (Y_TOP - y / RES) * RAD / 1.25; return (Math.atan(Math.sinh(m)) ) ; };
function invLat(y) { // inverse miller
  const m = (Y_TOP - y / RES) * RAD / 1.25;
  return (Math.atan(Math.exp(m)) - Math.PI / 4) / 0.4 / RAD;
}
const invLon = x => x / RES - 180;

// ---------- load data ----------
const geo = JSON.parse(fs.readFileSync(path.join(D, 'ne_50m_admin_0_countries.geojson'), 'utf8'));
const places = JSON.parse(fs.readFileSync(path.join(D, 'ne_50m_populated_places.geojson'), 'utf8'));
let profiles = {};
for (const f of ['profiles_part1.json', 'profiles_part2.json', 'profiles_part3.json']) {
  try { Object.assign(profiles, JSON.parse(fs.readFileSync(path.join(D, f), 'utf8'))); } catch (e) { console.warn('missing', f); }
}
let seaNames = [];
try { seaNames = JSON.parse(fs.readFileSync(path.join(D, 'seas.json'), 'utf8')); } catch (e) { console.warn('missing seas.json'); }

function ckey(p) {
  if (p.ADM0_A3 === 'PSX') return 'PSX';
  const s = p.SOV_A3;
  if (s === 'ATA') return null;
  if (s === 'SOL') return 'SOM';
  if (s === 'CYN') return 'CYP';
  if (s === 'KAS') return 'IND';
  return s;
}

// ---------- rasterise countries ----------
const t0 = Date.now();
const keys = [];            // country keys in order
const kidx = {};
const cinfo = {};
for (const f of geo.features) {
  const k = ckey(f.properties); if (!k) continue;
  if (!(k in kidx)) { kidx[k] = keys.length; keys.push(k); cinfo[k] = { key: k, name: f.properties.SOVEREIGNT, nameRu: f.properties.NAME_RU, pop: 0, gdp: 0, lx: 0, ly: 0, big: 0 }; }
  const c = cinfo[k];
  c.pop += f.properties.POP_EST; c.gdp += f.properties.GDP_MD;
  if (f.properties.POP_EST > c.big) { c.big = f.properties.POP_EST; c.lx = f.properties.LABEL_X; c.ly = f.properties.LABEL_Y; c.ccode = f.properties.ADM0_A3; }
}
const cty = new Int16Array(W * H).fill(-1);
for (const f of geo.features) {
  const k = ckey(f.properties); if (!k) continue;
  const ci = kidx[k];
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const rows = new Map();
  for (const poly of polys) for (const ring of poly) {
    for (let i = 0; i < ring.length - 1; i++) {
      let [lo1, la1] = ring[i], [lo2, la2] = ring[i + 1];
      if (la1 < LAT_BOT - 2 && la2 < LAT_BOT - 2) continue;
      la1 = Math.max(la1, LAT_BOT - 1); la2 = Math.max(la2, LAT_BOT - 1);
      let x1 = px(lo1), y1 = py(la1), x2 = px(lo2), y2 = py(la2);
      if (y1 === y2) continue;
      if (y1 > y2) { [x1, x2] = [x2, x1]; [y1, y2] = [y2, y1]; }
      const r0 = Math.max(0, Math.ceil(y1 - 0.5)), r1 = Math.min(H - 1, Math.ceil(y2 - 0.5) - 1);
      for (let r = r0; r <= r1; r++) {
        const yc = r + 0.5;
        const x = x1 + (x2 - x1) * (yc - y1) / (y2 - y1);
        let a = rows.get(r); if (!a) rows.set(r, a = []); a.push(x);
      }
    }
  }
  for (const [r, a] of rows) {
    a.sort((p, q) => p - q);
    for (let i = 0; i + 1 < a.length; i += 2) {
      const xa = Math.max(0, Math.ceil(a[i] - 0.5)), xb = Math.min(W - 1, Math.ceil(a[i + 1] - 0.5) - 1);
      for (let x = xa; x <= xb; x++) cty[r * W + x] = ci;
    }
  }
}
console.log('raster', Date.now() - t0, 'ms', W, H);

// countries lacking cells: force one cell at label point if water
const cnt = new Int32Array(keys.length);
for (let i = 0; i < cty.length; i++) if (cty[i] >= 0) cnt[cty[i]]++;
for (let ci = 0; ci < keys.length; ci++) if (cnt[ci] === 0) {
  const c = cinfo[keys[ci]];
  const x = Math.round(px(c.lx)), y = Math.round(py(c.ly));
  if (x >= 0 && x < W && y >= 0 && y < H && cty[y * W + x] < 0) { cty[y * W + x] = ci; cnt[ci] = 1; }
}
// drop tiny specks (< 2 cells) of countries that have bigger parts
const N = W * H;
const comp = new Int32Array(N).fill(-1);
const compInfo = []; // {c, cells:[]}
{
  const stack = [];
  for (let s = 0; s < N; s++) {
    if (cty[s] < 0 || comp[s] >= 0) continue;
    const id = compInfo.length, c = cty[s], cells = [];
    comp[s] = id; stack.push(s);
    while (stack.length) {
      const v = stack.pop(); cells.push(v);
      const x = v % W, y = (v / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (cty[n] === c && comp[n] < 0) { comp[n] = id; stack.push(n); }
      }
    }
    compInfo.push({ c, cells });
  }
}
{
  const per = keys.map(() => 0);
  for (const ci of compInfo) per[ci.c] += ci.cells.length;
  for (const ci of compInfo) {
    if (ci.cells.length < 3 && per[ci.c] - ci.cells.length >= 3) { for (const v of ci.cells) cty[v] = -1; ci.dead = true; }
  }
}

// ---------- province allocation ----------
const cells = keys.map(() => 0);
for (const ci of compInfo) if (!ci.dead) cells[ci.c] += ci.cells.length;
function rawK(ci, s) {
  const k = keys[ci], pr = profiles[k] || {};
  const pop = cinfo[k].pop / 1e6;
  const a = cells[ci];
  if (!a) return 0;
  return s * Math.pow(a, 0.62) * (1 + 0.13 * Math.log10(Math.max(pop, 1)));
}
let sLo = 0.001, sHi = 1;
for (let it = 0; it < 40; it++) {
  const s = (sLo + sHi) / 2; let tot = 0;
  for (let ci = 0; ci < keys.length; ci++) { if (cells[ci]) tot += Math.min(42, Math.max(1, Math.round(rawK(ci, s)))); }
  if (tot > TARGET_PROV) sHi = s; else sLo = s;
}
const S_K = (sLo + sHi) / 2;
const kCountry = keys.map((k, ci) => cells[ci] ? Math.min(42, Math.max(1, Math.round(rawK(ci, S_K)))) : 0);
console.log('provinces target', kCountry.reduce((a, b) => a + b, 0));

// ---------- geodesic partition helpers ----------
class Heap {
  constructor() { this.k = []; this.v = []; }
  push(key, val) {
    const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val);
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v; const rk = k[0], rv = v[0];
    const lk = k.pop(), lv = v.pop(); const n = k.length;
    if (n) {
      let i = 0;
      while (true) {
        let c = 2 * i + 1; if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break; k[i] = k[c]; v[i] = v[c]; i = c;
      }
      k[i] = lk; v[i] = lv;
    }
    this.rk = rk; return rv;
  }
  get size() { return this.k.length; }
}
const NB = [[1, 0, 10], [-1, 0, 10], [0, 1, 10], [0, -1, 10], [1, 1, 14], [1, -1, 14], [-1, 1, 14], [-1, -1, 14]];

// typed-array geodesic partition
const DIST = new Int32Array(N), OWN = new Int32Array(N), MARK = new Int32Array(N);
let STAMP = 0;
function partition(seeds, list, wrap) {
  STAMP++;
  for (let i = 0; i < list.length; i++) { const c = list[i]; MARK[c] = STAMP; DIST[c] = 1 << 30; OWN[c] = -1; }
  const h = new Heap();
  seeds.forEach((s, i) => { DIST[s] = 0; OWN[s] = i; h.push(0, s); });
  while (h.size) {
    const v = h.pop(), d = h.rk;
    if (DIST[v] < d) continue;
    const x = v % W, y = (v / W) | 0, o = OWN[v];
    for (let q = 0; q < 8; q++) {
      const nb = NB[q]; let nx = x + nb[0]; const ny = y + nb[1];
      if (ny < 0 || ny >= H) continue;
      if (nx < 0 || nx >= W) { if (!wrap) continue; nx = (nx + W) % W; }
      const n = ny * W + nx;
      if (MARK[n] !== STAMP) continue;
      const nd = d + nb[2];
      if (nd < DIST[n]) { DIST[n] = nd; OWN[n] = o; h.push(nd, n); }
    }
  }
}
function kmeansRegion(list, k, wrap) {
  // farthest-point init on a subsample (euclid), then geodesic Lloyd
  const samp = Math.max(1, Math.floor(list.length / 3000));
  const S = []; for (let i = (rnd() * samp) | 0; i < list.length; i += samp) S.push(list[i]);
  let seeds = [S[(rnd() * S.length) | 0]];
  const md = new Float64Array(S.length).fill(1e18);
  const ed = (a, b) => { let dx = Math.abs((a % W) - (b % W)); if (wrap && dx > W / 2) dx = W - dx; const dy = ((a / W) | 0) - ((b / W) | 0); return dx * dx + dy * dy; };
  while (seeds.length < k) {
    const last = seeds[seeds.length - 1]; let best = -1, bd = -1;
    for (let i = 0; i < S.length; i++) { const d = ed(S[i], last); if (d < md[i]) md[i] = d; if (md[i] > bd) { bd = md[i]; best = i; } }
    if (best < 0 || bd <= 0) break;
    seeds.push(S[best]);
  }
  for (let it = 0; it < 4; it++) {
    partition(seeds, list, wrap);
    const sx = new Float64Array(seeds.length), sy = new Float64Array(seeds.length), n = new Int32Array(seeds.length);
    const ref = seeds.map(s => s % W);
    for (let i = 0; i < list.length; i++) {
      const c = list[i], o = OWN[c]; if (o < 0) continue;
      let x = c % W; if (wrap) { if (x - ref[o] > W / 2) x -= W; else if (ref[o] - x > W / 2) x += W; }
      sx[o] += x; sy[o] += (c / W) | 0; n[o]++;
    }
    const best = seeds.slice(), bdist = new Float64Array(seeds.length).fill(1e18);
    for (let i = 0; i < list.length; i++) {
      const c = list[i], o = OWN[c]; if (o < 0 || !n[o]) continue;
      let mx = sx[o] / n[o]; if (wrap) { mx = ((mx % W) + W) % W; }
      let dx = Math.abs((c % W) - mx); if (wrap && dx > W / 2) dx = W - dx;
      const dy = ((c / W) | 0) - sy[o] / n[o]; const d = dx * dx + dy * dy;
      if (d < bdist[o]) { bdist[o] = d; best[o] = c; }
    }
    seeds = best;
  }
  return seeds;
}

// ---------- build provinces ----------
const label = new Int32Array(N).fill(-1);   // province id (>=0) or sea id (offset later)
let provs = [];
const t1 = Date.now();
{
  const compsByC = keys.map(() => []);
  compInfo.forEach((ci, idx) => { if (!ci.dead) compsByC[ci.c].push(idx); });
  for (let ci = 0; ci < keys.length; ci++) {
    const k = kCountry[ci]; if (!k) continue;
    const comps = compsByC[ci].map(i => compInfo[i]).sort((a, b) => b.cells.length - a.cells.length);
    const total = comps.reduce((a, c) => a + c.cells.length, 0);
    // allocate k among components
    const avg = total / k;
    let alloc = comps.map(c => ({ c, n: c.cells.length >= Math.max(6, 0.55 * avg) ? Math.max(1, Math.round(c.cells.length / avg)) : 0 }));
    let sum = alloc.reduce((a, b) => a + b.n, 0);
    if (sum === 0) alloc[0].n = 1;
    for (const a of alloc) a.n = Math.min(a.n, Math.max(1, Math.floor(a.c.cells.length / 12)));
    const bigSeeds = [];
    const compDomain = []; // domain owners
    for (const a of alloc) {
      if (a.n === 0) continue;
      const seeds = kmeansRegion(a.c.cells, a.n, false);
      partition(seeds, a.c.cells, false);
      const base = provs.length;
      seeds.forEach((s, i) => provs.push({ id: base + i, c: ci, cells: [], seed: s }));
      for (const v of a.c.cells) { if (OWN[v] >= 0) { label[v] = base + OWN[v]; provs[base + OWN[v]].cells.push(v); } }
      // any unreached cell (shouldn't) -> nearest
      for (const v of a.c.cells) if (label[v] < 0) { label[v] = base; provs[base].cells.push(v); }
    }
    // small components: attach to nearest province of the same country (euclid) or drop if remote
    const mine = provs.filter(p => p.c === ci);
    for (const a of alloc) if (a.n === 0) {
      for (const v of a.c.cells) {
        let best = null, bd = 1e18;
        const x = v % W, y = (v / W) | 0;
        for (const p of mine) {
          const sx = p.seed % W, sy = (p.seed / W) | 0; const d = (sx - x) ** 2 + (sy - y) ** 2;
          if (d < bd) { bd = d; best = p; }
        }
        if (!best) { best = { id: provs.length, c: ci, cells: [], seed: v }; provs.push(best); mine.push(best); }
        else if (bd > 30 * 30 && a.c.cells.length < 40) continue; // remote speck -> ocean
        label[v] = best.id; best.cells.push(v);
      }
    }
  }
}
console.log('provinces', provs.length, Date.now() - t1, 'ms');

// ---------- sea zones ----------
const P = provs.length;
const isWater = v => label[v] < 0;
const seas = [];
{
  // water components (with x wrap)
  const wcomp = new Int32Array(N).fill(-1); const wcs = [];
  const stack = [];
  for (let s = 0; s < N; s++) {
    if (label[s] >= 0 || wcomp[s] >= 0) continue;
    const id = wcs.length, list = [];
    wcomp[s] = id; stack.push(s);
    while (stack.length) {
      const v = stack.pop(); list.push(v);
      const x = v % W, y = (v / W) | 0;
      for (const [dx, dy] of NB) {
        let nx = x + dx; const ny = y + dy;
        if (ny < 0 || ny >= H) continue;
        nx = (nx + W) % W;
        const n = ny * W + nx;
        if (label[n] < 0 && wcomp[n] < 0) { wcomp[n] = id; stack.push(n); }
      }
    }
    wcs.push(list);
  }
  const totalW = wcs.reduce((a, l) => a + l.length, 0);
  console.log('water comps', wcs.length, totalW);
  // use coastal weighting: more zones near coasts => reduce effective area of distance by transforming? keep equal-area
  const targetArea = totalW / TARGET_SEAS;
  for (const list of wcs) {
    if (list.length < 40) { continue; }
    const k = Math.max(1, Math.round(list.length / targetArea));
    const seeds = kmeansRegion(list, k, true);
    partition(seeds, list, true);
    const base = seas.length;
    seeds.forEach((s, i) => seas.push({ id: P + base + i, cells: [], seed: s }));
    for (const v of list) { if (OWN[v] >= 0) { label[v] = P + base + OWN[v]; seas[base + OWN[v]].cells.push(v); } }
  }
  // leftover tiny water bodies (lakes inside land like gaps): turn into nearest land province
  for (let v = 0; v < N; v++) if (label[v] < 0) {
    const x = v % W, y = (v / W) | 0;
    let found = -1;
    for (let r = 1; r < 8 && found < 0; r++) {
      for (let dy = -r; dy <= r && found < 0; dy++) for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const l = label[ny * W + nx]; if (l >= 0) { found = l; break; }
      }
    }
    label[v] = found >= 0 ? found : P;
    if (found >= 0 && found < P) provs[found].cells.push(v); else if (found >= P) seas[found - P].cells.push(v);
  }
}
console.log('seas', seas.length);

// ---------- adjacency ----------
const R = P + seas.length;
const adj = Array.from({ length: R }, () => new Map());
function addAdj(a, b, w) { if (a === b || a < 0 || b < 0) return; adj[a].set(b, (adj[a].get(b) || 0) + w); adj[b].set(a, (adj[b].get(a) || 0) + w); }
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const a = label[y * W + x];
  if (x + 1 < W) addAdj(a, label[y * W + x + 1], 1);
  if (y + 1 < H) addAdj(a, label[(y + 1) * W + x], 1);
  if (x === 0) addAdj(a, label[y * W + W - 1], 1);
}

// ---------- cities ----------
const cityList = [];
for (const f of places.features) {
  const p = f.properties;
  let k = p.ADM0_A3 === 'PSX' ? 'PSX' : p.SOV_A3;
  if (k === 'SOL') k = 'SOM'; if (k === 'CYN') k = 'CYP'; if (k === 'KAS') k = 'IND';
  const x = px(p.LONGITUDE), y = py(p.LATITUDE);
  if (y < 0 || y >= H) continue;
  const gx = Math.min(W - 1, Math.max(0, Math.floor(x))), gy = Math.floor(y);
  let l = label[gy * W + gx];
  if (l >= P || l < 0) { // snap to nearest land
    let found = -1;
    for (let r = 1; r < 6 && found < 0; r++) for (let dy = -r; dy <= r && found < 0; dy++) for (let dx = -r; dx <= r; dx++) {
      const nx = gx + dx, ny = gy + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ll = label[ny * W + nx]; if (ll >= 0 && ll < P && (kidx[k] === undefined || provs[ll].c === kidx[k])) { found = ll; break; }
    }
    l = found;
  }
  if (l < 0) continue;
  cityList.push({ name: p.NAME_RU || p.NAME, en: p.NAMEASCII, pop: p.POP_MAX, x, y, prov: l, cap: p.ADM0CAP === 1, key: k, feature: p.FEATURECLA });
}
cityList.sort((a, b) => b.pop - a.pop);

// ---------- province attributes ----------
function ellipse(lon, lat, rx, ry, t) { return { lon, lat, rx, ry, t }; }
const TERR_FEATS = [
  // mountains
  ellipse(85, 32, 13, 5, 'mountain'), ellipse(10, 46.6, 6, 1.8, 'mountain'), ellipse(-110, 46, 6, 14, 'mountain'), ellipse(-118, 38, 3, 5, 'mountain'),
  ellipse(-70, -20, 3.5, 28, 'mountain'), ellipse(-76, 0, 3, 10, 'mountain'), ellipse(-72, 6, 3, 3, 'mountain'), ellipse(44, 42.3, 5, 1.8, 'mountain'), ellipse(60, 58, 2.5, 9, 'mountain'),
  ellipse(80, 42, 10, 3, 'mountain'), ellipse(92, 49, 7, 3, 'mountain'), ellipse(70, 35.5, 6, 3, 'mountain'), ellipse(50, 33, 4, 4, 'mountain'), ellipse(-3, 32, 9, 2.5, 'mountain'),
  ellipse(39, 9, 4, 4, 'mountain'), ellipse(24, 48, 5, 1.6, 'mountain'), ellipse(0, 42.7, 3.5, 0.8, 'mountain'), ellipse(15, 14, 7, 6, 'mountain'), ellipse(14, 64, 4, 8, 'mountain'),
  ellipse(-80, 38, 4, 7, 'mountain'), ellipse(-104, 24, 4, 8, 'mountain'), ellipse(130, 63, 14, 5, 'mountain'), ellipse(139, 36.5, 2, 4, 'mountain'), ellipse(22, 41, 5, 3, 'mountain'),
  ellipse(103, 28, 6, 5, 'mountain'), ellipse(98, 22, 3, 5, 'mountain'), ellipse(122, 24, 1, 2, 'mountain'), ellipse(147, -6, 8, 3, 'mountain'), ellipse(-72, -38, 2, 12, 'mountain'),
  ellipse(33, 37, 6, 2, 'mountain'), ellipse(-150, 63, 12, 3, 'mountain'), ellipse(-125, 60, 6, 8, 'mountain'), ellipse(150, 46, 6, 8, 'mountain'),
  // deserts
  ellipse(10, 24, 30, 7, 'desert'), ellipse(45, 23, 12, 8, 'desert'), ellipse(105, 42.5, 13, 4, 'desert'), ellipse(84, 39, 5, 2.5, 'desert'), ellipse(133, -25, 15, 8, 'desert'),
  ellipse(22, -23, 7, 4, 'desert'), ellipse(-69, -23, 2.2, 5, 'desert'), ellipse(71, 27, 3, 3, 'desert'), ellipse(62, 41, 9, 4, 'desert'), ellipse(55, 32, 8, 4, 'desert'),
  ellipse(-113, 34, 6, 4, 'desert'), ellipse(14, -22, 3, 6, 'desert'), ellipse(40, 4, 6, 4, 'desert'), ellipse(-5, 20, 15, 4, 'desert'), ellipse(-70, -45, 6, 6, 'desert'),
  // jungle
  ellipse(-62, -4, 14, 7, 'jungle'), ellipse(22, 0, 10, 6, 'jungle'), ellipse(102, 15, 6, 8, 'jungle'), ellipse(110, 0, 14, 5, 'jungle'), ellipse(142, -5, 8, 3, 'jungle'), ellipse(-85, 10, 6, 4, 'jungle'),
  ellipse(-5, 6, 9, 2.5, 'jungle'), ellipse(80, 22, 7, 3, 'jungle'), ellipse(122, 10, 4, 5, 'jungle'), ellipse(47, -18, 3, 6, 'jungle'), ellipse(-74, 4, 5, 5, 'jungle'),
  // forest
  ellipse(90, 60, 55, 7, 'forest'), ellipse(-100, 54, 32, 6, 'forest'), ellipse(20, 62, 10, 5, 'forest'), ellipse(35, 56, 12, 5, 'forest'), ellipse(-75, 46, 10, 4, 'forest'),
  ellipse(-122, 46, 4, 5, 'forest'), ellipse(128, 44, 8, 6, 'forest'), ellipse(-85, 35, 8, 5, 'forest'), ellipse(138, 36, 5, 5, 'forest'), ellipse(15, 49, 8, 3, 'forest'),
];
function terrainAt(lon, lat) {
  if (lat > 67 || lat < -58) return 'arctic';
  if (lat > 64 && lon > 60 && lon < 190) return 'arctic';
  for (const f of TERR_FEATS) {
    const dx = (lon - f.lon) / f.rx, dy = (lat - f.lat) / f.ry;
    if (dx * dx + dy * dy <= 1) return f.t;
  }
  return 'plains';
}
const HAB = { plains: 1, forest: 0.6, mountain: 0.35, desert: 0.12, jungle: 0.6, arctic: 0.04, urban: 1 };

const world = { W, H, RES, countries: [], provs: [], seas: [] };
// province base stats
for (const p of provs) {
  let sx = 0, sy = 0; const tc = {};
  let minx = 1e9, miny = 1e9, maxx = -1, maxy = -1;
  for (const v of p.cells) {
    const x = v % W, y = (v / W) | 0; sx += x; sy += y;
    if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
    const t = terrainAt(invLon(x + 0.5), invLat(y + 0.5)); tc[t] = (tc[t] || 0) + 1;
  }
  const n = p.cells.length;
  p.cx = sx / n + 0.5; p.cy = sy / n + 0.5; p.area = n; p.bbox = [minx, miny, maxx + 1, maxy + 1];
  // snap centroid inside
  if (label[Math.floor(p.cy) * W + Math.floor(p.cx)] !== p.id) {
    let best = p.seed, bd = 1e18;
    for (const v of p.cells) { const d = ((v % W) + 0.5 - p.cx) ** 2 + (((v / W) | 0) + 0.5 - p.cy) ** 2; if (d < bd) { bd = d; best = v; } }
    p.cx = (best % W) + 0.5; p.cy = ((best / W) | 0) + 0.5;
  }
  let bt = 'plains', bc = -1; for (const t in tc) if (tc[t] > bc) { bc = tc[t]; bt = t; }
  p.terr = bt; p.cities = [];
}
for (const c of cityList) provs[c.prov].cities.push(c);
for (const p of provs) {
  p.cities.sort((a, b) => b.pop - a.pop);
  const top = p.cities[0];
  p.name = top ? top.name : null;
  if (top) { p.lx = top.x; p.ly = top.y; } else { p.lx = p.cx; p.ly = p.cy; }
}
// capital provinces
const capProv = {};
for (const c of cityList) if (c.cap && c.key && kidx[c.key] !== undefined && provs[c.prov].c === kidx[c.key]) {
  if (!(c.key in capProv) || c.pop > capProv[c.key].pop) capProv[c.key] = c;
}
for (const k of keys) if (!(k in capProv)) {
  // largest city in country
  const cs = cityList.filter(c => provs[c.prov].c === kidx[k]);
  if (cs.length) capProv[k] = cs[0];
}
// naming: dedupe + fallback names
const nameCount = {};
const DIRS = ['Север', 'Северо-восток', 'Восток', 'Юго-восток', 'Юг', 'Юго-запад', 'Запад', 'Северо-запад', 'Центр'];
const cstat = keys.map(() => ({ sx: 0, sy: 0, n: 0 }));
for (const p of provs) { const s = cstat[p.c]; s.sx += p.cx * p.area; s.sy += p.cy * p.area; s.n += p.area; }
const cNameRu = k => (profiles[k] && profiles[k].n) || cinfo[k].nameRu || cinfo[k].name;
function dirName(p) {
  const s = cstat[p.c]; const mx = s.sx / s.n, my = s.sy / s.n;
  const dx = p.cx - mx, dy = p.cy - my; const dist = Math.hypot(dx, dy);
  if (dist < 6) return 'Центр';
  const a = Math.atan2(-dy, dx) / Math.PI * 180; // 0 = east, 90 = north
  const names = ['Восток', 'Северо-восток', 'Север', 'Северо-запад', 'Запад', 'Юго-запад', 'Юг', 'Юго-восток'];
  return names[(((Math.round(a / 45)) % 8) + 8) % 8];
}
for (const p of provs) {
  if (!p.name) p.name = provs.filter(q => q.c === p.c).length === 1 ? cNameRu(keys[p.c]) : cNameRu(keys[p.c]) + ': ' + dirName(p).toLowerCase();
}
const seenName = {};
for (const p of provs) { const k = keys[p.c] + '|' + p.name; seenName[k] = (seenName[k] || 0) + 1; }
const usedName = {};
for (const p of provs) {
  const k = keys[p.c] + '|' + p.name;
  if (seenName[k] > 1) { usedName[k] = (usedName[k] || 0) + 1; if (usedName[k] > 1) p.name = p.name + ' ' + ['', 'II', 'III', 'IV', 'V', 'VI'][usedName[k] - 1]; }
}
// population & resources
const cprov = keys.map(() => []);
for (const p of provs) cprov[p.c].push(p);
function hashN(a, b) { let h = (a * 374761393 + b * 668265263) >>> 0; h = (h ^ (h >>> 13)) * 1274126177 >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
for (let ci = 0; ci < keys.length; ci++) {
  const k = keys[ci], pr = profiles[k] || { oil: 1, ore: 1, rare: 0, food: 2, ind: 1, tech: 2, mil: 2, gov: 'autocracy', nukes: 0, bloc: 'NONE', agg: 1, rivals: [], flag: 'plain:#888888' };
  const ps = cprov[ci]; if (!ps.length) continue;
  const totalPop = cinfo[k].pop;
  let urban = 0; for (const p of ps) { p.urban = p.cities.reduce((a, c) => a + c.pop, 0); urban += p.urban; }
  const urbanShare = Math.min(0.75, urban / totalPop);
  let ruralW = 0; for (const p of ps) { p.rw = p.area * (HAB[p.terr] || 1); ruralW += p.rw; }
  for (const p of ps) {
    const upart = urban > 0 ? (p.urban / urban) * totalPop * urbanShare : 0;
    const rpart = ruralW > 0 ? (p.rw / ruralW) * totalPop * (1 - urbanShare) : 0;
    p.pop = Math.max(1000, Math.round(upart + rpart));
  }
  // resources per province (0..5)
  const f = (v, nz) => v;
  ps.forEach((p, i) => {
    const r1 = hashN(p.id, 1), r2 = hashN(p.id, 2), r3 = hashN(p.id, 3), r4 = hashN(p.id, 4);
    const terrFood = { plains: 1.0, forest: 0.45, mountain: 0.2, desert: 0.1, jungle: 0.6, arctic: 0.05 }[p.terr] || 0.5;
    const popFactor = Math.min(1.5, Math.sqrt(p.pop / (totalPop / ps.length)) + 0.2);
    const food = Math.round(Math.min(5, (pr.food * terrFood * (0.7 + r1 * 0.8)) * (p.terr === 'plains' ? 1.15 : 1)));
    const oilGate = pr.oil >= 4 ? 0.8 : pr.oil >= 2 ? 0.5 : pr.oil >= 1 ? 0.25 : 0;
    const oil = r2 < oilGate ? Math.max(1, Math.round(pr.oil * (0.6 + r3 * 0.8))) : 0;
    const oreBoost = p.terr === 'mountain' ? 1.4 : p.terr === 'desert' ? 0.9 : 1;
    const ore = (r3 < (pr.ore >= 3 ? 0.7 : pr.ore ? 0.4 : 0)) ? Math.max(1, Math.round(pr.ore * oreBoost * (0.6 + r4 * 0.7))) : 0;
    const rare = (r4 < (pr.rare >= 3 ? 0.55 : pr.rare ? 0.25 : 0)) ? Math.max(1, Math.round(pr.rare * (0.6 + r1 * 0.7))) : 0;
    const urbanF = Math.min(2, Math.log10(1 + p.urban / 200000) / 1.2);
    const ind = Math.round(Math.min(5, pr.ind * (0.3 + urbanF * 0.7) * (0.8 + r2 * 0.4)));
    const tech = Math.round(Math.min(5, pr.tech * (0.2 + urbanF * 0.8) * (0.8 + r3 * 0.4)));
    p.res = [food, ore, oil, rare, ind, tech];
  });
}
// victory points
for (const p of provs) {
  p.vp = 0;
  const big = p.cities.filter(c => c.pop > 1500000).length;
  p.vp = Math.min(5, Math.max(p.cities[0] && p.cities[0].pop > 800000 ? 1 : 0, Math.round(p.cities.reduce((a, c) => a + c.pop, 0) / 3500000)));
}
for (const k of keys) if (capProv[k]) { const p = provs[capProv[k].prov]; p.vp = Math.max(p.vp, 2) + (cinfo[k].pop > 50e6 ? 1 : 0); p.capOf = k; }

// ---------- boundary tracing ----------
const t2 = Date.now();
const VW = W + 1;
const edges = []; // {a,b (vertex ids start,end), l, r}
function lab(x, y) { return (x < 0 || y < 0 || x >= W || y >= H) ? -1 : label[y * W + x]; }
// vertical edges (x, y)-(x,y+1) between cells (x-1,y) and (x,y)  -> directed up: from (x,y+1) to (x,y): left = (x-1,y), right = (x,y)
// horizontal edges (x,y)-(x+1,y) between cells (x,y-1) and (x,y) -> directed right: left = up cell, right = down cell
const outEdges = new Map();
const edgeL = [], edgeR = [], edgeA = [], edgeB = [];
const rank = l => l < 0 ? 1e9 : l;
function addEdge(ax, ay, bx, by, l, r) {
  // canonical orientation: smaller label on the left
  if (rank(l) > rank(r)) { [l, r] = [r, l]; [ax, ay, bx, by] = [bx, by, ax, ay]; }
  edgeL.push(l); edgeR.push(r); edgeA.push(ay * VW + ax); edgeB.push(by * VW + bx);
}
for (let y = 0; y < H; y++) for (let x = 0; x <= W; x++) {
  const l = lab(x - 1, y), r = lab(x, y);
  if (l !== r) addEdge(x, y + 1, x, y, l, r);
}
for (let y = 0; y <= H; y++) for (let x = 0; x < W; x++) {
  const u = lab(x, y - 1), d = lab(x, y);
  if (u !== d) addEdge(x, y, x + 1, y, u, d);
}
const E = edgeL.length;
console.log('edges', E);
const outAt = new Map(); // vertex -> [edge ids]
const degAt = new Map();
for (let e = 0; e < E; e++) {
  const a = edgeA[e], b = edgeB[e];
  let o = outAt.get(a); if (!o) outAt.set(a, o = []); o.push(e);
  degAt.set(a, (degAt.get(a) || 0) + 1); degAt.set(b, (degAt.get(b) || 0) + 1);
}
const visited = new Uint8Array(E);
const arcs = []; // {l,r, pts:[x,y,...], closed}
function vxy(v) { return [v % VW, (v / VW) | 0]; }
function traceFrom(e0) {
  const pts = []; let e = e0;
  const startV = edgeA[e0];
  pts.push(...vxy(startV));
  let closed = false;
  while (true) {
    visited[e] = 1;
    const b = edgeB[e];
    pts.push(...vxy(b));
    if (b === startV) { closed = true; break; }
    if (degAt.get(b) !== 2) break;
    const nxt = outAt.get(b).find(x => !visited[x]);
    if (nxt === undefined) break;
    e = nxt;
  }
  return { l: edgeL[e0], r: edgeR[e0], pts, closed };
}
for (const [v, deg] of degAt) {
  if (deg === 2) continue;
  for (const e of (outAt.get(v) || [])) if (!visited[e]) arcs.push(traceFrom(e));
}
for (let e = 0; e < E; e++) if (!visited[e]) arcs.push(traceFrom(e));
console.log('arcs', arcs.length, Date.now() - t2, 'ms');

// simplify arcs (Douglas-Peucker)
function dp(pts, eps) {
  const n = pts.length / 2; if (n <= 2) return pts.slice();
  const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
  const st = [[0, n - 1]];
  while (st.length) {
    const [a, b] = st.pop();
    const ax = pts[2 * a], ay = pts[2 * a + 1], bx = pts[2 * b], by = pts[2 * b + 1];
    const dx = bx - ax, dy = by - ay; const len2 = dx * dx + dy * dy;
    let md = -1, mi = -1;
    for (let i = a + 1; i < b; i++) {
      const x = pts[2 * i], y = pts[2 * i + 1];
      let d;
      if (len2 === 0) d = Math.hypot(x - ax, y - ay);
      else { const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)); d = Math.hypot(x - ax - t * dx, y - ay - t * dy); }
      if (d > md) { md = d; mi = i; }
    }
    if (md > eps) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[2 * i], pts[2 * i + 1]);
  return out;
}
const EPS = +(process.env.EPS || 0.75);
for (const a of arcs) {
  const orig = a.pts;
  a.pts = dp(a.pts, EPS);
  // tiny closed loops (single-cell islands) collapse to a line: keep the original square outline
  if (a.closed && a.pts.length < 10) a.pts = orig;
}
// ring assembly
function ringsFor(region) {
  const outgoing = new Map(); // start vertex key -> list of [arcIdx, dir]
  const items = [];
  arcs.forEach((a, i) => {
    if (a.l === region) items.push([i, 1]);
    else if (a.r === region) items.push([i, -1]);
  });
  const sKey = ([i, d]) => { const a = arcs[i]; return d === 1 ? a.pts[0] + ',' + a.pts[1] : a.pts[a.pts.length - 2] + ',' + a.pts[a.pts.length - 1]; };
  const eKey = ([i, d]) => { const a = arcs[i]; return d === 1 ? a.pts[a.pts.length - 2] + ',' + a.pts[a.pts.length - 1] : a.pts[0] + ',' + a.pts[1]; };
  for (const it of items) { const k = sKey(it); let l = outgoing.get(k); if (!l) outgoing.set(k, l = []); l.push(it); }
  const used = new Set(); const rings = [];
  for (const it of items) {
    if (used.has(it)) continue;
    const ring = []; let cur = it;
    const startK = sKey(it);
    let guard = 0;
    while (cur && guard++ < 100000) {
      used.add(cur); ring.push(cur[1] === 1 ? cur[0] : ~cur[0]);
      const ek = eKey(cur);
      if (ek === startK) break;
      const cands = (outgoing.get(ek) || []).filter(x => !used.has(x));
      cur = cands[0];
    }
    rings.push(ring);
  }
  return rings;
}
// speed: build per region index of arcs
const arcsByRegion = new Map();
arcs.forEach((a, i) => { for (const r of [a.l, a.r]) { if (r < 0) continue; let l = arcsByRegion.get(r); if (!l) arcsByRegion.set(r, l = []); l.push(i); } });
function ringsFast(region) {
  const idxs = arcsByRegion.get(region) || [];
  const items = [];
  for (const i of idxs) { const a = arcs[i]; if (a.l === region) items.push([i, 1]); if (a.r === region) items.push([i, -1]); }
  const sKey = ([i, d]) => { const a = arcs[i]; const p = a.pts; return d === 1 ? p[0] * 100000 + p[1] : p[p.length - 2] * 100000 + p[p.length - 1]; };
  const eKey = ([i, d]) => { const a = arcs[i]; const p = a.pts; return d === 1 ? p[p.length - 2] * 100000 + p[p.length - 1] : p[0] * 100000 + p[1]; };
  const outgoing = new Map();
  for (const it of items) { const k = sKey(it); let l = outgoing.get(k); if (!l) outgoing.set(k, l = []); l.push(it); }
  const used = new Set(); const rings = [];
  for (const it of items) {
    if (used.has(it)) continue;
    const ring = []; let cur = it; const startK = sKey(it); let guard = 0;
    while (cur && guard++ < 100000) {
      used.add(cur); ring.push(cur[1] === 1 ? cur[0] : ~cur[0]);
      const ek = eKey(cur); if (ek === startK) break;
      cur = (outgoing.get(ek) || []).find(x => !used.has(x));
    }
    rings.push(ring);
  }
  return rings;
}

// ---------- sea naming ----------
for (const s of seas) {
  let sx = 0, sy = 0, minx = 1e9, miny = 1e9, maxx = -1, maxy = -1;
  for (const v of s.cells) { const x = v % W, y = (v / W) | 0; sx += x; sy += y; if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
  s.cx = sx / s.cells.length + 0.5; s.cy = sy / s.cells.length + 0.5; s.area = s.cells.length; s.bbox = [minx, miny, maxx + 1, maxy + 1];
  // snap to member
  const sc = s.cells; let best = sc[0], bd = 1e18;
  for (const v of sc) { const d = ((v % W) + .5 - s.cx) ** 2 + (((v / W) | 0) + .5 - s.cy) ** 2; if (d < bd) { bd = d; best = v; } }
  s.lx = (best % W) + .5; s.ly = ((best / W) | 0) + .5;
}
{
  const used = {};
  for (const s of seas) {
    let bn = null, bd = 1e18;
    for (const n of seaNames) { const d = (px(n.lon) - s.lx) ** 2 + (py(n.lat) - s.ly) ** 2; if (d < bd) { bd = d; bn = n; } }
    let nm = bn ? bn.n : 'Море';
    used[nm] = (used[nm] || 0) + 1;
    s.name = nm; s.nm0 = nm;
  }
  const cntN = {}; for (const s of seas) cntN[s.nm0] = (cntN[s.nm0] || 0) + 1;
  const idxN = {};
  for (const s of seas) if (cntN[s.nm0] > 1) { idxN[s.nm0] = (idxN[s.nm0] || 0) + 1; s.name = s.nm0 + ' ' + ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'][idxN[s.nm0]]; }
}
// manual links
function regionAt(lon, lat, wantSea) {
  const x = Math.floor(px(lon)), y = Math.floor(py(lat));
  for (let r = 0; r < 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    const l = label[ny * W + nx]; if (wantSea ? l >= P : (l >= 0 && l < P)) return l;
  }
  return -1;
}
const SEA_LINKS = [[32.3, 31.3, 32.6, 29.9], [29.2, 41.2, 28, 40.8], [26.2, 40.1, 25, 39.5], [10.8, 56.2, 10.9, 57.4], [11.7, 55.9, 12.8, 56.4], [-79.8, 9.4, -79.6, 8.8], [-5.6, 36.0, -6.5, 36.0], [43.3, 12.6, 43.6, 12.0], [56.4, 26.5, 57.5, 25.8], [103.5, 1.3, 101, 3], [121.5, 25, 120.5, 23.5], [-170, 65.7, -172, 64.5], [10.5, 55.3, 9.8, 56.0]];
const LAND_LINKS = [[28.95, 41.05, 29.15, 41.0], [15.6, 38.0, 15.9, 38.4], [12, 55.5, 10.0, 56.2], [13.0, 55.6, 12.4, 55.7], [103.8, 1.3, 103.5, 2.0], [50.55, 26.1, 50.1, 26.3], [130.9, 33.9, 130.7, 33.4], [140.5, 41.2, 140.7, 41.8], [134.5, 34.35, 134.3, 34.0], [55.3, 25.2, 56, 25.6]];
for (const [a, b, c, d] of SEA_LINKS) { const s1 = regionAt(a, b, true), s2 = regionAt(c, d, true); if (s1 >= 0 && s2 >= 0 && s1 !== s2) addAdj(s1, s2, 1); }
for (const [a, b, c, d] of LAND_LINKS) { const s1 = regionAt(a, b, false), s2 = regionAt(c, d, false); if (s1 >= 0 && s2 >= 0 && s1 !== s2 && provs[s1].c === provs[s2].c) addAdj(s1, s2, 1); }

// ---------- encode ----------
function enc(pts) { // delta encode ints
  const o = []; let px0 = 0, py0 = 0;
  for (let i = 0; i < pts.length; i += 2) { o.push(pts[i] - px0, pts[i + 1] - py0); px0 = pts[i]; py0 = pts[i + 1]; }
  return o;
}
let totalPts = 0;
world.arcs = arcs.map(a => { totalPts += a.pts.length / 2; return [a.l, a.r, a.closed ? 1 : 0, enc(a.pts)]; });
console.log('points', totalPts);
const rnd2 = x => Math.round(x * 10) / 10;
world.countries = keys.map((k, ci) => {
  const pr = profiles[k] || {};
  const cp = capProv[k];
  return {
    key: k, n: cNameRu(k), nameEn: cinfo[k].name, cap: cp ? cp.prov : (cprov[ci][0] ? cprov[ci][0].id : -1), capName: cp ? cp.name : '',
    pop: cinfo[k].pop, gdp: cinfo[k].gdp,
    gov: pr.gov || 'autocracy', mil: pr.mil || 2, tech: pr.tech || 2, nukes: pr.nukes || 0,
    oil: pr.oil ?? 1, ore: pr.ore ?? 1, rare: pr.rare ?? 0, food: pr.food ?? 2, ind: pr.ind ?? 1,
    bloc: pr.bloc || 'NONE', agg: pr.agg || 1, rivals: pr.rivals || [], flag: pr.flag || 'plain:#808080',
    provs: cprov[ci].map(p => p.id)
  };
}).filter(c => c.provs.length);
const cIdMap = {}; world.countries.forEach((c, i) => cIdMap[c.key] = i);
world.provs = provs.map(p => ({
  id: p.id, c: cIdMap[keys[p.c]], name: p.name, x: rnd2(p.cx), y: rnd2(p.cy), lx: rnd2(p.lx), ly: rnd2(p.ly), area: p.area, pop: p.pop,
  terr: p.terr, res: p.res, vp: p.vp, city: p.cities[0] ? p.cities[0].pop : 0, bbox: p.bbox,
  adj: [...adj[p.id].entries()].filter(([o, w]) => o < P).map(([o]) => o),
  seas: [...adj[p.id].entries()].filter(([o, w]) => o >= P).map(([o]) => o - P),
  rings: ringsFast(p.id)
}));
world.seas = seas.map((s, i) => ({
  id: i, name: s.name, x: rnd2(s.cx), y: rnd2(s.cy), lx: rnd2(s.lx), ly: rnd2(s.ly), area: s.area, bbox: s.bbox,
  adj: [...adj[P + i].entries()].filter(([o, w]) => o >= P).map(([o]) => o - P),
  ports: [...adj[P + i].entries()].filter(([o, w]) => o < P).map(([o]) => o),
  rings: ringsFast(P + i)
}));
world.proj = { RES, Y_TOP, LAT_TOP };
const out = 'const WORLD=' + JSON.stringify(world) + ';\n';
fs.mkdirSync(path.join(__dirname, '..', 'src'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'src', 'world.js'), out);
console.log('world.js bytes', out.length, 'provs', world.provs.length, 'seas', world.seas.length, 'countries', world.countries.length);
const noName = world.provs.filter(p => !p.name).length; if (noName) console.log('unnamed', noName);
// stats
const per = world.countries.map(c => [c.key, c.provs.length]).sort((a, b) => b[1] - a[1]).slice(0, 12);
console.log(per.map(a => a.join(':')).join(' '));
