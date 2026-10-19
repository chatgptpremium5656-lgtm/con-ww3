const fs=require('fs');const path=require('path');
const files=['src/world.js','src/world_decode.js','src/data.js','src/engine_core.js','src/engine_sim.js','src/engine_dipl.js','src/ai.js','src/campaign.js', 'src/quickplay.js'];
let code=files.map(f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8')).join('\n');
code+='\n;module.exports={get G(){return G},newGame,tick,cidx,PROV,UNITS,spawnUnit,orderAir,locName};';
const m={exports:{}};new Function('module','exports','require',code)(m,m.exports,require);
const E=m.exports;E.newGame({playerKey:'POL',scenario:'cold',diff:'normal',seed:3});const G=E.G;
const a=E.cidx['POL'];const bases=G.C[a].provs.filter(p=>G.pv[p].b.airfield>0);console.log('bases',bases.map(E.locName).join(','));
if(bases.length>=2){const u=E.spawnUnit(a,'fighter',bases[0]);console.log(JSON.stringify(E.orderAir([u.id],bases[1],'rebase')));for(let h=0;h<10;h++)E.tick();console.log(u.st,E.locName(u.loc),u.bs===bases[1]);}
