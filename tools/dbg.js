const fs=require('fs');const path=require('path');
const files=['src/world.js','src/world_decode.js','src/data.js','src/engine_core.js','src/engine_sim.js','src/engine_dipl.js','src/ai.js','src/campaign.js', 'src/quickplay.js'];
let code=files.map(f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8')).join('\n');
code+='\n;module.exports={get G(){return G},newGame,tick,cidx,PROV,CTY,UNITS};';
const m={exports:{}};new Function('module','exports','require',code)(m,m.exports,require);
const E=m.exports;E.newGame({playerKey:'POL',scenario:'eve',diff:'normal',seed:7});
for(let h=0;h<60;h++){E.tick();}
const G=E.G;
console.log(G.news.filter(n=>n.f).map(n=>'h'+n.h+' '+n.t+' '+n.x).slice(0,30).join('\n'));
{
const E2=m.exports; E2.newGame({playerKey:'POL',scenario:'eve',diff:'normal',seed:7});
const G=E2.G; const c=G.C[E2.cidx['PRK']];
console.log('PRK provs',c.provs.length,E2.CTY[c.id].provs.length,'capcap',G.pv[c.cap].cap, 'agg',c.agg,'nukes',c.nukes);
for(let h=0;h<12;h++){E2.tick(); if(h==8||h==9){console.log('h',G.hour,'news',G.news.length, G.news.filter(n=>n.t==='nuke').length);}}
}
