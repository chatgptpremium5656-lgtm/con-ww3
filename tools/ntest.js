const fs=require('fs');const path=require('path');
const files=['src/world.js','src/world_decode.js','src/data.js','src/engine_core.js','src/engine_sim.js','src/engine_dipl.js','src/ai.js','src/campaign.js'];
let code=files.map(f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8')).join('\n');
code+='\n;module.exports={get G(){return G},newGame,tick,cidx,PROV,CTY,UNITS,spawnUnit,declareWar,fireMissile,killUnit,locName,orderAir};';
const m={exports:{}};new Function('module','exports','require',code)(m,m.exports,require);
const E=m.exports;
E.newGame({playerKey:'US1',scenario:'cold',diff:'normal',seed:3});const G=E.G;
const us=E.cidx['US1'],ru=E.cidx['RUS'];
const silo=G.C[us].provs.find(p=>G.pv[p].b.silo>0);
const icbms=[...G.U.values()].filter(u=>u.o===us&&u.t==='icbm');
console.log('silo',silo&&E.locName(silo),'icbms',icbms.length);
const tgt=G.C[ru].cap;
console.log('declare',E.declareWar(us,ru));
console.log('fired',E.fireMissile([icbms[0].id],tgt),'target',E.locName(tgt));
for(let h=0;h<80;h++){E.tick();}
console.log(G.news.filter(n=>n.t==='nuke').map(n=>n.x).join('\n'));
console.log('pop after',G.pv[tgt].pop,'dmg',G.pv[tgt].dmg,'fall',G.pv[tgt].fall.toFixed(2),'rel RUS->US',G.rel[ru*G.C.length+us]);
