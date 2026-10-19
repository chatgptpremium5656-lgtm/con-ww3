'use strict';
/* Headquarters, accessible preferences, portable saves, and map overlays. */
const DEFAULT_KEYS = { pause: 'Space', home: 'KeyH', move: 'KeyR', strike: 'KeyB', patrol: 'KeyP', fire: 'KeyF', overview: 'KeyM', search: 'Slash', advisor: 'KeyI' };
const KEY_NAMES = { pause: 'Пауза', home: 'Столица', move: 'Движение', strike: 'Удар', patrol: 'Патруль', fire: 'Ракетный пуск', overview: 'Обзор', search: 'Поиск', advisor: 'Советник' };
const PREF_DEFAULTS = { theme: 'dark', font: 13, simple: false, contrast: false, reduced: false, lowPower: false, waves: false, clouds: false, roads: false, routes: false, fronts: false, ranges: true, weather: true, lights: true, effects: true, volume: 0.6, music: false, keys: DEFAULT_KEYS };
let PREF = Object.assign({}, PREF_DEFAULTS, { keys: Object.assign({}, DEFAULT_KEYS) });
try { const p = JSON.parse(localStorage.getItem('conww3_preferences') || '{}'); for (const k in PREF_DEFAULTS) if (typeof p[k] === typeof PREF_DEFAULTS[k]) PREF[k] = p[k]; PREF.keys = Object.assign({}, DEFAULT_KEYS, p.keys || {}); } catch (_) { }
let musicTimer = null;
function applyPreferences() {
  if (!['dark', 'light', 'military'].includes(PREF.theme)) PREF.theme = 'dark';
  for (const k in DEFAULT_KEYS) if (typeof PREF.keys[k] !== 'string' || !/^(Space|Slash|Key[A-Z])$/.test(PREF.keys[k])) PREF.keys[k] = DEFAULT_KEYS[k];
  PREF.font = clamp(+PREF.font || 13, 12, 20); PREF.volume = clamp(+PREF.volume || 0, 0, 1);
  document.body.dataset.theme = PREF.theme;
  document.documentElement.style.setProperty('--game-font', PREF.font + 'px');
  for (const [cls, on] of [['simple-ui', PREF.simple], ['high-contrast', PREF.contrast], ['reduce-motion', PREF.reduced], ['low-power', PREF.lowPower]]) document.body.classList.toggle(cls, !!on);
  MV.baseKey = ''; MV.dirty = true; if (MV.cv) resize();
  try { localStorage.setItem('conww3_preferences', JSON.stringify(PREF)); } catch (_) { toast('Настройки действуют, но браузер не разрешил их сохранить', 'war'); }
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  if (PREF.music && UI.sound) { let i = 0; musicTimer = setInterval(() => { if (!document.hidden) Snd.play(['calm1', 'calm2', 'calm3', 'calm2'][i++ % 4]); }, 2800); }
}
TITLES.command = '🎛 Штаб';
TITLES.search = '🔎 Поиск на карте';
TABS.command = [['advisor', 'Советник'], ['budget', 'Бюджет'], ['forces', 'Операции'], ['treaties', 'Договоры'], ['reports', 'Бои'], ['decisions', 'Решения'], ['history', 'История'], ['achievements', 'Достижения'], ['guide', 'Справочник'], ['settings', 'Настройки'], ['changes', 'Обновление']];
LEFT.push(['command', '🎛', 'Штаб']);
MODES.push(['supply', '🚚', 'Снабжение'], ['loyalty', '♥', 'Лояльность'], ['fallout', '☢', 'Радиация']);
LEGENDS.supply = [['#35a87c', 'Снабжение доступно'], ['#d78836', 'Изолированная своя провинция'], ['#4a5360', 'Чужая территория']];
LEGENDS.loyalty = [['grad:#a84439,#d1b356,#35a87c', 'Лояльность: 0 → 100']];
LEGENDS.fallout = [['#253444', 'Без заражения'], ['#bcbd3e', 'Чем ярче, тем сильнее заражение']];
function openCommand(tab) { UI.tab.command = tab; openModal('command'); }
function card(title, text, action) { return `<article class="cx-card"><h3>${title}</h3><div>${text}</div>${action || ''}</article>`; }
function cxButton(action, label, attrs) { return `<button class="btn" data-act="cx-${action}" ${attrs || ''}>${label}</button>`; }
function campaignToolbar() {
  let bar = $('campaign-bar');
  if (!bar) { bar = document.createElement('div'); bar.id = 'campaign-bar'; $('hud').appendChild(bar); }
  bar.innerHTML = `${cxButton('advisor', '💡 Что делать дальше?')}${cxButton('search', '🔎 Поиск')}${cxButton('settings', '⚙ Настройки')}<span class="cx-version">v${GAME_VERSION}${G?.opts.observer ? ' · НАБЛЮДАТЕЛЬ' : ''}</span>`;
}
function adviceItems() {
  const C = G.C[G.player], out = [];
  if (G.opts.observer) return [{ title: 'Режим наблюдателя', text: 'Все страны управляются ИИ. Можно менять точку наблюдения в поиске по странам.', tab: 'history' }];
  for (const r of budgetFor(G.player).filter(x => x.days < 5)) out.push({ title: `${RES_INFO[r.k].i} Запас закончится через ${r.days.toFixed(1)} сут.`, text: `${RES_INFO[r.k].n}: доход ${r.income.toFixed(1)}, расход ${r.expense.toFixed(1)} в сутки. Проверьте содержание армии, добычу и лимиты автоматических закупок.`, tab: 'budget' });
  const underAttack = C.provs.find(p => G.pv[p].cap || G.bat.get(p) >= G.hour - 2);
  if (underAttack !== undefined) out.unshift({ title: '⚔ На вашей территории бой', text: `Проверьте ${PROV[underAttack].name}, подкрепления и безопасный путь отступления.`, loc: underAttack });
  const cut = unitsOf(G.player).filter(u => !supplied(u));
  if (cut.length) out.push({ title: `🚚 Без снабжения: ${cut.length} частей`, text: 'Соедините позиции с вашей столицей, складом или незаблокированным портом. Изоляция снижает атаку и скорость на 30%.', tab: 'forces' });
  const queue = C.provs.some(p => G.pv[p].bq);
  if (!queue) out.push({ title: '🏗 Строительство простаивает', text: 'Ресурсный комплекс повышает добычу, инфраструктура ускоряет переброску, а склад помогает снабжать удалённые гарнизоны.', loc: C.cap });
  if (Object.values(C.rs).every(x => !x)) out.push({ title: '🔬 Нет активных исследований', text: 'Логистика снижает содержание армии, новые поколения усиливают выбранные типы войск.', modal: 'research' });
  if (unitsOf(C.id).some(u => canUpgrade(u))) out.push({ title: '⬆ Есть устаревшие части', text: 'Выберите войска на своей территории и нажмите «Модернизация». Исследование само по себе не обновляет старую технику.', modal: 'army' });
  if (!warsOf(C.id).length) out.push({ title: '🤝 Используйте мирное время', text: 'Пакт защищает от объявления войны на 30 дней. Торговый контракт даёт фиксированную цену на 10 дней.', tab: 'treaties' });
  if (G.campaign.decision && !G.campaign.decision.resolved) out.push({ title: '🏛 Ждёт гражданское решение', text: G.campaign.decision.title, tab: 'decisions' });
  out.push({ title: '🎯 Условия победы', text: `Нужно ${Math.ceil(G.totalVP * G.opts.win)} победных очков. Ваши ${C.vp} ПО входят в общий результат альянса; захваты городов с ★ ценнее пустых территорий.`, modal: 'overview' });
  return out.slice(0, 10);
}
function advisorHTML() {
  return `<p class="note">Советы рассчитываются по текущему состоянию вашей страны. Они не выдают скрытые позиции противника.</p><div class="cx-grid">${adviceItems().map(a => card(esc(a.title), esc(a.text), cxButton('advice', 'Перейти', a.loc !== undefined ? `data-l="${a.loc}"` : a.tab ? `data-tab="${a.tab}"` : `data-modal="${a.modal}"`))).join('')}</div>`;
}
function budgetHTML() {
  const C = G.C[G.player], t = G.campaign.treasury;
  let h = `<p class="note">Прогноз на 7 дней при текущих доходах и содержании. Разовые стройки, торговля, долги и потери территории могут изменить результат.</p><div class="cx-table"><table class="t"><tr><th>Ресурс</th><th>Запас / склад</th><th>Доход/сут.</th><th>Расход/сут.</th><th>Баланс</th><th>Хватит на</th><th>Через 7 дней</th></tr>`;
  for (const r of budgetFor(C.id)) h += `<tr class="${r.days <= 3 ? 'cx-danger' : ''}"><td>${RES_INFO[r.k].i} ${RES_INFO[r.k].n}</td><td>${fmt(r.stock)} / ${fmt(r.cap)}</td><td>+${r.income.toFixed(1)}</td><td>−${r.expense.toFixed(1)}</td><td>${r.net.toFixed(1)}</td><td>${r.days === Infinity ? 'не убывает' : r.days.toFixed(1) + ' сут.'}</td><td>${fmt(Math.min(r.cap, r.forecast))}</td></tr>`;
  h += `</table></div><div class="cx-grid">`;
  h += card('Налоги', `<p>Ставка: <b>${Math.round(C.tax * 100)}%</b>. Повышение увеличивает денежный доход, но снижает лояльность и добычу.</p><label>Ставка <input id="cx-tax" type="number" min="60" max="140" step="5" value="${Math.round(C.tax * 100)}"></label>`, cxButton('tax', 'Применить'));
  h += card('Топливный резерв', `<p>Отложено: <b>${fmt(C.reserveFuel)}</b>. Резерв не расходуется на содержание, пока вы его не выдадите.</p>`, cxButton('reserve', 'Отложить 100', 'data-q="100"') + cxButton('reserve', 'Выдать 100', 'data-q="-100"'));
  h += card('Казначейство', `<div class="cx-fields"><label>Целевой запас, дней <input id="cx-days" type="number" min="1" max="30" value="${t.days}"></label><label>Неприкосновенные деньги <input id="cx-floor" type="number" min="0" value="${t.floor}"></label><label>Бюджет покупок/сут. <input id="cx-budget" type="number" min="0" value="${t.budget}"></label><label>Предел цены к базовой <input id="cx-price" type="number" min="1" max="5" step="0.1" value="${t.maxPrice}"></label></div>`, cxButton('treasury', 'Сохранить лимиты'));
  h += card('Экстренная эмиссия', `<p>Вы получите ${fmt(Math.max(100, C.inc.cash * 3))} денег. Удорожание военной продукции: +8 процентных пунктов. Текущая надбавка: ${(C.inflation * 100).toFixed(1)}%. Она снижается на 0,1 пункта в сутки.</p>`, cxButton('print', 'Выпустить деньги'));
  h += `</div><h3>История запасов и цен</h3>${historyChart('cash')}<div class="row">${RES.map(k => cxButton('chart', RES_INFO[k].i + ' ' + RES_INFO[k].n, `data-k="${k}"`)).join('')}</div>${G.campaign.marketEvent ? `<p class="note">Последнее рыночное событие: ${esc(RES_INFO[G.campaign.marketEvent.res].n)} · день ${Math.floor(G.campaign.marketEvent.hour / 24)}</p>` : ''}`;
  return h;
}
function historyChart(defaultKey) {
  const k = UI.chartRes || defaultKey, rows = G.campaign.history.filter(x => x.player === G.player), max = Math.max(1, ...rows.map(r => r.res[k] || 0)), minH = rows[0]?.hour || 0, span = Math.max(24, (rows.at(-1)?.hour || 0) - minH);
  const points = rows.map(r => `${40 + (r.hour - minH) / span * 650},${150 - (r.res[k] || 0) / max * 120}`).join(' ');
  return `<figure class="cx-chart"><figcaption>${RES_INFO[k].i} ${RES_INFO[k].n} · дневные снимки, максимум 120 дней</figcaption><svg viewBox="0 0 720 185" role="img" aria-label="История запасов ${RES_INFO[k].n}"><path d="M40 20 V150 H700" fill="none" stroke="currentColor" opacity=".4"/><polyline points="${points}" fill="none" stroke="#5cc8e6" stroke-width="3"/><text x="45" y="18">${fmt(max)}</text><text x="40" y="175">День ${Math.floor(minH / 24)}</text><text x="600" y="175">День ${Math.floor((rows.at(-1)?.hour || 0) / 24)}</text></svg>${rows.length < 2 ? '<p class="note">График заполнится после первого игрового дня.</p>' : ''}</figure>`;
}
function forcesHTML() {
  const us = unitsOf(G.player), idle = us.filter(u => ['idle', 'base'].includes(u.st)), cut = us.filter(u => !supplied(u));
  let h = `<div class="row">${cxButton('select-idle', `Без приказа: ${idle.length}`)}${cxButton('select-cut', `Без снабжения: ${cut.length}`)}${cxButton('repair', '↩ Отвести выбранных на ремонт')}${cxButton('hold', '🛡 Удерживать позицию')}</div><p class="note">«Удерживать» и «Ремонт» исключают части из автообороны. Ручной приказ движения снимает удержание. Ремонт идёт на безопасной своей базе; изолированная пехота не восстанавливается.</p>`;
  h += `<h3>Группы войск</h3><div class="row"><input id="cx-group-name" maxlength="40" placeholder="Название группы">${cxButton('group-save', 'Сохранить выделение')}</div><div class="cx-grid">${G.campaign.groups.map((g, i) => card(esc(g.name), `${g.ids.filter(id => G.U.has(id)).length} частей`, cxButton('group-load', 'Выбрать', `data-i="${i}"`) + cxButton('group-delete', 'Удалить', `data-i="${i}"`))).join('')}</div>`;
  h += `<p class="note">Ctrl + 1…9 сохраняет группу, Alt + 1…9 выбирает её. Shift + приказ движения добавляет следующую точку маршрута.</p><h3>Пакетное строительство</h3><p class="note">Заказывает по одному улучшению во всех подходящих своих провинциях, пока хватает ресурсов. Цена и доступность проверяются для каждой стройки.</p><div class="row">${['infra', 'eco', 'depot', 'fort'].map(b => cxButton('build-many', BLD[b].i + ' ' + BLD[b].n, `data-b="${b}"`)).join('')}</div><h3>Шаблон производства</h3><p class="note">Выберите свою провинцию на карте. Шаблон заказывает части по очереди; неподходящие здания и нехватка ресурсов выводятся в отчёте.</p><div class="row">${Object.entries(ARMY_TEMPLATES).map(([k, t]) => cxButton('template', t.n, `data-k="${k}"`)).join('')}</div>`;
  h += `<h3>Войска (${us.length})</h3><div class="cx-table"><table class="t"><tr><th>Часть</th><th>Место</th><th>Состояние</th><th>Прочность</th><th>Опыт</th><th>Усталость</th><th>Снабжение</th><th>Прибытие</th></tr>${us.slice(0, 250).map(u => `<tr data-act="cx-unit" data-id="${u.id}"><td>${unitIcon(u.t, '#fff', 18)} ${UNITS[u.t].n} #${u.id}</td><td>${esc(locName(u.loc))}</td><td>${esc(stName([u]))}${u.hold ? ' · удержание' : ''}${u.repair ? ' · ремонт' : ''}</td><td>${Math.round(u.hp)}%</td><td>${'★'.repeat(rankOfUnit(u)) || 'новобранец'} (${Math.round(u.xp)})</td><td>${Math.round(u.fatigue)}%</td><td>${supplied(u) ? '✓ есть' : '⚠ нет'}</td><td>${u.st === 'move' ? '~' + routeETA(u, u.path) + ' ч' : '—'}</td></tr>`).join('')}</table></div>`;
  return h;
}
function treatiesHTML() {
  const cp = G.campaign, me = G.player, c = G.C[me];
  let h = `<p>Репутация: <b>${Math.round(c.reputation)} / 100</b> · характер лидера: ${personality(c).n}${c.leaveAt ? ` · выход из альянса через ${Math.ceil((c.leaveAt - G.hour) / 24)} сут.` : ''}</p><p class="note">Пакты, гарантии, торговые контракты и заём доступны в окне дипломатии выбранной страны. Эмбарго останавливает двусторонние контракты и подарки, но не закрывает мировой рынок.</p>${cxButton('diplomacy', 'Открыть дипломатию')}<h3>Действующие договоры</h3>`;
  h += cp.pacts.filter(p => p.a === me || p.b === me).map(p => card('🕊 Пакт о ненападении', `${esc(G.C[p.a === me ? p.b : p.a].n)} · ещё ${Math.ceil((p.until - G.hour) / 24)} сут.`, cxButton('break-pact', 'Расторгнуть (−20 репутации)', `data-c="${p.a === me ? p.b : p.a}"`))).join('') || '<p class="note">Пактов пока нет.</p>';
  h += `<h3>Гарантии независимости</h3>${cp.guarantees.filter(g => g.a === me || g.b === me).map(g => `<p>${esc(G.C[g.a].n)} → ${esc(G.C[g.b].n)} · ${Math.ceil((g.until - G.hour) / 24)} сут.</p>`).join('') || '<p class="note">Нет гарантий.</p>'}`;
  h += `<h3>Торговые контракты</h3>${cp.routes.filter(r => r.buyer === me || r.seller === me).map(r => card(`${RES_INFO[r.res].i} ${RES_INFO[r.res].n}`, `${esc(G.C[r.seller].n)} → ${esc(G.C[r.buyer].n)}: ${r.qty}/сут. по ${r.price.toFixed(2)}. Осталось ${r.left} сут.; доставлено ${r.delivered}, пропущено ${r.missed}.`)).join('') || '<p class="note">Контрактов нет.</p>'}`;
  h += `<h3>Долги и репарации</h3>${cp.debts.concat(cp.reparations).filter(d => d.a === me || d.b === me).map(d => `<p>${esc(G.C[d.a].n)} → ${esc(G.C[d.b].n)}: ${d.payment.toFixed(1)} денег × ${d.left} дней${d.arrears ? '; просрочено ' + d.arrears.toFixed(1) : ''}.</p>`).join('') || '<p class="note">Нет обязательств.</p>'}`;
  h += `<h3>Эмбарго</h3>${cp.embargoes.filter(e => e.a === me || e.b === me).map(e => `<p>${esc(G.C[e.a].n)} → ${esc(G.C[e.b].n)}</p>`).join('') || '<p class="note">Нет эмбарго.</p>'}`;
  return h;
}
function extraDiplomacyHTML(c) {
  const me = G.player, war = atWar(me, c.id), pact = pactBetween(me, c.id);
  let h = `<section class="cx-card"><h3>Переговоры и договоры</h3><p>Лидер: ${personality(c).n} · репутация ${Math.round(c.reputation)}/100</p><div class="row">`;
  if (war) {
    const r = aiPeaceEval(c.id, me);
    h += `<p class="note">${r.ok ? 'Противник готов обсуждать мир.' : esc(r.why)}</p>${cxButton('peace', 'Мир без требований', 'data-terms="white"')}${cxButton('peace', 'Мир и возврат ваших земель', 'data-terms="return"')}${cxButton('peace', 'Мир и выплаты на 10 дней', 'data-terms="payments"')}`;
  } else {
    h += pact ? `<span>🕊 Пакт: ${Math.ceil((pact.until - G.hour) / 24)} сут.</span>` : cxButton('pact', 'Пакт на 30 дней');
    h += cxButton('guarantee', 'Гарантировать независимость') + cxButton('embargo', 'Ввести / снять своё эмбарго') + cxButton('loan', 'Заём у союзника: 500');
    h += `</div><p class="note">Заём: 52,5 денег в сутки в течение 10 дней (5% за весь срок). Нужны союз, отношения +30, репутация 40 и свободные деньги у кредитора.</p><div class="row"><label>Импорт из этой страны <select id="cx-route-res">${Object.keys(BASE_PRICE).map(k => `<option value="${k}">${RES_INFO[k].n}</option>`).join('')}</select></label><input id="cx-route-qty" type="number" min="1" max="500" value="20" aria-label="Объём в сутки">${cxButton('route', 'Контракт на 10 дней')}`;
  }
  return h + '</div></section>';
}
function reportsHTML() {
  const reports = G.campaign.reports;
  let h = `<p class="note">Здесь учитываются бои с участием ваших войск. Урон — потерянные проценты прочности, а не число погибших людей. Оценка потерь перед боем не гарантирует исход.</p><div class="cx-grid">`;
  for (const r of reports) {
    const ongoing = G.hour - r.end <= 3;
    h += card(`${ongoing ? '⚔ Идёт бой' : 'Бой завершён'} · ${esc(locName(r.loc))}`, `<p>${dateStr(r.start)} ${timeStr(r.start)} → ${dateStr(r.end)} ${timeStr(r.end)}</p><p>${r.terrain === 'sea' ? 'Море' : TERRAIN[r.terrain]?.n || 'Местность'} · ${esc(r.weather)}</p>${Object.entries(r.sides).map(([c, s]) => `<p><b>${esc(G.C[c].n)}</b>: до ${s.units} частей, получено ${Math.round(s.damage)} урона. Уничтожено: ${Object.entries(s.lost).map(([t, n]) => `${UNITS[t].n} ×${n}`).join(', ') || 'нет'}.</p>`).join('')}`, cxButton('focus', 'Показать место', `data-l="${r.loc}"`));
  }
  h += `</div>${reports.length ? '' : '<p>Отчёты появятся после первого боя.</p>'}<h3>Все потери ваших частей</h3><p>${Object.entries(G.C[G.player].lossTypes).map(([t, n]) => `${UNITS[t]?.n || esc(t)} ×${n}`).join(', ') || 'Потерь нет'}</p>`;
  return h;
}
function decisionsHTML() {
  const d = G.campaign.decision;
  return `<div class="cx-grid">${card('Программа гражданской помощи', '100 денег и 25 еды: на 5 дней повышается целевая лояльность ваших провинций на 12 пунктов. Восстановление постепенное.', cxButton('aid', 'Открыть программу'))}${d && !d.resolved ? card(esc(d.title), esc(d.text), cxButton('decision', 'Помочь: 150 денег, 50 еды', 'data-choice="aid"') + cxButton('decision', 'Отложить финансирование', 'data-choice="wait"')) : card('Гражданские события', 'Новый запрос появляется каждые 10 игровых дней. Решение влияет на ресурсы, лояльность и репутацию.')}</div>`;
}
function journalHTML() {
  const rows = G.news.filter(n => n.c.includes(G.player) || n.f === 'g').slice().reverse();
  return `<p class="note">Хронология текущей партии; это журнал событий, а не воспроизведение состояния мира. Экспорт включает историю последних 120 игровых дней.</p>${cxButton('export-report', 'Скачать отчёт партии')}<ol class="cx-journal">${rows.slice(0, 100).map(n => `<li><time>${dateStr(n.h)} ${timeStr(n.h)}</time> ${esc(n.x)} ${n.l >= 0 ? cxButton('focus', 'На карте', `data-l="${n.l}"`) : ''}</li>`).join('')}</ol>`;
}
function achievementsHTML() {
  return `<p class="note">Достижения хранятся в сохранении этой партии. Глобальная таблица рекордов не подключена.</p><div class="cx-grid">${ACHIEVEMENTS.map(a => card(`${G.campaign.achievements.includes(a.id) ? '🏅' : '▫'} ${a.n}`, a.d)).join('')}</div><h3>Личные рекорды в этом браузере</h3>${localRecordsHTML()}`;
}
function localRecordsHTML() {
  let rows = []; try { rows = JSON.parse(localStorage.getItem('conww3_records') || '[]'); } catch (_) { }
  if (!Array.isArray(rows)) rows = [];
  return rows.length ? `<ol>${rows.slice(0, 10).map(r => `<li>${esc(r.country)} · ${fmt(r.score)} очков · ${r.win ? 'победа' : 'партия'} · ${Math.floor(r.hour / 24)} дней</li>`).join('')}</ol>` : '<p class="note">Результат записывается при завершении партии.</p>';
}
const GUIDE = [
  ['ПО', 'Победные очки отмечены ★ у городов. Для победы суммируются очки членов вашего альянса.'],
  ['Поколение', 'Исследование открывает новое поколение продукции. Старые части нужно модернизировать отдельно на своей территории.'],
  ['Мораль', 'Мораль влияет на наносимый урон. Нехватка еды и припасов, бой и изоляция снижают её.'],
  ['Снабжение', 'Часть снабжается через непрерывную свою или союзную территорию от вашей столицы, склада или незаблокированного порта. На соседнюю вражескую провинцию снабжение ещё доходит; глубокий отрыв опасен.'],
  ['Укрепление', 'Наземные части в ожидании на своей территории окапываются до 24 часов и получают до +2 брони. Перемещение сбрасывает подготовку.'],
  ['Опыт', 'Каждый час участия в бою даёт опыт. Каждые 25 очков — звание и +3,5% атаки; максимум пять званий.'],
  ['Погода', 'Погода меняется по регионам каждые 48 часов. Дождь, снег и шторм замедляют движение, непогода ослабляет авиацию.'],
  ['Ночь', 'Ночью обзор мобильных войск уменьшается на один шаг графа. Радары и территории союзников продолжают давать обзор.'],
  ['Лояльность', 'Высокие налоги, повреждения, радиация и оккупация снижают лояльность. Низкая лояльность уменьшает производство; в оставленной без гарнизона занятой провинции возможно восстание.'],
  ['Ремонт', 'Пехота восстанавливается вне боя на своей территории при наличии припасов и снабжения. Кораблям нужен свой порт, авиации — дружественный аэродром.'],
  ['Пакт', 'Пакт о ненападении запрещает объявлять войну другой стороне. Расторжение ухудшает отношения и репутацию. Военные обязательства союзов всё ещё могут вовлечь страну в войну.'],
  ['Гарантия', 'Если на страну с вашей гарантией нападут, вы вступите в войну против нападающего. Срок гарантии — 30 дней.'],
  ['Эмбарго', 'Останавливает двусторонние поставки и подарки. Торговля на мировом рынке остаётся возможной.'],
  ['Мир', 'ИИ оценивает длительность войны, потери территорий и соотношение сил. Дополнительные требования принимаются только при вашем преимуществе по захватам.'],
  ['Режимы боя', 'Наступление: +12% атаки. Оборона: +1 брони и −10% атаки. Засада: +18% атаки после 6 часов подготовки в лесу, джунглях или горах.'],
  ['Очередь', 'Производство идёт сверху вниз. Можно менять приоритет заказов без потери уже выполненной работы.'],
  ['Сохранения', 'Файлы версии 1 поддерживаются; новые имеют версию 2. Перед импортом проверяются карта, владельцы, ресурсы, части и договоры. Сохранения чужой или более новой схемы отклоняются.']
];
function guideHTML() {
  const q = (UI.guideQuery || '').toLocaleLowerCase('ru');
  const a = UI.compareA && UNITS[UI.compareA] ? UI.compareA : 'inf', b = UI.compareB && UNITS[UI.compareB] ? UI.compareB : 'tank';
  const select = (id, value) => `<select id="${id}" data-cx-compare="${id}">${UNIT_ORDER.map(t => `<option value="${t}" ${t === value ? 'selected' : ''}>${UNITS[t].n}</option>`).join('')}</select>`;
  return `<input id="cx-guide-search" type="search" placeholder="Поиск по справочнику" value="${esc(UI.guideQuery || '')}" oninput="UI.guideQuery=this.value;renderGuideResults()"><div id="cx-guide-results">${guideResults(q)}</div><h3>Сравнение частей первого поколения</h3><div class="row">${select('cx-compare-a', a)}${select('cx-compare-b', b)}</div><div class="cx-table"><table class="t"><tr><th>Параметр</th><th>${UNITS[a].n}</th><th>${UNITS[b].n}</th></tr>${[['Скорость', 'spd'], ['Броня', 'arm'], ['Обзор, шагов', 'vis'], ['Срок производства, ч', 'time'], ['Дальность, единиц карты', 'rng']].map(([n, k]) => `<tr><td>${n}</td><td>${UNITS[a][k] || '—'}</td><td>${UNITS[b][k] || '—'}</td></tr>`).join('')}${[['s', 'По пехоте'], ['h', 'По броне'], ['a', 'По авиации'], ['n', 'По флоту']].map(([k, n]) => `<tr><td>${n}</td><td>${UNITS[a].a[k]}</td><td>${UNITS[b].a[k]}</td></tr>`).join('')}<tr><td>Цена без модификаторов</td><td>${costHTMLplain(UNITS[a].cost)}</td><td>${costHTMLplain(UNITS[b].cost)}</td></tr></table></div>`;
}
function guideResults(q) { return GUIDE.filter(([n, d]) => (n + ' ' + d).toLocaleLowerCase('ru').includes(q)).map(([n, d]) => `<details class="cx-definition" ${q ? 'open' : ''}><summary>${esc(n)}</summary><p>${esc(d)}</p></details>`).join('') || '<p>Ничего не найдено.</p>'; }
function renderGuideResults() { const el = $('cx-guide-results'); if (el) el.innerHTML = guideResults((UI.guideQuery || '').toLocaleLowerCase('ru')); }
function preferencesHTML() {
  const checks = [['simple', 'Простой интерфейс'], ['contrast', 'Контрастная палитра и контуры'], ['reduced', 'Уменьшить анимацию'], ['lowPower', 'Экономить ресурсы устройства'], ['routes', 'Все мои маршруты'], ['fronts', 'Подсветка фронтов'], ['ranges', 'Радиусы выбранной авиации и ракет'], ['weather', 'Значки погоды'], ['waves', 'Волны на море'], ['clouds', 'Облака в непогоду'], ['roads', 'Линии инфраструктуры'], ['lights', 'Огни городов ночью'], ['effects', 'Дым и последствия боёв'], ['music', 'Тихая процедурная музыка']];
  return `<div class="cx-fields"><label>Оформление <select data-cx-pref="theme">${[['dark', 'Тёмное'], ['light', 'Светлое'], ['military', 'Военное']].map(([k, n]) => `<option value="${k}" ${PREF.theme === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label><label>Размер текста <input type="number" data-cx-pref="font" min="12" max="20" value="${PREF.font}"></label><label>Громкость <input type="range" data-cx-pref="volume" min="0" max="1" step="0.05" value="${PREF.volume}"></label>${checks.map(([k, n]) => `<label><input type="checkbox" data-cx-pref="${k}" ${PREF[k] ? 'checked' : ''}> ${n}</label>`).join('')}</div><p class="note">Экономичный режим ограничивает отрисовку 30 кадрами/с и плотность пикселей. Настройки сохраняются в этом браузере. Музыка включается после первого нажатия и не скачивает файлы.</p><h3>Горячие клавиши</h3><div class="cx-fields">${Object.entries(KEY_NAMES).map(([k, n]) => `<label>${n}<input type="text" maxlength="1" data-cx-key="${k}" value="${PREF.keys[k] === 'Space' ? ' ' : PREF.keys[k] === 'Slash' ? '/' : PREF.keys[k].replace('Key', '')}" aria-label="${n}"></label>`).join('')}</div>${cxButton('reset-keys', 'Сбросить клавиши')}<p class="note">Клавиши 1–5: скорость; стрелки/WASD: карта; +/−: масштаб; Esc: закрыть. Они зарезервированы. Используется физическая клавиша, поэтому русская раскладка поддерживается.</p><h3>Перенос сохранений</h3><div class="row">${G ? cxButton('export', '💾 Скачать сохранение') : ''}${cxButton('import', '📂 Открыть файл сохранения')}</div><p class="note">Облачная синхронизация не подключена. Храните скачанный файл для переноса между устройствами.</p>`;
}
const CHANGELOG = [
  'Советник по текущей ситуации, поиск стран, городов и своих частей, справочник и сравнение техники.',
  'Бюджет на 7 дней, предупреждения о запасах на исходе, графики за 120 дней и настройки автоматических закупок.',
  'Налоги, лояльность, рост населения, помощь населению, топливный резерв и экстренная эмиссия.',
  'Снабжение от столицы, складов и портов; морская блокада; опыт, усталость, окопы и боевые режимы.',
  'Группы, точки маршрута, удержание, отвод на ремонт, шаблоны производства и изменение приоритетов очередей.',
  'Пакты, гарантии, эмбарго, торговые контракты, заём у союзника, условия мира и задержка выхода из альянса.',
  'Характеры ИИ, более осторожные наступления, резерв у столицы и восстановление повреждённых частей.',
  'Песочница, наблюдатель, режим реализма, воспроизводимый seed и раздельная настройка агрессии ИИ.',
  'Отчёты о боях, хронология, гражданские решения, достижения и личные рекорды.',
  'Настройки текста, тем, контраста, анимации, звука, клавиш и производительности; экспорт/импорт сохранений версии 2.'
];
function commandHTML(tab) {
  if (!G) return preferencesHTML();
  const renderers = { advisor: advisorHTML, budget: budgetHTML, forces: forcesHTML, treaties: treatiesHTML, reports: reportsHTML, decisions: decisionsHTML, history: journalHTML, achievements: achievementsHTML, guide: guideHTML, settings: preferencesHTML, changes: () => `<h3>Версия ${GAME_VERSION}</h3><ul>${CHANGELOG.map(t => `<li>${t}</li>`).join('')}</ul><p class="note">Онлайн-мультиплеер, облачные сохранения и общая таблица рекордов требуют сервера и здесь пока не доступны.</p>` };
  return (renderers[tab] || advisorHTML)();
}

function searchHTML() {
  return `<input id="cx-search" type="search" placeholder="Страна, город, часть или метка…" aria-label="Поиск на карте" value="${esc(UI.mapSearch || '')}" oninput="UI.mapSearch=this.value;renderMapSearch()"><div id="cx-search-results">${mapSearchResults()}</div>`;
}
function mapSearchResults() {
  const q = (UI.mapSearch || '').trim().toLocaleLowerCase('ru');
  const results = [];
  for (const c of G.C) if (c.alive && (c.n + ' ' + c.key).toLocaleLowerCase('ru').includes(q)) results.push({ name: '🏳 ' + c.n, info: c.provs.length + ' провинций', loc: c.cap, country: c.id });
  for (const p of PROV) if ((p.name || '').toLocaleLowerCase('ru').includes(q)) results.push({ name: '📍 ' + p.name, info: G.C[G.pv[p.id].o].n, loc: p.id });
  for (const u of unitsOf(G.player)) if ((UNITS[u.t].n + ' #' + u.id).toLocaleLowerCase('ru').includes(q)) results.push({ name: UNITS[u.t].n + ' #' + u.id, info: locName(u.loc), loc: u.loc, unit: u.id });
  for (const m of G.campaign.markers) if (m.name.toLocaleLowerCase('ru').includes(q)) results.push({ name: '⚑ ' + m.name, info: locName(m.loc), loc: m.loc });
  return `<p class="note">Найдено ${results.length}; показаны первые 40. Противники под туманом войны не перечисляются.</p><div class="cx-search-list">${results.slice(0, 40).map(r => `<button class="btn" data-act="cx-search-result" data-l="${r.loc}" ${r.unit ? `data-id="${r.unit}"` : ''} ${r.country !== undefined ? `data-c="${r.country}"` : ''}><b>${esc(r.name)}</b><small>${esc(r.info)}</small></button>`).join('')}</div>`;
}
function renderMapSearch() { const el = $('cx-search-results'); if (el) el.innerHTML = mapSearchResults(); }
function downloadBlob(name, text, type) {
  const blob = new Blob([text], { type: type || 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function importSaveFile() {
  const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,.conww3,application/json';
  input.onchange = async () => {
    const f = input.files[0]; if (!f) return;
    if (f.size > 16 * 1024 * 1024) { toast('Файл слишком большой: максимум 16 МБ', 'war'); return; }
    const previous = G ? saveGame() : null;
    try { loadGame(await f.text()); afterLoad(); toast('Сохранение импортировано. Игра на паузе.', 'good'); }
    catch (e) { if (previous) { loadGame(previous); afterLoad(); } toast(e.message || 'Не удалось импортировать сохранение', 'war'); if (!G) { const n=document.createElement('p');n.className='cx-danger';n.textContent=e.message || 'Ошибка импорта';$('start').querySelector('.str')?.appendChild(n); } }
  };
  input.click();
}
function campaignKey(e) {
  if (e.code === 'Escape') {
    if (document.body.classList.contains('photo-mode')) { document.body.classList.remove('photo-mode'); return; }
    if (UI.modal) closeModal(); else if (UI.mode) setMode(null); else if (G) clearSel(); return;
  }
  if (!G || e.target?.isContentEditable) return;
  const digit = /^Digit[1-9]$/.test(e.code) ? +e.code.slice(5) : 0;
  if (digit && (e.ctrlKey || e.altKey)) {
    e.preventDefault();
    if (e.ctrlKey) saveGroup('Группа ' + digit, digit - 1);
    else recallGroup(digit - 1);
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (digit >= 1 && digit <= 5) { setSpeed(digit); return; }
  const action = Object.keys(PREF.keys).find(k => PREF.keys[k] === e.code);
  if (!action || e.repeat && action === 'pause') return;
  e.preventDefault();
  if (action === 'pause') togglePause();
  else if (action === 'home') focusLoc(G.C[G.player].cap, 3);
  else if (action === 'overview') openModal('overview');
  else if (action === 'search') openModal('search');
  else if (action === 'advisor') openCommand('advisor');
  else if (SEL.units.size) setMode(action);
}
function saveGroup(name, index) {
  const ids = [...SEL.units].filter(id => G.U.get(id)?.o === G.player);
  if (!ids.length) { toast('Сначала выберите свои части', 'war'); return; }
  const groups = G.campaign.groups;
  if (index === undefined) index = groups.length;
  if (index >= 9) { toast('Максимум 9 групп', 'war'); return; }
  while (groups.length <= index) groups.push({ name: 'Пустая группа', ids: [] });
  groups[index] = { name: (name || 'Группа ' + (index + 1)).slice(0, 40), ids };
  toast('Группа сохранена', 'good');
}
function recallGroup(index) {
  const group = G.campaign.groups[index]; if (!group) return;
  selectUnits(group.ids, false); const first = [...SEL.units][0]; if (first) focusLoc(G.U.get(first).loc); closeModal();
}
function campaignAction(a, d, el, e) {
  const result = error => { if (error) toast(error, 'war'); else { toast('Готово', 'good'); checkAchievements(); } renderModal(true); };
  if (a === 'cx-import') { importSaveFile(); return true; }
  if (a === 'cx-reset-keys') { PREF.keys = Object.assign({}, DEFAULT_KEYS); applyPreferences(); renderModal(true); return true; }
  if (a === 'cx-settings') { openCommand('settings'); return true; }
  if (a === 'cx-tab') { openCommand(d.tab); return true; }
  if (!G) return false;
  if (G.opts.observer && ['tax', 'print', 'reserve', 'treasury', 'hold', 'repair', 'stance', 'template', 'queue', 'build-many', 'pact', 'guarantee', 'embargo', 'loan', 'route', 'peace', 'break-pact', 'aid', 'decision', 'objective'].some(k => a === 'cx-' + k)) { toast('В режиме наблюдателя приказы отдаёт ИИ', 'war'); return true; }
  switch (a) {
    case 'cx-advisor': openCommand('advisor'); break;
    case 'cx-search': openModal('search'); setTimeout(() => $('cx-search')?.focus(), 0); break;
    case 'cx-advice': if (d.l !== undefined) { focusLoc(+d.l); selectProv(+d.l); closeModal(); } else if (d.tab) openCommand(d.tab); else openModal(d.modal); break;
    case 'cx-diplomacy': openModal('diplomacy'); break;
    case 'cx-focus': closeModal(); focusLoc(+d.l); if (+d.l < P) selectProv(+d.l); break;
    case 'cx-search-result':
      if (G.opts.observer && d.c !== undefined) { G.player = +d.c; updateVis(true); buildHUD(); }
      closeModal(); focusLoc(+d.l); if (+d.l < P) selectProv(+d.l); if (d.id) selectUnits([+d.id], false); break;
    case 'cx-tax': result(taxRate(G.player, +$('cx-tax').value / 100)); break;
    case 'cx-print': result(emergencyMoney(G.player)); break;
    case 'cx-reserve': result(reserveTransfer(G.player, +d.q) ? '' : 'Не хватает топлива в выбранном источнике'); break;
    case 'cx-treasury': {
      const t = { days: +$('cx-days').value, floor: +$('cx-floor').value, budget: +$('cx-budget').value, maxPrice: +$('cx-price').value };
      if (Object.values(t).some(v => !Number.isFinite(v)) || t.days < 1 || t.days > 30 || t.floor < 0 || t.budget < 0 || t.maxPrice < 1 || t.maxPrice > 5) { result('Проверьте значения лимитов'); break; }
      G.campaign.treasury = t; result(''); break;
    }
    case 'cx-chart': UI.chartRes = d.k; renderModal(true); break;
    case 'cx-hold': stopUnits([...SEL.units]); for (const id of SEL.units) { const u = G.U.get(id); if (u) u.hold = true; } renderUnitPanel(); toast('Позиция удерживается', 'good'); break;
    case 'cx-repair': toast(`Отведено на ремонт: ${sendToRepair([...SEL.units])}`, 'good'); break;
    case 'cx-stance': toast(`Режим изменён: ${setStance([...SEL.units], d.s)} частей`, 'good'); UI._up = ''; renderUnitPanel(); break;
    case 'cx-select-idle': selectUnits(unitsOf(G.player).filter(u => ['idle', 'base'].includes(u.st)).map(u => u.id), false); closeModal(); break;
    case 'cx-select-cut': selectUnits(unitsOf(G.player).filter(u => !supplied(u)).map(u => u.id), false); closeModal(); break;
    case 'cx-unit': selectUnits([+d.id], false); closeModal(); focusLoc(G.U.get(+d.id).loc); break;
    case 'cx-group-save': saveGroup($('cx-group-name').value); renderModal(true); break;
    case 'cx-group-load': recallGroup(+d.i); break;
    case 'cx-group-delete': G.campaign.groups.splice(+d.i, 1); renderModal(true); break;
    case 'cx-template': { const r = queueTemplate(SEL.prov, d.k); toast(`Заказано ${r.n}. ${[...new Set(r.errors)].join('; ')}`, r.n ? 'good' : 'war'); renderProvPanel(true); break; }
    case 'cx-queue': reorderQueue(+d.p, +d.i, +d.dir); renderProvPanel(true); break;
    case 'cx-build-many': {
      let n = 0; for (const p of G.C[G.player].provs) if (!startBuild(p, d.b)) n++;
      toast(`Начато строек: ${n}. Неподходящие провинции пропущены.`, n ? 'good' : 'war'); renderModal(true); break;
    }
    case 'cx-pact': result(signPact(G.player, UI.dc)); break;
    case 'cx-guarantee': result(guaranteeCountry(G.player, UI.dc)); break;
    case 'cx-embargo': toggleEmbargo(G.player, UI.dc); result(''); break;
    case 'cx-loan': result(requestLoan(G.player, UI.dc)); break;
    case 'cx-route': result(createTradeRoute(G.player, UI.dc, $('cx-route-res').value, +$('cx-route-qty').value)); break;
    case 'cx-peace': result(settlePeace(G.player, UI.dc, d.terms)); break;
    case 'cx-break-pact': if (UI.breakConfirm === +d.c) { breakPact(G.player, +d.c); UI.breakConfirm = -1; renderModal(true); } else { UI.breakConfirm = +d.c; toast('Нажмите ещё раз: −20 репутации, −25 отношений', 'war'); } break;
    case 'cx-aid': result(civicAid(G.player)); break;
    case 'cx-decision': result(resolveDecision(d.choice)); break;
    case 'cx-marker': {
      const loc = SEL.prov >= 0 ? SEL.prov : SEL.sea >= 0 ? P + SEL.sea : -1;
      if (loc < 0) { toast('Выберите место на карте', 'war'); break; }
      const existing = G.campaign.markers.findIndex(m => m.loc === loc);
      if (existing >= 0) G.campaign.markers.splice(existing, 1);
      else if (G.campaign.markers.length < 100) G.campaign.markers.push({ loc, name: locName(loc) });
      MV.dirty = true; renderProvPanel(true); break;
    }
    case 'cx-objective': if (SEL.prov >= 0 && atWar(G.player, G.pv[SEL.prov].o)) { G.campaign.objectives = G.campaign.objectives.filter(o => o.owner !== G.player); G.campaign.objectives.push({ owner: G.player, loc: SEL.prov, until: G.hour + 240 }); toast('Цель передана союзникам на 10 дней', 'good'); } else toast('Нужна провинция противника в войне', 'war'); break;
    case 'cx-photo': closeModal(); document.body.classList.toggle('photo-mode'); toast('Режим снимка. Esc — вернуть интерфейс.'); break;
    case 'cx-export': downloadBlob(`conww3-${G.C[G.player].key}-day${Math.floor(G.hour / 24)}.json`, saveGame()); break;
    case 'cx-export-report': downloadBlob('conww3-campaign-report.json', JSON.stringify({ version: GAME_VERSION, country: G.C[G.player].n, hour: G.hour, score: scoreOf(G.player), economy: G.campaign.history, battles: G.campaign.reports, events: G.news }, null, 2)); break;
    default: return false;
  }
  return true;
}
document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.cxPref) {
    const k = el.dataset.cxPref; if (!(k in PREF_DEFAULTS) || k === 'keys') return;
    PREF[k] = el.type === 'checkbox' ? el.checked : ['font', 'volume'].includes(k) ? +el.value : el.value; applyPreferences();
  }
  if (el.dataset.cxKey) {
    const value = el.value.toUpperCase(), action = el.dataset.cxKey;
    const code = value === ' ' ? 'Space' : value === '/' ? 'Slash' : /^[A-Z]$/.test(value) ? 'Key' + value : null;
    if (!code || ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(code) || Object.entries(PREF.keys).some(([k, v]) => k !== action && v === code)) { toast('Выберите свободную латинскую букву, / или пробел. WASD зарезервированы.', 'war'); el.value = PREF.keys[action].replace('Key', ''); return; }
    PREF.keys[action] = code; applyPreferences();
  }
  if (el.dataset.cxCompare) { if (el.id === 'cx-compare-a') UI.compareA = el.value; else UI.compareB = el.value; renderModal(true); }
});
function campaignRefresh() {
  if (!G?.campaign) return;
  if (G.opts.observer) { G.fogOff = true; UI.autoPause = false; }
  const C = G.C[G.player], chips = document.querySelectorAll('#tb-res .rchip');
  for (const [i, k] of [...RES, 'man'].entries()) {
    const net = (C.inc[k] || 0) - (C.use[k] || 0), days = net < 0 ? C.res[k] / -net : Infinity;
    if (chips[i]) { chips[i].classList.toggle('running-out', days <= 3); if (days < Infinity) chips[i].title = `Запаса хватит примерно на ${days.toFixed(1)} сут.`; }
  }
  if (G.over && !G.opts.observer && !G.campaign.recorded) {
    G.campaign.recorded = true;
    try { let rows = JSON.parse(localStorage.getItem('conww3_records') || '[]'); if (!Array.isArray(rows)) rows = []; rows.push({ country: C.n, score: scoreOf(G.player), hour: G.hour, win: G.over.win }); rows.sort((a, b) => b.score - a.score); localStorage.setItem('conww3_records', JSON.stringify(rows.slice(0, 10))); } catch (_) { }
    checkAchievements();
  }
}
function provinceExtras(p) {
  const pv = G.pv[p], weather = weatherAt(p), mine = pv.o === G.player;
  return `<section class="sec cx-province-extra"><div class="row"><span>${weather.i} ${weather.n}</span><span>♥ Лояльность: ${Math.round(pv.loyalty)}%</span>${mine && pv.b.naval > 0 && portBlockaded(G.player, p) ? '<b>⚠ Морская блокада</b>' : ''}</div><div class="row">${cxButton('marker', '⚑ Метка')}${atWar(G.player, pv.o) ? cxButton('objective', '🎯 Цель для союзников') : ''}</div>${mine ? `<p class="note">Доход и добыча зависят от лояльности, повреждений, оккупации и радиации.</p>` : ''}</section>`;
}
function unitExtras(us) {
  const moving = us.filter(u => u.st === 'move');
  return `<div class="sec cx-unit-extra"><div class="note">Без снабжения: ${us.filter(u => !supplied(u)).length} · усталость ${Math.round(us.reduce((n, u) => n + (u.fatigue || 0), 0) / us.length)}%${moving.length ? ' · прибытие ~' + Math.max(...moving.map(u => routeETA(u, u.path))) + ' ч' : ''}</div><div class="row">${Object.entries(STANCES).map(([k, n]) => cxButton('stance', n, `data-s="${k}"`)).join('')}${cxButton('hold', 'Удерживать')}${cxButton('repair', 'На ремонт')}</div></div>`;
}
/* Draw only information available to the player, and cap decorative work on phones. */
function drawCampaignOverlay() {
  if (!G?.campaign) return;
  const ctx = MV.ctx, z = MV.cam.z;
  ctx.save(); ctx.setTransform(MV.dpr, 0, 0, MV.dpr, 0, 0); ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
  const visible = p => G.fogOff || G.vis[p];
  const on = (x, y) => x > 0 && x < MV.W && y > 0 && y < MV.H;
  if (PREF.ranges && SEL.units.size) {
    let n = 0;
    for (const id of SEL.units) { const u = G.U.get(id); if (!u || !UNITS[u.t].rng || ++n > 12) continue; const pos = UNITS[u.t].dom === 'air' ? basePos(u) : unitPos(u); if (!pos) continue; const [x, y] = w2s(...pos); ctx.strokeStyle = UNITS[u.t].nuke ? '#ff9a80' : '#67d6e8'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.arc(x, y, UNITS[u.t].rng * z, 0, Math.PI * 2); ctx.stroke(); }
    ctx.setLineDash([]);
  }
  for (const m of G.campaign.markers) { const [x, y] = w2s(lx(m.loc), ly(m.loc)); if (on(x, y)) { ctx.fillStyle = '#ffe27a'; ctx.fillText('⚑', x, y - 22); } }
  if (PREF.waves && !PREF.lowPower) {
    ctx.strokeStyle = 'rgba(150,205,240,.22)'; ctx.lineWidth = 1;
    for (const sea of SEA) {
      const [x,y]=w2s(sea.x,sea.y); if(!on(x,y))continue;
      const shift=PREF.reduced?0:Math.sin(MV.now/1200+sea.id)*3;
      ctx.beginPath();ctx.moveTo(x-12,y+shift);ctx.quadraticCurveTo(x-6,y-5+shift,x,y+shift);ctx.quadraticCurveTo(x+6,y+5+shift,x+12,y+shift);ctx.stroke();
    }
  }
  if (PREF.roads && z > 2) {
    ctx.strokeStyle='rgba(232,221,178,.28)';ctx.lineWidth=1;ctx.setLineDash([3,3]);
    for(const p of G.C[G.player].provs)if(G.pv[p].b.infra>=2)for(const n of ADJL[p])if(n>p && G.pv[n].o===G.player && G.pv[n].b.infra>=2){const[x,y]=w2s(lx(p),ly(p)),[a,b]=w2s(lx(n),ly(n));ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(a,b);ctx.stroke();}
    ctx.setLineDash([]);
  }
  if (PREF.fronts || MV.mode === 'supply') {
    ctx.strokeStyle = '#ffb14e'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
    for (const p of G.C[G.player].provs) for (const n of ADJL[p]) if (atWar(G.player, G.pv[n].o) && visible(n)) { const [x, y] = w2s(lx(p), ly(p)), [a, b] = w2s(lx(n), ly(n)); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(a, b); ctx.stroke(); }
    ctx.setLineDash([]);
  }
  const resource = MV.mode.startsWith('res:') ? MV.mode.slice(4) : null;
  let decorated = 0;
  if (z > 1.8) for (const p of PROV) {
    if (!visible(p.id)) continue;
    const [x, y] = w2s(p.x, p.y); if (!on(x, y)) continue;
    const pv = G.pv[p.id];
    if(PREF.clouds && !PREF.lowPower && weatherAt(p.id).move < 1 && p.id % 5 === 0){const drift=PREF.reduced?0:Math.sin(MV.now/5000+p.id)*8;ctx.fillStyle='rgba(190,210,225,.22)';ctx.beginPath();ctx.ellipse(x+drift,y-9,18,7,0,0,7);ctx.fill();}
    if (PREF.lights && MV.daynight !== false && isNight(p.id) && p.city > 100000 && pv.dmg < 60) { ctx.fillStyle = '#ffe6a2'; ctx.fillRect(x - 1, y - 1, 3, 3); }
    if (PREF.effects && !PREF.lowPower && pv.dmg > 35) { const rise = PREF.reduced ? 4 : (MV.now / 180 + p.id) % 12; ctx.fillStyle = 'rgba(220,110,50,.45)'; ctx.beginPath(); ctx.arc(x, y - rise, 3 + pv.dmg / 25, 0, 7); ctx.fill(); }
    if (resource) { const idx = { food: 0, comp: 1, fuel: 2, rare: 3, supp: 4, elec: 5 }[resource]; if (p.res[idx] >= 3) ctx.fillText(RES_INFO[resource].i, x, y + 14); }
    if (PREF.weather && !PREF.lowPower && p.id % 12 === 0 && decorated++ < 30) ctx.fillText(weatherAt(p.id).i, x + 18, y - 15);
  }
  if (PREF.effects && !PREF.lowPower) {
    let n = 0;
    for (const u of G.U.values()) {
      if (u.o !== G.player || !['out', 'back', 'move'].includes(u.st) || ++n > 70) continue;
      const [x, y] = w2s(...unitPos(u)); if (!on(x, y)) continue;
      ctx.strokeStyle = UNITS[u.t].dom === 'air' ? 'rgba(230,245,255,.5)' : 'rgba(220,190,120,.4)'; ctx.lineWidth = 1; const leg=u.leg || u.fl;const dx=leg ? leg.tx-leg.fx : 1, dy=leg ? leg.ty-leg.fy : 0, length=Math.hypot(dx,dy)||1;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-dx/length*12,y-dy/length*12);ctx.stroke();
    }
  }
  ctx.restore();
}
window.addEventListener('load', applyPreferences);
document.addEventListener('keydown', e => {
  if (!UI.modal) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeModal(); return; }
  if (e.key !== 'Tab') return;
  const focusable = [...$('modal').querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary')].filter(el => el.getClientRects().length);
  if (!focusable.length) return;
  const first = focusable[0], last = focusable.at(-1), active = document.activeElement;
  if (!focusable.includes(active) || e.shiftKey && active === first) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
  else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
}, true);
