const fs=require('fs');const path=require('path');
const files=['src/world.js','src/world_decode.js','src/data.js','src/engine_core.js','src/engine_sim.js','src/engine_dipl.js','src/ai.js','src/campaign.js'];
let code=files.map(f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8')).join('\n');
code=code.replace("function unloadAll(u, p) {","function unloadAll(u, p) { globalThis.__unl=(globalThis.__unl||0)+1;");
code=code.replace("function loadOnTransport(tid, ids) {","function loadOnTransport(tid, ids) { globalThis.__ld=(globalThis.__ld||0)+1;");
code+='\n;module.exports={get G(){return G},newGame,tick,cidx};';
const m={exports:{}};new Function('module','exports','require',code)(m,m.exports,require);
const E=m.exports;E.newGame({playerKey:'POL',scenario:'chaos',diff:'normal',seed:11});
for(let d=0;d<90;d++){for(let h=0;h<24;h++)E.tick();}
console.log('loads',globalThis.__ld,'unloads',globalThis.__unl,'carrying transports',[...E.G.U.values()].filter(u=>u.t==='transport'&&u.cargo.length).length);
