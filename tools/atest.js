const fs=require('fs');const path=require('path');
const files=['src/world.js','src/world_decode.js','src/data.js','src/engine_core.js','src/engine_sim.js','src/engine_dipl.js','src/ai.js'];
let code=files.map(f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8')).join('\n');
code+='\n;module.exports={get G(){return G},newGame,tick,cidx,PROV,CTY,UNITS,spawnUnit,declareWar,orderMove,orderAir,fireMissile,killUnit,locName};';
const m={exports:{}};new Function('module','exports','require',code)(m,m.exports,require);
const E=m.exports;
function setup(){E.newGame({playerKey:'POL',scenario:'cold',diff:'normal',seed:3});const G=E.G;for(const [,u] of [...G.U]) E.killUnit(u);return G;}
let G=setup();
const a=E.cidx['POL'],b=E.cidx['BLR'];const NCt=G.C.length;
G.war[a*NCt+b]=G.war[b*NCt+a]=1;
const base=G.C[a].provs.find(p=>G.pv[p].b.airfield>=2);const tgt=E.CTY[b].provs[0];
console.log('base',E.locName(base),'target',E.locName(tgt),'dist',Math.hypot(E.PROV[base].x-E.PROV[tgt].x,E.PROV[base].y-E.PROV[tgt].y).toFixed(0));
const bombers=[];for(let i=0;i<6;i++)bombers.push(E.spawnUnit(a,'bomber',base));
const fighters=[];for(let i=0;i<4;i++)fighters.push(E.spawnUnit(a,'fighter',base));
const enemies=[];for(let i=0;i<6;i++)enemies.push(E.spawnUnit(b,'inf',tgt));for(let i=0;i<2;i++)enemies.push(E.spawnUnit(b,'tank',tgt));
G.pv[tgt].b.aa=2;
console.log(JSON.stringify(E.orderAir(bombers.map(u=>u.id),tgt,'strike')),JSON.stringify(E.orderAir(fighters.map(u=>u.id),tgt,'patrol')));
for(let h=0;h<30;h++){E.tick();if(h%3==0)console.log('h',h+1,'bomb',bombers.map(u=>G.U.has(u.id)?u.st+':'+Math.round(u.hp):'X').join(' '),'| enemy',enemies.filter(u=>G.U.has(u.id)).map(u=>Math.round(u.hp)).join(','),'dmg',G.pv[tgt].dmg.toFixed(1));}
