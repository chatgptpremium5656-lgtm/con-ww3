const fs=require('fs');const path=require('path');
const files=['src/world.js','src/world_decode.js','src/data.js','src/engine_core.js','src/engine_sim.js','src/engine_dipl.js','src/ai.js','src/campaign.js'];
let code=files.map(f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8')).join('\n');
code+='\n;module.exports={get G(){return G},newGame,tick,cidx,PROV,CTY,UNITS,spawnUnit,declareWar,orderMove,orderAir,fireMissile,killUnit,armyPower};';
const m={exports:{}};new Function('module','exports','require',code)(m,m.exports,require);
const E=m.exports;
function setup(){E.newGame({playerKey:'POL',scenario:'cold',diff:'normal',seed:3});const G=E.G;
 // wipe all units for clean test
 for(const [,u] of [...G.U]) E.killUnit(u); return G;}
let G=setup();
const a=E.cidx['POL'],b=E.cidx['BLR'];
const loc=E.CTY[b].provs[0];
E.declareWar(a,b,true);
function trial(name,A,B,hours){
 G=setup();
 const a=E.cidx['POL'],b=E.cidx['BLR'];const loc=E.CTY[b].provs[0];
 G.war[a*G.C.length+b]=G.war[b*G.C.length+a]=1;
 const ua=[],ub=[];
 for(const t of A)ua.push(E.spawnUnit(a,t,loc));for(const t of B)ub.push(E.spawnUnit(b,t,loc));
 for(let h=0;h<hours;h++){E.tick();}
 const sa=ua.filter(u=>G.U.has(u.id)),sb=ub.filter(u=>G.U.has(u.id));
 console.log(name,'after',hours,'h: A',sa.length,'/',A.length,'hp',Math.round(sa.reduce((x,u)=>x+u.hp,0)/Math.max(1,sa.length)),'| B',sb.length,'/',B.length,'hp',Math.round(sb.reduce((x,u)=>x+u.hp,0)/Math.max(1,sb.length)),' owner now',G.C[G.pv[loc].o].n,'cap',JSON.stringify(G.pv[loc].cap&&G.pv[loc].cap.prog|0));
}
trial('6inf vs 6inf',Array(6).fill('inf'),Array(6).fill('inf'),24);
trial('6inf vs 6inf',Array(6).fill('inf'),Array(6).fill('inf'),48);
trial('4tank vs 6inf',Array(4).fill('tank'),Array(6).fill('inf'),24);
trial('4tank vs 6inf 48',Array(4).fill('tank'),Array(6).fill('inf'),48);
trial('6inf vs 4tank',Array(6).fill('inf'),Array(4).fill('tank'),48);
trial('4 bomber strike vs 6 inf+2aa(air stationed)',['bomber','bomber','bomber','bomber'],['inf','inf','inf','inf','aa','aa'],10);
trial('2inf unopposed capture',Array(2).fill('inf'),[],40);
trial('2inf unopposed capture 80h',Array(2).fill('inf'),[],80);
