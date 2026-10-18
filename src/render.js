'use strict';
/* ===== Map renderer & camera ===== */
const WW = WORLD.W, WH = WORLD.H;
const projY = lat => { const m = 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * lat * Math.PI / 180)) * 180 / Math.PI; return (WORLD.proj.Y_TOP - m) * WORLD.proj.RES; };
const projX = lon => (lon + 180) * WORLD.proj.RES;

/* decode arcs and build paths */
const ARC = WORLD.arcs.map(a => {
  const d = a[3], n = d.length / 2, raw = new Float32Array(d.length); let x = 0, y = 0;
  for (let i = 0; i < n; i++) { x += d[2 * i]; y += d[2 * i + 1]; raw[2 * i] = x; raw[2 * i + 1] = y; }
  return { l: a[0], r: a[1], closed: !!a[2], p: chaikin(chaikin(raw, !!a[2]), !!a[2]) };
});
function chaikin(p, closed) {
  const n = p.length / 2; if (n < 3) return p;
  const o = [];
  if (!closed) { o.push(p[0], p[1]); for (let i = 0; i < n - 1; i++) { const ax = p[2 * i], ay = p[2 * i + 1], bx = p[2 * i + 2], by = p[2 * i + 3]; o.push(.75 * ax + .25 * bx, .75 * ay + .25 * by, .25 * ax + .75 * bx, .25 * ay + .75 * by); } o.push(p[2 * n - 2], p[2 * n - 1]); }
  else { for (let i = 0; i < n - 1; i++) { const ax = p[2 * i], ay = p[2 * i + 1], bx = p[2 * i + 2], by = p[2 * i + 3]; o.push(.75 * ax + .25 * bx, .75 * ay + .25 * by, .25 * ax + .75 * bx, .25 * ay + .75 * by); } o.push(o[0], o[1]); }
  return Float32Array.from(o);
}
function ringsToPath(rings) {
  const pa = new Path2D();
  for (const r of rings) {
    let first = true;
    for (const ai of r) {
      const a = ai >= 0 ? ARC[ai] : ARC[~ai], p = a.p, n = p.length / 2;
      if (ai >= 0) { for (let i = 0; i < n; i++) { if (first) { pa.moveTo(p[0], p[1]); first = false; } else if (i > 0) pa.lineTo(p[2 * i], p[2 * i + 1]); } }
      else { for (let i = n - 1; i >= 0; i--) { if (first) { pa.moveTo(p[2 * i], p[2 * i + 1]); first = false; } else if (i < n - 1) pa.lineTo(p[2 * i], p[2 * i + 1]); } }
    }
    pa.closePath();
  }
  return pa;
}
const PPATH = PROV.map(p => ringsToPath(p.rings));
const SPATH = SEA.map(s => ringsToPath(s.rings));
const BORDER = { prov: new Path2D(), cty: new Path2D(), coast: new Path2D(), sea: new Path2D() };
for (const a of ARC) {
  if (a.l < 0 || a.r < 0) continue;
  const k = a.l < P && a.r < P ? (PROV[a.l].c === PROV[a.r].c ? 'prov' : 'cty') : (a.l < P || a.r < P) ? 'coast' : 'sea';
  const pa = BORDER[k], p = a.p; pa.moveTo(p[0], p[1]);
  for (let i = 1; i < p.length / 2; i++) pa.lineTo(p[2 * i], p[2 * i + 1]);
}
const TERRPATH = {};
for (const t in TERRAIN) TERRPATH[t] = new Path2D();
PROV.forEach((p, i) => TERRPATH[p.terr].addPath(PPATH[i]));

/* country label anchors */
const CLABEL = CTY.map((c, ci) => {
  // largest connected cluster of provinces
  const seen = new Set(); let best = null;
  for (const s of c.provs) {
    if (seen.has(s)) continue;
    const comp = []; const st = [s]; seen.add(s);
    while (st.length) { const v = st.pop(); comp.push(v); for (const a of PROV[v].adj) if (PROV[a].c === ci && !seen.has(a)) { seen.add(a); st.push(a); } }
    let area = 0; for (const v of comp) area += PROV[v].area;
    if (!best || area > best.area) best = { comp, area };
  }
  let sx = 0, sy = 0, a = 0, minx = 1e9, maxx = -1, miny = 1e9, maxy = -1;
  for (const v of best.comp) { const p = PROV[v]; sx += p.x * p.area; sy += p.y * p.area; a += p.area; minx = Math.min(minx, p.bbox[0]); maxx = Math.max(maxx, p.bbox[2]); miny = Math.min(miny, p.bbox[1]); maxy = Math.max(maxy, p.bbox[3]); }
  return { x: sx / a, y: sy / a, w: maxx - minx, h: maxy - miny, area: a };
});

