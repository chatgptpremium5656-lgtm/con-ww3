'use strict';
/* ===== Graphics helpers: flags, unit glyphs, colors ===== */
function hex2rgb(h) { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgb2css(r, g, b, a) { return a === undefined ? `rgb(${r | 0},${g | 0},${b | 0})` : `rgba(${r | 0},${g | 0},${b | 0},${a})`; }
function shade(hex, f) { const [r, g, b] = hex2rgb(hex); return f >= 0 ? rgb2css(r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f) : rgb2css(r * (1 + f), g * (1 + f), b * (1 + f)); }
function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

/* flag DSL: "h:#a,#b|disc:#c" */
function drawFlag(ctx, flag, x, y, w, h) {
  const [base, over] = (flag || 'plain:#888').split('|');
  const [kind, cols] = base.split(':'); const cs = (cols || '#888').split(',');
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  if (kind === 'h') cs.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(x, y + h * i / cs.length, w, h / cs.length + 0.5); });
  else if (kind === 'v') cs.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(x + w * i / cs.length, y, w / cs.length + 0.5, h); });
  else { ctx.fillStyle = cs[0]; ctx.fillRect(x, y, w, h); }
  if (over) {
    const [ok, oc] = over.split(':');
    ctx.fillStyle = oc;
    if (ok === 'disc') { ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, h * 0.3, 0, 7); ctx.fill(); }
    else if (ok === 'cross') { ctx.fillRect(x + w * 0.3, y, h * 0.2, h); ctx.fillRect(x, y + h * 0.4, w, h * 0.2); }
    else if (ok === 'canton') { ctx.fillRect(x, y, w * 0.42, h * 0.54); }
    else if (ok === 'tri') { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w * 0.45, y + h / 2); ctx.lineTo(x, y + h); ctx.fill(); }
    else if (ok === 'star') { star(ctx, x + w / 2, y + h / 2, h * 0.32, h * 0.13); }
  }
  ctx.restore();
}
function star(ctx, cx, cy, ro, ri) { ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? ri : ro; ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r); } ctx.closePath(); ctx.fill(); }
const flagCache = {};
function flagURL(ci) {
  if (flagCache[ci]) return flagCache[ci];
  const cv = document.createElement('canvas'); cv.width = 48; cv.height = 32;
  const c = cv.getContext('2d'); drawFlag(c, CTY[ci].flag, 0, 0, 48, 32);
  c.strokeStyle = 'rgba(0,0,0,.5)'; c.strokeRect(0.5, 0.5, 47, 31);
  return flagCache[ci] = cv.toDataURL();
}
function flagImg(ci, cls) { return `<img class="flag ${cls || ''}" src="${flagURL(ci)}" alt="">`; }

