'use strict';
function quickUnitsHTML(us) {
  const land = us.some(u => ['land', 'sea'].includes(UNITS[u.t].dom)), air = us.some(u => UNITS[u.t].dom === 'air'), transport = us.some(u => u.t === 'transport');
  return `<div class="ph"><h3>🪖 Выбрано: ${us.length}<small>Прочность: ${Math.round(us.reduce((s, u) => s + u.hp, 0) / us.length)}%</small></h3><button class="x" data-act="desel">✕</button></div><div class="acts">${land ? '<button class="btn pri" data-act="mode" data-m="move">➜ Идти / атаковать</button><button class="btn" data-act="stop">Стоп</button>' : ''}${air ? '<button class="btn pri" data-act="mode" data-m="strike">💥 Удар</button><button class="btn" data-act="recall">↩ На базу</button>' : ''}${transport ? '<button class="btn" data-act="loadtr">Погрузить</button><button class="btn" data-act="unloadtr">Высадить</button>' : ''}</div>`;
}
function quickProvinceHTML(p) {
  const pv = G.pv[p], mine = pv.o === G.player;
  let h = `<div class="ph"><h3>${esc(PROV[p].name)}<small>${esc(G.C[pv.o].n)} · ★ ${PROV[p].vp}</small></h3><button class="x" data-act="closeprov">✕</button></div>`;
  if (mine) {
    h += '<div class="sec"><h4>Подкрепления</h4><div class="quick-recruits">';
    for (const t of ['inf', 'tank', 'fighter', 'frigate']) if (UNITS[t].dom !== 'sea' || isCoastal(p)) h += quickRecruitButton(p, t);
    h += '</div><details class="quick-extra-units"><summary>Другие войска</summary><div class="quick-recruits">' + ['recon','arty','bomber','transport'].filter(t => UNITS[t].dom !== 'sea' || isCoastal(p)).map(t => quickRecruitButton(p,t)).join('') + '</div></details>';
    if (pv.q.length) h += `<h4>Готовятся</h4>${pv.q.map((q, i) => `<div class="q">${UNITS[q.t].n}<b>${Math.ceil(q.left)} ч</b><button class="btn sm" data-act="cancelq" data-p="${p}" data-i="${i}" aria-label="Отменить заказ">✕</button></div>`).join('')}`;
    h += '</div><div class="sec"><h4>Постройки</h4><div class="row quick-builds">';
    for (const b of ['eco', 'barracks', 'factory', 'airfield', 'naval']) {
      if (b === 'naval' && !isCoastal(p)) continue;
      const err = canBuild(p, b);
      h += `<button class="btn" data-act="build" data-p="${p}" data-b="${b}" ${err ? 'disabled' : ''} title="${esc(err || costText(bldCost(b, pv.b[b] + 1)).replace(/<br>/g, ' · '))}">${BLD[b].i} ${b === 'eco' ? 'Доход' : BLD[b].n} ${pv.b[b] || ''} ＋</button>`;
    }
    if (pv.bq) h += `<p>🏗 ${BLD[pv.bq.b].n} · ${Math.ceil(pv.bq.left)} ч</p>`;
    h += '</div></div>';
  } else h += `<div class="sec"><button class="btn" data-act="dipl" data-c="${pv.o}">🤝 Дипломатия</button>${atWar(G.player, pv.o) ? `<button class="btn pri" data-act="quick-attack" data-p="${p}">⚔ Атаковать выбранными</button>` : '<p class="note">Для захвата сначала объявите войну в дипломатии.</p>'}</div>`;
  const own = unitsAt(p).filter(u => u.o === G.player);
  if (own.length) h += `<div class="sec"><button class="btn pri" data-act="selall" data-p="${p}">🪖 Выбрать войска (${own.length})</button><p class="note">Правый клик по цели — идти или атаковать. На телефоне — удерживайте цель пальцем.</p></div>`;
  if (pv.cap) h += `<div class="sec">⚔ Захват: ${Math.round(pv.cap.prog)}%</div>`;
  return h;
}
function quickOverviewHTML() {
  const c = G.C[G.player];
  return `<h3>${flagImg(c.id)} ${esc(c.n)}</h3><div class="cx-grid">${card('Территория', `${c.provs.length} провинций · ${c.vp} победных очков`)}${card('Армия', `${unitsOf(c.id).length} частей`)}${card('Победа', `${Math.round(G.opts.win * 100)}% победных очков мира вместе с союзниками`)}</div><p>Стройте здания дохода, заказывайте подкрепления и захватывайте города со звёздами.</p>`;
}
function quickMenuHTML() {
  return `<div class="quick-menu"><button class="btn pri" data-act="closemodal">▶ Играть</button><button class="btn" data-act="save" data-n="1">💾 Сохранить</button><button class="btn" data-act="loadslot" data-n="1" ${slotInfo(1) ? '' : 'disabled'}>📂 Загрузить</button>${cxButton('export', 'Скачать сохранение')}${cxButton('import', 'Открыть сохранение из файла')}${cxButton('settings', '⚙ Настройки')}<button class="btn danger" data-act="newgame">Новая игра</button><small>Быстрая игра · v${GAME_VERSION}</small></div>`;
}
function quickPreferencesHTML() {
  return `<div class="cx-fields"><label><input type="checkbox" data-act="optsound" ${UI.sound ? 'checked' : ''}> Звук</label><label>Громкость <input type="range" data-cx-pref="volume" min="0" max="1" step="0.05" value="${PREF.volume}"></label><label>Размер текста <input type="number" data-cx-pref="font" min="12" max="20" value="${PREF.font}"></label><label><input type="checkbox" data-cx-pref="lowPower" ${PREF.lowPower ? 'checked' : ''}> Экономить батарею</label></div><p>Двигайте войска, захватывайте города и вызывайте подкрепления. Топливо, питание и снабжение обслуживаются автоматически.</p><p>Крылатые, баллистические и ядерные ракеты отключены для всех стран, включая ИИ.</p>`;
}
function quickGuideHTML() {
  return '<h3>Три шага</h3><ol><li>В своей провинции закажите пехоту или технику. Деньги и материалы показаны сверху.</li><li>Выберите свой отряд. Правый клик по цели — приказ. На телефоне удерживайте цель пальцем.</li><li>Для захвата чужой страны сначала объявите войну в дипломатии. Города со звёздами приближают победу.</li></ol><p>Казармы открывают пехоту, завод — танки и артиллерию, аэродром — самолёты, порт — корабли. «Доход» увеличивает добычу.</p><p>Армия автоматически модернизируется каждую игровую неделю. Питание, топливо и снабжение не требуют ручного управления. Ракетного оружия нет.</p>';
}
document.addEventListener('click', e => {
  const button = e.target.closest('[data-act="quick-attack"]');
  if (!button || !G) return;
  if (!SEL.units.size) { toast('Сначала выберите свои войска на карте'); return; }
  issueOrder({ k: 'p', id: +button.dataset.p }, null);
});

function quickRecruitButton(p,t) {
  const error=canQueue(p,t),cost=unitCostFor(G.player,t);
  return `<button class="btn quick-recruit" data-act="queue" data-p="${p}" data-t="${t}" ${error?'disabled':''} title="${esc(error || 'Готово примерно через '+Math.round(UNITS[t].time*.4)+' ч')}">${unitIcon(t,'#fff',24)}<b>${UNITS[t].n}</b><small>${costHTMLplain(cost,unitMult(G.player))}${error?'<br>'+esc(error):''}</small></button>`;
}