const MV = {
  cv: null, ctx: null, mini: null, mctx: null, W: 800, H: 600, dpr: 1,
  cam: { cx: WW / 2, cy: WH / 2, z: 1 }, mode: 'political', relTo: -1,
  hoverP: -1, hoverS: -1, chips: [], fxs: [], lastFx: 0, labels: true, dirty: true, now: 0,
  onClick: null, onRight: null, onBox: null, onHover: null, orderMode: null, box: null, drawFog: false
};
const hexCache = {};
const rgbOf = h => hexCache[h] || (hexCache[h] = hex2rgb(h));
const ocean = '#0e2740';

function minZoom() { return Math.max(MV.W / WW, MV.H / WH); }
function clampCam() {
  const c = MV.cam, mz = minZoom();
  c.z = clamp(c.z, mz, 22);
  const hw = MV.W / 2 / c.z, hh = MV.H / 2 / c.z;
  c.cx = WW * c.z * 1 < MV.W ? WW / 2 : clamp(c.cx, hw, WW - hw);
  c.cy = WH * c.z < MV.H ? WH / 2 : clamp(c.cy, hh, WH - hh);
}
const w2s = (x, y) => [(x - MV.cam.cx) * MV.cam.z + MV.W / 2, (y - MV.cam.cy) * MV.cam.z + MV.H / 2];
const s2w = (x, y) => [(x - MV.W / 2) / MV.cam.z + MV.cam.cx, (y - MV.H / 2) / MV.cam.z + MV.cam.cy];
function centerOn(x, y, z) { MV.cam.cx = x; MV.cam.cy = y; if (z) MV.cam.z = Math.max(MV.cam.z, z); clampCam(); MV.dirty = true; }
function zoomAt(sx, sy, f) {
  const [wx, wy] = s2w(sx, sy);
  MV.cam.z = clamp(MV.cam.z * f, minZoom(), 22);
  MV.cam.cx = wx - (sx - MV.W / 2) / MV.cam.z; MV.cam.cy = wy - (sy - MV.H / 2) / MV.cam.z;
  clampCam(); MV.dirty = true;
}

/* fill colour of a province according to map mode */
function ownerOf(p) { return G ? G.pv[p].o : PROV[p].c; }
function provFill(p) {
  const o = ownerOf(p);
  const mode = MV.mode;
  if (mode === 'terrain') { const c = TERRAIN[PROV[p].terr].col; return rgb2css(c[0], c[1], c[2]); }
  if (mode === 'political' || !G) {
    const col = rgbOf(G ? G.C[o].color : CCOLORS[o]);
    const k = ((p * 37) % 7 - 3) * 0.012;
    return rgb2css(col[0] * (0.8 + k) , col[1] * (0.8 + k), col[2] * (0.8 + k));
  }
  if (mode === 'bloc') {
    const al = G.C[o].alliance; if (al < 0) return '#4a5360';
    const col = rgbOf(G.al[al].color); return rgb2css(col[0] * .75, col[1] * .75, col[2] * .75);
  }
  if (mode === 'relations') {
    const me = G.player;
    if (o === me) return '#2f7fd8';
    if (areAllied(o, me)) return '#2faa6a';
    if (G.war[me * NC + o]) return '#c0392b';
    const r = relOf(me, o);
    if (r > 25) return '#6fae8a'; if (r > 0) return '#7a8c78'; if (r > -25) return '#a08a6a'; return '#b5654a';
  }
  if (mode === 'pop') { const t = clamp(Math.log10(PROV[p].pop / 5e4) / 2.6, 0, 1); const c = mix([40, 60, 80], [240, 150, 60], t); return rgb2css(c[0], c[1], c[2]); }
  if (mode === 'power') { const o2 = o; const pw = G.C[o2].pwr || 0; const t = clamp(Math.log10(pw + 10) / 4.2, 0, 1); const c = mix([50, 70, 90], [220, 80, 70], t); return rgb2css(c[0], c[1], c[2]); }
  if (mode.startsWith('res:')) {
    const idx = { food: 0, comp: 1, fuel: 2, rare: 3, supp: 4, elec: 5 }[mode.slice(4)];
    const v = PROV[p].res[idx]; const base = { food: [230, 195, 80], comp: [170, 190, 210], fuel: [225, 120, 60], rare: [200, 120, 230], supp: [210, 170, 110], elec: [90, 200, 235] }[mode.slice(4)];
    const t = clamp(v / 5, 0, 1); const c = mix([40, 55, 70], base, 0.12 + t * 0.88); return rgb2css(c[0], c[1], c[2]);
  }
  return '#555';
}

