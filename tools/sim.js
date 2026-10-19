// headless simulation test
const fs=require('fs');const path=require('path');
const files=['src/world.js','src/world_decode.js','src/data.js','src/engine_core.js','src/engine_sim.js','src/engine_dipl.js','src/ai.js','src/campaign.js'];
let code=files.map(f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8')).join('\n');
code+='\n;module.exports={get G(){return G},newGame,tick,cidx,declareWar,warsOf,armyPower,PROV,CTY,UNITS,saveGame,loadGame};';
const m={exports:{}};new Function('module','exports','require',code)(m,m.exports,require);
const E=m.exports;
const days=+process.argv[2]||30;
const t0=Date.now();
E.newGame({playerKey:process.argv[3]||'POL',scenario:process.argv[4]||'eve',diff:'normal',seed:7});
console.log('init ms',Date.now()-t0,'units',E.G.U.size);
const t1=Date.now();
for(let d=0;d<days;d++){for(let h=0;h<24;h++)E.tick();
 if(d%10===9||d===days-1){const G=E.G;let wars=0;for(let a=0;a<G.C.length;a++)for(let b=a+1;b<G.C.length;b++)if(G.war[a*G.C.length+b])wars++;
  console.log('day',d+1,'units',G.U.size,'wars',wars,'alive',G.C.filter(c=>c.alive).length,'news',G.news.length,'ms',Date.now()-t1);}}
const G=E.G;
for(const k of ['USA','US1','RUS','CH1','POL','UKR']){const c=G.C[E.cidx[k]];if(!c)continue;console.log(k,c.n,'provs',c.provs.length,'units',[...G.U.values()].filter(u=>u.o===c.id).length,'res',Object.entries(c.res).map(([k,v])=>k+':'+Math.round(v)).join(' '),'inc',Object.entries(c.inc).map(([k,v])=>k+':'+Math.round(v)).join(' '));}
console.log(G.news.filter(n=>n.f==='g').slice(-15).map(n=>'d'+Math.floor(n.h/24)+' '+n.x).join('\n'));
const s=E.saveGame();console.log('save bytes',s.length);E.loadGame(s);for(let i=0;i<48;i++)E.tick();console.log('load ok hour',E.G.hour);
{const c=E.G.C[E.cidx['POL']];console.log('POL use',JSON.stringify(c.use),'short',JSON.stringify(c.short),'inc.fuel',c.inc.fuel);}
{const c=E.G.C[E.cidx['POL']];console.log('POL res',JSON.stringify(c.res));}
console.log('peace news',E.G.news.filter(n=>n.t==='peace').length,'nukes',E.G.stats.nukes);
