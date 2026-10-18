const fs=require('fs');const path=require('path');
const files=['src/world.js','src/world_decode.js','src/data.js','src/engine_core.js','src/engine_sim.js','src/engine_dipl.js','src/ai.js'];
let code=files.map(f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8')).join('\n');
code+='\n;module.exports={get G(){return G},newGame,tick,cidx,PROV,CTY,UNITS,SEA,P,spawnUnit,declareWar,orderMove,orderAir,fireMissile,loadOnTransport,killUnit,findPath,isCoastal,locName,ADJS};';
const m={exports:{}};new Function('module','exports','require',code)(m,m.exports,require);
const E=m.exports;
E.newGame({playerKey:'GB1',scenario:'cold',diff:'normal',seed:5});const G=E.G;
for(const [,u] of [...G.U]) E.killUnit(u);
const gb=E.cidx['GB1'],fr=E.cidx['FR1'];
E.declareWar(gb,fr,true);
const port=G.C[gb].provs.find(p=>E.isCoastal(p)&&G.pv[p].b.naval>0)||G.C[gb].provs.find(p=>E.isCoastal(p));
console.log('port',E.PROV[port].name);
const tr=E.spawnUnit(gb,'transport',port);const infs=[];for(let i=0;i<4;i++)infs.push(E.spawnUnit(gb,'inf',port));
console.log('loaded',E.loadOnTransport(tr.id,infs.map(u=>u.id)));
// French coastal province nearest
let best=-1,bd=1e9;for(const p of G.C[fr].provs){if(!E.isCoastal(p))continue;const d=Math.hypot(E.PROV[p].x-E.PROV[port].x,E.PROV[p].y-E.PROV[port].y);if(d<bd){bd=d;best=p}}
console.log('target',E.PROV[best].name,bd.toFixed(0));
const path2=E.findPath(tr,port,best);console.log('path',path2&&path2.map(E.locName).join(' > '));
console.log(E.orderMove([tr.id],best));
for(let h=0;h<200;h++){E.tick(); if(h%40==39)console.log('h',h+1,'tr',tr.st,E.locName(tr.loc),'cargo',tr.cargo.length,'inf locs',infs.map(u=>G.U.has(u.id)?E.locName(u.loc)+':'+u.st:'dead').join(','));}