/* unit glyphs, drawn inside a box of half-size s centered at (cx,cy) */
const PLANE = [[0, -1], [.16, -.45], [1, .15], [1, .38], [.16, .2], [.1, .7], [.45, .9], [.45, 1], [0, .9], [-.45, 1], [-.45, .9], [-.1, .7], [-.16, .2], [-1, .38], [-1, .15], [-.16, -.45]];
function poly(ctx, pts, cx, cy, sx, sy) { ctx.beginPath(); pts.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](cx + p[0] * sx, cy + p[1] * sy)); ctx.closePath(); }
function drawGlyph(ctx, t, cx, cy, s, col) {
  ctx.save(); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = Math.max(1, s * 0.16); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const L = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(cx + x1 * s, cy + y1 * s); ctx.lineTo(cx + x2 * s, cy + y2 * s); ctx.stroke(); };
  switch (t) {
    case 'inf': L(-1, -.62, 1, .62); L(-1, .62, 1, -.62); break;
    case 'recon': L(-1, .62, 1, -.62); break;
    case 'mot': L(-1, -.62, 1, .62); L(-1, .62, 1, -.62); ctx.beginPath(); ctx.arc(cx, cy + s * .35, s * .26, 0, 7); ctx.fill(); break;
    case 'tank': ctx.beginPath(); ctx.ellipse(cx, cy, s * .85, s * .48, 0, 0, 7); ctx.stroke(); L(-.45, 0, .45, 0); break;
    case 'arty': ctx.beginPath(); ctx.arc(cx, cy, s * .42, 0, 7); ctx.fill(); break;
    case 'mlrs': ctx.beginPath(); ctx.arc(cx, cy + s * .25, s * .34, 0, 7); ctx.fill(); L(-.5, -.15, -.5, -.75); L(0, -.15, 0, -.75); L(.5, -.15, .5, -.75); break;
    case 'aa': ctx.beginPath(); ctx.arc(cx, cy + s * .5, s * .8, Math.PI, 0); ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy + s * .45, s * .18, 0, 7); ctx.fill(); break;
    case 'spec': star(ctx, cx, cy, s * .85, s * .38); break;
    case 'fighter': poly(ctx, PLANE, cx, cy, s * .75, s * .95); ctx.fill(); break;
    case 'bomber': poly(ctx, PLANE, cx, cy, s * 1.0, s * .9); ctx.fill(); break;
    case 'sbomber': poly(ctx, PLANE, cx, cy, s * 1.1, s * .98); ctx.fill(); ctx.fillStyle = '#000'; [-.5, .5].forEach(x => { ctx.beginPath(); ctx.arc(cx + x * s, cy + s * .22, s * .09, 0, 7); ctx.fill(); }); break;
    case 'uav': poly(ctx, PLANE, cx, cy, s * .85, s * .6); ctx.stroke(); break;
    case 'heli': L(-1, -.55, 1, -.55); L(0, -.55, 0, .1); ctx.beginPath(); ctx.ellipse(cx, cy + s * .22, s * .4, s * .3, 0, 0, 7); ctx.fill(); L(.3, .25, 1, .5); break;
    case 'frigate': poly(ctx, [[-1, 0], [1, 0], [.65, .55], [-.75, .55]], cx, cy, s, s); ctx.fill(); L(-.1, 0, -.1, -.45); break;
    case 'destroyer': poly(ctx, [[-1, 0], [1, 0], [.7, .55], [-.8, .55]], cx, cy, s, s); ctx.fill(); L(-.3, 0, -.3, -.4); L(.25, 0, .25, -.55); break;
    case 'cruiser': poly(ctx, [[-1, 0], [1, 0], [.7, .6], [-.85, .6]], cx, cy, s, s); ctx.fill(); L(-.45, 0, -.45, -.4); L(0, 0, 0, -.62); L(.45, 0, .45, -.4); break;
    case 'sub': ctx.beginPath(); ctx.ellipse(cx, cy + s * .15, s, s * .3, 0, 0, 7); ctx.fill(); ctx.fillRect(cx - s * .15, cy - s * .35, s * .3, s * .3); break;
    case 'carrier': poly(ctx, [[-1, -.15], [1, -.15], [.8, .5], [-.9, .5]], cx, cy, s, s); ctx.fill(); ctx.fillStyle = '#000'; ctx.fillRect(cx + s * .25, cy - s * .55, s * .22, s * .4); break;
    case 'transport': poly(ctx, [[-1, 0], [1, 0], [.7, .55], [-.8, .55]], cx, cy, s, s); ctx.fill(); ctx.fillRect(cx - s * .5, cy - s * .5, s * .7, s * .5); break;
    case 'cruise': poly(ctx, [[0, -1], [.18, -.55], [.18, .35], [.55, .8], [.12, .62], [.12, .9], [-.12, .9], [-.12, .62], [-.55, .8], [-.18, .35], [-.18, -.55]], cx, cy, s * .8, s); ctx.fill(); break;
    case 'btm': poly(ctx, [[0, -1], [.22, -.5], [.22, .4], [.6, .9], [.12, .7], [-.12, .7], [-.6, .9], [-.22, .4], [-.22, -.5]], cx, cy, s * .8, s); ctx.fill(); break;
    case 'icbm': poly(ctx, [[0, -1], [.22, -.5], [.22, .4], [.6, .9], [.12, .7], [-.12, .7], [-.6, .9], [-.22, .4], [-.22, -.5]], cx, cy, s * .7, s); ctx.fill(); ctx.strokeStyle = '#ffdf3a'; ctx.beginPath(); ctx.arc(cx, cy - s * .1, s * .32, 0, 7); ctx.stroke(); break;
    default: ctx.beginPath(); ctx.arc(cx, cy, s * .5, 0, 7); ctx.fill();
  }
  ctx.restore();
}
const iconCache = {};
function unitIconURL(t, col) {
  const k = t + col; if (iconCache[k]) return iconCache[k];
  const cv = document.createElement('canvas'); cv.width = cv.height = 48; const c = cv.getContext('2d');
  drawGlyph(c, t, 24, 24, 18, col || '#fff');
  return iconCache[k] = cv.toDataURL();
}
function unitIcon(t, col, sz) { return `<img class="uico" style="width:${sz || 20}px;height:${sz || 20}px" src="${unitIconURL(t, col || '#e8eef5')}" alt="">`; }

function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