function resize() {
  const cv = MV.cv; const r = cv.parentElement.getBoundingClientRect();
  MV.W = Math.max(300, r.width); MV.H = Math.max(300, r.height); MV.dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = MV.W * MV.dpr; cv.height = MV.H * MV.dpr; cv.style.width = MV.W + 'px'; cv.style.height = MV.H + 'px';
  clampCam(); MV.dirty = true;
}

function drawMap() {
  const ctx = MV.ctx, z = MV.cam.z, dpr = MV.dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = ocean; ctx.fillRect(0, 0, MV.W * dpr, MV.H * dpr);
  ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (MV.W / 2 - MV.cam.cx * z), dpr * (MV.H / 2 - MV.cam.cy * z));
  const px = 1 / z;
  // graticule
  ctx.strokeStyle = 'rgba(120,170,220,.07)'; ctx.lineWidth = px;
  ctx.beginPath();
  for (let lon = -180; lon <= 180; lon += 30) { const x = projX(lon); ctx.moveTo(x, 0); ctx.lineTo(x, WH); }
  for (let lat = -50; lat <= 80; lat += 10) { const y = projY(lat); ctx.moveTo(0, y); ctx.lineTo(WW, y); }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(120,170,220,.14)'; ctx.beginPath(); const ey = projY(0); ctx.moveTo(0, ey); ctx.lineTo(WW, ey); ctx.stroke();
  // sea zone borders
  ctx.strokeStyle = 'rgba(140,190,240,.16)'; ctx.lineWidth = px * 0.8; ctx.setLineDash([px * 4, px * 4]); ctx.stroke(BORDER.sea); ctx.setLineDash([]);
  // land fills
  const vx0 = MV.cam.cx - MV.W / 2 / z, vx1 = MV.cam.cx + MV.W / 2 / z, vy0 = MV.cam.cy - MV.H / 2 / z, vy1 = MV.cam.cy + MV.H / 2 / z;
  ctx.lineJoin = 'round';
  for (let i = 0; i < P; i++) {
    const b = PROV[i].bbox; if (b[2] < vx0 || b[0] > vx1 || b[3] < vy0 || b[1] > vy1) continue;
    const f = provFill(i);
    ctx.fillStyle = f; ctx.fill(PPATH[i], 'evenodd');
    ctx.strokeStyle = f; ctx.lineWidth = px * 0.9; ctx.stroke(PPATH[i]);
  }
  // terrain tint
  if (MV.mode === 'political' || MV.mode === 'relations' || MV.mode === 'bloc') {
    for (const t in TERRAIN) { const c = TERRAIN[t].col; ctx.fillStyle = rgb2css(c[0], c[1], c[2], t === 'plains' ? 0 : 0.16); if (t !== 'plains') ctx.fill(TERRPATH[t], 'evenodd'); }
  }
  // borders
  ctx.strokeStyle = 'rgba(10,20,30,.45)'; ctx.lineWidth = px * 0.7; ctx.stroke(BORDER.prov);
  ctx.strokeStyle = 'rgba(8,14,22,.92)'; ctx.lineWidth = px * 1.45; ctx.stroke(BORDER.cty);
  ctx.strokeStyle = 'rgba(160,205,255,.55)'; ctx.lineWidth = px * 1.1; ctx.stroke(BORDER.coast);
  // hover / selection
  const sel = MV.sel;
  const hl = (path, fill, stroke, lw) => { ctx.fillStyle = fill; ctx.fill(path, 'evenodd'); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = px * lw; ctx.stroke(path); } };
  if (MV.hoverP >= 0) hl(PPATH[MV.hoverP], 'rgba(255,255,255,.12)', 'rgba(255,255,255,.5)', 1.2);
  if (MV.hoverS >= 0) hl(SPATH[MV.hoverS], 'rgba(120,190,255,.10)', 'rgba(150,210,255,.5)', 1.2);
  if (MV.startHi >= 0) for (const p of CTY[MV.startHi].provs) hl(PPATH[p], 'rgba(255,230,120,.28)', 'rgba(255,226,122,.9)', 1.6);
  if (sel && sel.prov >= 0) hl(PPATH[sel.prov], 'rgba(255,230,120,.16)', '#ffe27a', 2.2);
  if (sel && sel.sea >= 0) hl(SPATH[sel.sea], 'rgba(120,190,255,.14)', '#8ccaff', 2);
  if (MV.orderMode && MV.hoverTarget) { const t = MV.hoverTarget; if (t.k === 'p') hl(PPATH[t.id], 'rgba(255,90,70,.18)', '#ff6a50', 2); else hl(SPATH[t.id], 'rgba(255,90,70,.12)', '#ff6a50', 2); }
}

