#!/usr/bin/env node
// Bundles src/* into a single self-contained index.html (minified with terser when available)
const fs = require('fs'), path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const files = ['src/world.js', 'src/world_decode.js', 'src/data.js', 'src/engine_core.js', 'src/engine_sim.js', 'src/engine_dipl.js', 'src/ai.js', 'src/campaign.js', 'src/quickplay.js', 'src/gfx.js', 'src/render.js', 'src/ui_core.js', 'src/ui_modals.js', 'src/ui_start.js', 'src/ui_campaign.js', 'src/ui_quickplay.js'];
let js = files.map(R).join('\n');
let css = R('src/style.css');
(async () => {
  let terser = null;
  for (const p of ['terser', '/tmp/tz/node_modules/terser', path.join(__dirname, 'node_modules/terser')]) { try { terser = require(p); break; } catch (e) { } }
  if (terser && !process.env.NOMIN) {
    const r = await terser.minify(js, { compress: { passes: 2, drop_console: false }, mangle: true, format: { comments: false } });
    if (r.code) { console.log('terser: js', (js.length / 1024).toFixed(0), '->', (r.code.length / 1024).toFixed(0), 'KB'); js = r.code; }
    css = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s*([{};:,>])\s*/g, '$1').replace(/;}/g, '}').trim();
  }
  const html = R('src/template.html').replace('/*CSS*/', () => css).replace('/*JS*/', () => js.replace(/<\/script/gi, '<\\/script'));
  fs.writeFileSync(path.join(__dirname, '..', 'index.html'), html);
  console.log('index.html', (html.length / 1024).toFixed(0) + ' KB');
})();
