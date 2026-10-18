#!/usr/bin/env node
// Bundles src/* into a single self-contained index.html
const fs = require('fs'), path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const js = ['src/world.js','src/data.js','src/engine_core.js','src/engine_sim.js','src/engine_dipl.js','src/ai.js','src/gfx.js','src/render.js','src/ui_core.js','src/ui_modals.js','src/ui_start.js'].map(R).join('\n');
const html = R('src/template.html').replace('/*CSS*/', () => R('src/style.css')).replace('/*JS*/', () => js.replace(/<\/script/gi, '<\\/script'));
fs.writeFileSync(path.join(__dirname, '..', 'index.html'), html);
console.log('index.html', (html.length / 1024).toFixed(0) + ' KB');