/* ---------- overlay: labels, units, effects ---------- */
const DOMG = { land: 'L', air: 'A', sea: 'S', msl: 'M' };
function collectGroups() {
  const groups = new Map();
  for (const [, u] of G.U) {
    if (u.st === 'cargo') continue;
    if (!isVisible(u)) continue;
    const d = UNITS[u.t];
    let key, loc = u.loc, moving = false;
    if (u.st === 'out' || u.st === 'back') { key = 'f|' + u.o + '|' + u.id; moving = true; }
    else if (u.st === 'move' && u.leg) { key = 'm|' + u.o + '|' + u.leg.to + '|' + u.loc + '|' + d.dom + '|' + Math.round(u.leg.done / 8); moving = true; }
    else key = 'g|' + loc + '|' + u.o + '|' + (MV.cam.z < 2.4 ? 'X' : DOMG[d.dom]);
    let g = groups.get(key);
    if (!g) groups.set(key, g = { key, ids: [], o: u.o, loc, dom: d.dom, hp: 0, moving, t: u.t, types: {}, st: u.st, u0: u });
    g.ids.push(u.id); g.hp += u.hp; g.types[u.t] = (g.types[u.t] || 0) + 1;
  }
  return groups;
}
function groupGlyph(g) {
  // most numerous / strongest unit type
  let best = null, bn = 0; for (const t in g.types) { if (g.types[t] > bn) { bn = g.types[t]; best = t; } }
  return best;
}
const CH_W = 30, CH_H = 19;
function drawChip(ctx, x, y, g, scale, selected) {
  const w = CH_W * scale, h = CH_H * scale;
  const col = G.C[g.o].color, mine = g.o === G.player;
  const rgb = rgbOf(col);
  roundRect(ctx, x - w / 2, y - h / 2, w, h, 3 * scale);
  ctx.fillStyle = rgb2css(rgb[0] * .55, rgb[1] * .55, rgb[2] * .55, 0.96); ctx.fill();
  ctx.lineWidth = selected ? 2.4 : 1.4; ctx.strokeStyle = selected ? '#ffe27a' : (mine ? '#ffffff' : (areAllied(g.o, G.player) ? '#7be0a4' : (G.war[g.o * NC + G.player] ? '#ff6a50' : '#c8c8c8'))); ctx.stroke();
  drawGlyph(ctx, groupGlyph(g), x - w * 0.18, y, h * 0.36, '#fff');
  const n = g.ids.length;
  if (n > 1) { ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(11 * scale)}px sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(String(n), x + w * 0.08, y + 1); }
  // hp bar
  const hp = g.hp / n / 100;
  ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x - w / 2, y + h / 2 + 1, w, 3 * scale);
  ctx.fillStyle = hp > 0.6 ? '#5fd35f' : hp > 0.3 ? '#e6c34a' : '#e0503c'; ctx.fillRect(x - w / 2, y + h / 2 + 1, w * hp, 3 * scale);
}
function drawOverlay() {
  const ctx = MV.ctx, z = MV.cam.z, dpr = MV.dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const W = MV.W, H = MV.H;
  const on = (x, y, m) => x > -m && y > -m && x < W + m && y < H + m;
  // country labels
  if (MV.labels) {
    for (let ci = 0; ci < NC; ci++) {
      const L = CLABEL[ci]; const alive = G ? G.C[ci].alive : true; if (!alive) continue;
      const [sx, sy] = w2s(L.x, L.y);
      if (!on(sx, sy, 100)) continue;
      const wpx = L.w * z, hpx = L.h * z;
      let fs = Math.min(wpx / Math.max(4, (G ? G.C[ci].n : CTY[ci].n).length) * 1.35, hpx * 0.55, 34);
      if (fs < 8.5) continue;
      fs = Math.round(fs);
      ctx.font = `600 ${fs}px "Segoe UI",Roboto,sans-serif`;
      try { ctx.letterSpacing = Math.round(fs * 0.12) + 'px'; } catch (e) { }
      const name = (G ? G.C[ci].n : CTY[ci].n).toUpperCase();
      ctx.globalAlpha = clamp(1.25 - (z - 2.5) / 3.5, 0.18, 1);
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(8,16,26,.55)'; ctx.strokeText(name, sx, sy - fs * 0.6);
      ctx.fillStyle = 'rgba(245,250,255,.82)'; ctx.fillText(name, sx, sy - fs * 0.6);
      ctx.globalAlpha = 1;
      try { ctx.letterSpacing = '0px'; } catch (e) { }
    }
  }
  // province names, cities, VP stars
  if (z >= 2.1) {
    ctx.font = `${z >= 4 ? 11 : 10}px "Segoe UI",Roboto,sans-serif`;
    for (let i = 0; i < P; i++) {
      const p = PROV[i]; const [sx, sy] = w2s(p.lx, p.ly);
      if (!on(sx, sy, 40)) continue;
      ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(sx, sy, p.vp > 0 ? 3 : 2, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 1; ctx.stroke();
      if (z >= 3.2 || p.vp >= 2 || (G && G.C[ownerOf(i)].cap === i)) {
        ctx.lineWidth = 2.6; ctx.strokeStyle = 'rgba(8,16,26,.65)'; ctx.strokeText(p.name, sx, sy + 11);
        ctx.fillStyle = (G && G.C[ownerOf(i)].cap === i) ? '#ffe9a8' : 'rgba(235,242,250,.9)'; ctx.fillText(p.name, sx, sy + 11);
      }
      if (G && G.C[ownerOf(i)].cap === i) { ctx.fillStyle = '#ffd95a'; star(ctx, sx, sy - 9, 5.5, 2.4); }
      else if (p.vp >= 2 && z >= 2.6) { ctx.fillStyle = '#ffd95a'; ctx.globalAlpha = .85; star(ctx, sx, sy - 8, 3.8, 1.7); ctx.globalAlpha = 1; }
    }
  }
  if (z >= 1.5) { // sea names
    ctx.font = `italic ${z >= 3 ? 12 : 10}px Georgia,serif`; ctx.fillStyle = 'rgba(150,195,240,.38)';
    for (let i = 0; i < S; i++) { const [sx, sy] = w2s(SEA[i].lx, SEA[i].ly); if (on(sx, sy, 60)) ctx.fillText(SEA[i].name, sx, sy); }
  }
  if (!G) return;
  // capture progress & battles
  for (let i = 0; i < P; i++) {
    const pv = G.pv[i];
    if (pv.cap && pv.cap.prog > 0) {
      const [sx, sy] = w2s(PROV[i].x, PROV[i].y); if (!on(sx, sy, 40)) continue;
      ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(sx - 18, sy + 14, 36, 5);
      ctx.fillStyle = G.C[pv.cap.by].color; ctx.fillRect(sx - 18, sy + 14, 36 * pv.cap.prog / 100, 5);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(sx - 18, sy + 14, 36, 5);
    }
  }
  const pulse = 0.75 + 0.25 * Math.sin(MV.now / 140);
  for (const [loc, h] of G.bat) {
    if (G.hour - h > 1) continue;
    const [sx, sy] = w2s(lx(loc), ly(loc)); if (!on(sx, sy, 40)) continue;
    // only show battles visible to player
    if (!G.vis[loc]) continue;
    ctx.save(); ctx.translate(sx, sy - 22); ctx.scale(pulse, pulse);
    ctx.fillStyle = 'rgba(200,30,20,.88)'; ctx.beginPath(); ctx.arc(0, 0, 9, 0, 7); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-5, -5); ctx.lineTo(5, 5); ctx.moveTo(5, -5); ctx.lineTo(-5, 5); ctx.stroke(); ctx.restore();
  }
  // routes for selected units
  const SELU = window.SEL ? SEL.units : null;
  if (SELU && SELU.size) {
    ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
    for (const id of SELU) {
      const u = G.U.get(id); if (!u) continue;
      const pos = unitPos(u);
      let pts = [];
      if (u.st === 'move') { pts.push(pos); for (const l of u.path) pts.push([lx(l), ly(l)]); }
      else if (u.st === 'out' || u.st === 'back') { pts.push(pos); pts.push([u.fl.tx, u.fl.ty]); }
      if (pts.length < 2) continue;
      ctx.strokeStyle = u.o === G.player ? 'rgba(255,230,120,.9)' : 'rgba(255,100,80,.8)';
      ctx.beginPath(); pts.forEach((q, i) => { const [sx, sy] = w2s(q[0], q[1]); ctx[i ? 'lineTo' : 'moveTo'](sx, sy); }); ctx.stroke();
      const e = pts[pts.length - 1]; const [ex, ey] = w2s(e[0], e[1]); ctx.setLineDash([]); ctx.fillStyle = '#ffe27a'; ctx.beginPath(); ctx.arc(ex, ey, 4, 0, 7); ctx.fill(); ctx.setLineDash([6, 5]);
    }
    ctx.setLineDash([]);
  }
  // unit chips
  const groups = collectGroups(); MV.chips = [];
  const scale = clamp(0.62 + z * 0.1, 0.72, 1.18);
  const perLoc = new Map();
  const drawList = [];
  for (const [, g] of groups) {
    let x, y;
    if (g.moving) {
      const u = g.u0; const p = unitPos(u); [x, y] = w2s(p[0], p[1]);
    } else {
      const [bx, by] = w2s(lx(g.loc), ly(g.loc));
      const k = g.loc + '|' + g.dom; const n = perLoc.get(g.loc) || 0; perLoc.set(g.loc, n + 1);
      const off = { land: [0, 0], air: [18, -17], sea: [-18, 17], msl: [18, 17] }[g.dom];
      x = bx + off[0] * scale + (n > 3 ? (n - 3) * 14 : 0); y = by + off[1] * scale + (g.loc < P ? 0 : 0);
      if (g.dom === 'land' && n > 0) { x += n * 11; y += n * 8; }
    }
    if (!on(x, y, 40)) continue;
    drawList.push([g, x, y]);
  }
  // draw flights first as rotated glyphs
  for (const [g, x, y] of drawList) {
    if (g.st === 'out' || g.st === 'back') {
      const u = g.u0, f = u.fl; const ang = Math.atan2(f.ty - f.fy, f.tx - f.fx);
      const [fx0, fy0] = w2s(f.fx, f.fy), [tx0, ty0] = w2s(f.tx, f.ty);
      ctx.strokeStyle = g.o === G.player ? 'rgba(255,255,255,.35)' : 'rgba(255,90,70,.45)'; ctx.setLineDash([3, 5]); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(fx0, fy0); ctx.lineTo(tx0, ty0); ctx.stroke(); ctx.setLineDash([]);
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang + Math.PI / 2);
      const isM = UNITS[u.t].dom === 'msl';
      ctx.shadowColor = isM ? '#ff7a30' : 'rgba(0,0,0,.6)'; ctx.shadowBlur = isM ? 10 : 4;
      drawGlyph(ctx, u.t, 0, 0, (isM ? 8 : 9) * scale * 1.1, isM ? (UNITS[u.t].nuke ? '#ffdf3a' : '#ff9a50') : G.C[g.o].color === '#fff' ? '#fff' : shade(G.C[g.o].color, 0.45));
      ctx.restore();
      MV.chips.push({ x: x - 10, y: y - 10, w: 20, h: 20, g });
    }
  }
  for (const [g, x, y] of drawList) {
    if (g.st === 'out' || g.st === 'back') continue;
    const selected = SELU && g.ids.some(id => SELU.has(id));
    drawChip(ctx, x, y, g, scale, selected);
    MV.chips.push({ x: x - CH_W * scale / 2, y: y - CH_H * scale / 2, w: CH_W * scale, h: CH_H * scale + 4, g });
  }
  // effects
  const nowT = MV.now;
  if (G.fx.length) { for (const f of G.fx) MV.fxs.push({ f, t0: nowT }); G.fx.length = 0; if (window.Snd) { for (const e of MV.fxs.slice(-6)) if (e.t0 === nowT) { if (e.f.t === 'nuke') Snd.play('nuke'); else if (e.f.t === 'boom') { const [sx, sy] = w2s(e.f.x, e.f.y); if (on(sx, sy, 0)) Snd.play('boom'); } } } }
  MV.fxs = MV.fxs.filter(e => nowT - e.t0 < (e.f.t === 'nuke' ? 3800 : 1100));
  for (const e of MV.fxs) {
    const [sx, sy] = w2s(e.f.x, e.f.y); const age = nowT - e.t0;
    if (!on(sx, sy, 80)) continue;
    if (e.f.t === 'boom') { const k = age / 1100; ctx.fillStyle = `rgba(255,${180 - k * 120 | 0},40,${1 - k})`; ctx.beginPath(); ctx.arc(sx, sy, 4 + k * 14, 0, 7); ctx.fill(); }
    else if (e.f.t === 'int') { const k = age / 1100; ctx.strokeStyle = `rgba(120,230,255,${1 - k})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, 6 + k * 22, 0, 7); ctx.stroke(); }
    else if (e.f.t === 'msl') { const k = age / 1100; ctx.fillStyle = `rgba(255,140,50,${0.9 - k * 0.9})`; ctx.beginPath(); ctx.arc(sx, sy, 5 + k * 26, 0, 7); ctx.fill(); }
    else if (e.f.t === 'nuke') {
      const k = age / 3800; const r = (20 + k * 130) * (MV.cam.z > 3 ? 1.6 : 1);
      const g = ctx.createRadialGradient(sx, sy, 2, sx, sy, r); g.addColorStop(0, `rgba(255,255,230,${1 - k * 0.6})`); g.addColorStop(0.35, `rgba(255,170,40,${0.9 - k * 0.8})`); g.addColorStop(1, 'rgba(120,20,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, r, 0, 7); ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,${0.8 - k * 0.8})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(sx, sy, r * 1.2, 0, 7); ctx.stroke();
    }
  }
  // selection box
  if (MV.box) { const b = MV.box; ctx.strokeStyle = 'rgba(255,230,120,.9)'; ctx.fillStyle = 'rgba(255,230,120,.1)'; ctx.lineWidth = 1; ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0); ctx.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0); }
}

/* ---------- picking ---------- */
let pickCtx = null;
function pickAt(wx, wy) {
  if (!pickCtx) pickCtx = document.createElement('canvas').getContext('2d');
  for (let i = 0; i < P; i++) { const b = PROV[i].bbox; if (wx < b[0] || wx > b[2] || wy < b[1] || wy > b[3]) continue; if (pickCtx.isPointInPath(PPATH[i], wx, wy, 'evenodd')) return { k: 'p', id: i }; }
  for (let i = 0; i < S; i++) { const b = SEA[i].bbox; if (wx < b[0] || wx > b[2] || wy < b[1] || wy > b[3]) continue; if (pickCtx.isPointInPath(SPATH[i], wx, wy, 'evenodd')) return { k: 's', id: i }; }
  return null;
}
function chipAt(sx, sy) { for (let i = MV.chips.length - 1; i >= 0; i--) { const c = MV.chips[i]; if (sx >= c.x && sx <= c.x + c.w && sy >= c.y && sy <= c.y + c.h) return c.g; } return null; }

/* ---------- minimap ---------- */
let miniDirty = true, miniTimer = 0;
function drawMini() {
  const m = MV.mctx, mw = MV.mini.width, mh = MV.mini.height;
  if (miniDirty) {
    m.setTransform(1, 0, 0, 1, 0, 0); m.fillStyle = ocean; m.fillRect(0, 0, mw, mh);
    m.setTransform(mw / WW, 0, 0, mh / WH, 0, 0);
    for (let i = 0; i < P; i++) { const o = ownerOf(i); m.fillStyle = G ? G.C[o].color : CCOLORS[o]; m.fill(PPATH[i], 'evenodd'); }
    m.strokeStyle = 'rgba(0,0,0,.5)'; m.lineWidth = 1.2; m.stroke(BORDER.cty);
    miniDirty = false;
    MV.miniBase = m.getImageData(0, 0, mw, mh);
  }
  MV.mctx.setTransform(1, 0, 0, 1, 0, 0);
  m.putImageData(MV.miniBase, 0, 0);
  const z = MV.cam.z, x0 = (MV.cam.cx - MV.W / 2 / z) / WW * mw, y0 = (MV.cam.cy - MV.H / 2 / z) / WH * mh, w = MV.W / z / WW * mw, h = MV.H / z / WH * mh;
  m.strokeStyle = '#fff'; m.lineWidth = 1.5; m.strokeRect(x0, y0, w, h);
}

/* ---------- main loop & input ---------- */
function initMap(cv, mini) {
  MV.cv = cv; MV.ctx = cv.getContext('2d'); MV.mini = mini; MV.mctx = mini.getContext('2d', { willReadFrequently: true });
  resize(); MV.cam.z = minZoom() * 1.0001; clampCam();
  window.addEventListener('resize', resize);
  let drag = null, pinch = null, moved = 0;
  const pos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('mousedown', e => {
    const [x, y] = pos(e); moved = 0;
    if (e.button === 2) { drag = { x, y, btn: 2 }; return; }
    if (e.button === 0) { drag = { x, y, cx: MV.cam.cx, cy: MV.cam.cy, btn: 0, shift: e.shiftKey, pan: !e.shiftKey }; if (e.shiftKey) MV.box = { x0: x, y0: y, x1: x, y1: y }; }
    if (e.button === 1) { drag = { x, y, cx: MV.cam.cx, cy: MV.cam.cy, btn: 1, pan: true }; e.preventDefault(); }
  });
  window.addEventListener('mousemove', e => {
    const [x, y] = pos(e);
    if (drag && drag.pan) {
      const dx = x - drag.x, dy = y - drag.y; moved = Math.max(moved, Math.abs(dx) + Math.abs(dy));
      MV.cam.cx = drag.cx - dx / MV.cam.z; MV.cam.cy = drag.cy - dy / MV.cam.z; clampCam(); MV.dirty = true;
    } else if (drag && drag.shift && MV.box) { MV.box.x1 = x; MV.box.y1 = y; moved = 10; MV.dirty = true; }
    else if (e.target === cv) hover(x, y);
  });
  window.addEventListener('mouseup', e => {
    if (!drag) return; const [x, y] = pos(e); const d = drag; drag = null;
    if (d.btn === 2) { if (MV.onRight) MV.onRight(x, y, e); return; }
    if (MV.box) { const b = MV.box; MV.box = null; if (Math.abs(b.x1 - b.x0) > 6 && MV.onBox) { MV.onBox(b, e); return; } }
    if (moved < 5 && d.btn === 0 && MV.onClick) MV.onClick(x, y, e);
    MV.dirty = true;
  });
  cv.addEventListener('wheel', e => { e.preventDefault(); const [x, y] = pos(e); zoomAt(x, y, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  cv.addEventListener('dblclick', e => { const [x, y] = pos(e); if (MV.onDbl) MV.onDbl(x, y, e); });
  // touch
  const tpos = t => { const r = cv.getBoundingClientRect(); return [t.clientX - r.left, t.clientY - r.top]; };
  let tstart = null, lpTimer = null;
  cv.addEventListener('touchstart', e => {
    e.preventDefault();
    if (e.touches.length === 1) { const [x, y] = tpos(e.touches[0]); tstart = { x, y, cx: MV.cam.cx, cy: MV.cam.cy, t: Date.now() }; moved = 0; pinch = null; clearTimeout(lpTimer); lpTimer = setTimeout(() => { if (tstart && moved < 8 && MV.onRight) { MV.onRight(tstart.x, tstart.y, e); tstart = null; } }, 520); }
    else if (e.touches.length === 2) { clearTimeout(lpTimer); tstart = null; const a = tpos(e.touches[0]), b = tpos(e.touches[1]); pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: MV.cam.z }; }
  }, { passive: false });
  cv.addEventListener('touchmove', e => {
    e.preventDefault();
    if (e.touches.length === 1 && tstart) { const [x, y] = tpos(e.touches[0]); const dx = x - tstart.x, dy = y - tstart.y; moved = Math.max(moved, Math.abs(dx) + Math.abs(dy)); if (moved > 8) clearTimeout(lpTimer); MV.cam.cx = tstart.cx - dx / MV.cam.z; MV.cam.cy = tstart.cy - dy / MV.cam.z; clampCam(); MV.dirty = true; }
    else if (e.touches.length === 2 && pinch) { const a = tpos(e.touches[0]), b = tpos(e.touches[1]); const d = Math.hypot(a[0] - b[0], a[1] - b[1]); const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2; const target = pinch.z * d / pinch.d; zoomAt(cx, cy, target / MV.cam.z); }
  }, { passive: false });
  cv.addEventListener('touchend', e => { clearTimeout(lpTimer); if (tstart && moved < 8 && e.changedTouches.length) { const [x, y] = tpos(e.changedTouches[0]); if (MV.onClick) MV.onClick(x, y, e); } tstart = null; if (e.touches.length < 2) pinch = null; });
  window.addEventListener('keydown', e => {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    const s = 60 / MV.cam.z; let h = false;
    if (e.key === 'ArrowLeft' || e.key === 'a') { MV.cam.cx -= s; h = true; } if (e.key === 'ArrowRight' || e.key === 'd') { MV.cam.cx += s; h = true; }
    if (e.key === 'ArrowUp' || e.key === 'w') { MV.cam.cy -= s; h = true; } if (e.key === 'ArrowDown' || e.key === 's') { MV.cam.cy += s; h = true; }
    if (e.key === '+' || e.key === '=') { zoomAt(MV.W / 2, MV.H / 2, 1.25); h = true; } if (e.key === '-') { zoomAt(MV.W / 2, MV.H / 2, 0.8); h = true; }
    if (h) { clampCam(); MV.dirty = true; if (MV.onKey) MV.onKey(e); } else if (MV.onKey) MV.onKey(e);
  });
  mini.addEventListener('mousedown', function mm(e) { const r = mini.getBoundingClientRect(); const go = ev => { const x = (ev.clientX - r.left) / r.width * WW, y = (ev.clientY - r.top) / r.height * WH; centerOn(x, y); }; go(e); const mv = ev => go(ev), up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); }; window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up); });
  mini.addEventListener('touchstart', e => { e.preventDefault(); const r = mini.getBoundingClientRect(); const t = e.touches[0]; centerOn((t.clientX - r.left) / r.width * WW, (t.clientY - r.top) / r.height * WH); }, { passive: false });
  mini.addEventListener('touchmove', e => { e.preventDefault(); const r = mini.getBoundingClientRect(); const t = e.touches[0]; centerOn((t.clientX - r.left) / r.width * WW, (t.clientY - r.top) / r.height * WH); }, { passive: false });
  function hover(x, y) {
    const [wx, wy] = s2w(x, y); const h = pickAt(wx, wy);
    const hp = h && h.k === 'p' ? h.id : -1, hs = h && h.k === 's' ? h.id : -1;
    MV.hoverTarget = h; MV.mx = x; MV.my = y;
    if (hp !== MV.hoverP || hs !== MV.hoverS) { MV.hoverP = hp; MV.hoverS = hs; MV.dirty = true; if (MV.onHover) MV.onHover(h, x, y); }
    MV.mx = x; MV.my = y;
  }
  function frame(t) {
    MV.now = t;
    const animate = (G && !G.paused) || MV.fxs.length || MV.dirty || (G && G.fx.length);
    if (animate || t - (MV.lastDraw || 0) > 400) {
      MV.lastDraw = t; MV.dirty = false;
      drawMap(); if (G) drawOverlay(); else drawOverlay();
      if (miniDirty || t - miniTimer > 250) { miniTimer = t; drawMini(); }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
