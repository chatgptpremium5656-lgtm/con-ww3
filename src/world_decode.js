'use strict';
/* Decodes the packed world data: arcs, adjacency graph, bounding boxes, per-country province lists */
(function () {
  const W = WORLD;
  const bin = atob(W.ap), b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  let pos = 0;
  const rv = () => { let r = 0, sh = 0, c; do { c = b[pos++]; r |= (c & 127) << sh; sh += 7; } while (c & 128); return r >>> 0; };
  const zd = () => { const v = rv(); return (v >>> 1) ^ -(v & 1); };
  W.arcs = [];
  while (pos < b.length) {
    const l = rv() - 1, r = rv() - 1, cl = rv(), n = rv();
    const pts = new Int32Array(n * 2); let x = 0, y = 0;
    for (let i = 0; i < n; i++) { x += zd(); y += zd(); pts[2 * i] = x; pts[2 * i + 1] = y; }
    W.arcs.push([l, r, cl, pts]);
  }
  const P = W.provs.length;
  for (const p of W.provs) { p.adj = []; p.seas = []; }
  for (const s of W.seas) { s.adj = []; s.ports = []; }
  const add = (arr, v) => { if (arr.indexOf(v) < 0) arr.push(v); };
  const link = (a, b) => {
    if (a < P && b < P) { add(W.provs[a].adj, b); add(W.provs[b].adj, a); }
    else if (a >= P && b >= P) { add(W.seas[a - P].adj, b - P); add(W.seas[b - P].adj, a - P); }
    else { const p = a < P ? a : b, s = (a < P ? b : a) - P; add(W.provs[p].seas, s); add(W.seas[s].ports, p); }
  };
  for (const a of W.arcs) if (a[0] >= 0 && a[1] >= 0 && a[0] !== a[1]) link(a[0], a[1]);
  for (const [a, b] of W.links.land) link(a, b);
  for (const l of W.links.sea) { if (l.length === 3) link(l[0], l[1] + P); else link(l[0] + P, l[1] + P); }
  const abb = W.arcs.map(a => { let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; const p = a[3]; for (let i = 0; i < p.length; i += 2) { if (p[i] < x0) x0 = p[i]; if (p[i] > x1) x1 = p[i]; if (p[i + 1] < y0) y0 = p[i + 1]; if (p[i + 1] > y1) y1 = p[i + 1]; } return [x0, y0, x1, y1]; });
  for (const r of W.provs.concat(W.seas)) {
    const bb = [1e9, 1e9, -1, -1];
    for (const ring of r.rings) for (const ai of ring) { const q = abb[ai >= 0 ? ai : ~ai]; if (q[0] < bb[0]) bb[0] = q[0]; if (q[1] < bb[1]) bb[1] = q[1]; if (q[2] > bb[2]) bb[2] = q[2]; if (q[3] > bb[3]) bb[3] = q[3]; }
    r.bbox = bb;
  }
  W.countries.forEach(c => { c.provs = []; });
  W.provs.forEach(p => W.countries[p.c].provs.push(p.id));
})();
