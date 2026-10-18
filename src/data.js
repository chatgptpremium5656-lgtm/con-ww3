'use strict';
/* ===== Static game data: resources, buildings, units, techs ===== */
const RES = ['cash', 'food', 'supp', 'fuel', 'comp', 'elec', 'rare'];
const RES_INFO = {
  cash: { n: 'Деньги', i: '💵', c: '#6fd36f' },
  food: { n: 'Продовольствие', i: '🌾', c: '#e6c35c' },
  supp: { n: 'Припасы', i: '📦', c: '#c9a46b' },
  fuel: { n: 'Топливо', i: '⛽', c: '#d9763c' },
  comp: { n: 'Компоненты', i: '🔩', c: '#9fb0c0' },
  elec: { n: 'Электроника', i: '💻', c: '#5cc8e6' },
  rare: { n: 'Редкие материалы', i: '💎', c: '#c77de0' },
  man: { n: 'Живая сила', i: '👥', c: '#e0e0e0' }
};
const RES_SHORT = { c: 'cash', f: 'food', s: 'supp', o: 'fuel', m: 'comp', e: 'elec', r: 'rare', p: 'man' };

const TERRAIN = {
  plains: { n: 'Равнины', def: 1.0, mv: 1.0, col: [120, 150, 90] },
  forest: { n: 'Леса', def: 1.2, mv: 1.35, col: [70, 120, 70] },
  mountain: { n: 'Горы', def: 1.55, mv: 1.9, col: [140, 125, 110] },
  desert: { n: 'Пустыня', def: 0.95, mv: 1.25, col: [200, 180, 120] },
  jungle: { n: 'Джунгли', def: 1.3, mv: 1.6, col: [50, 110, 60] },
  arctic: { n: 'Тундра', def: 1.0, mv: 1.5, col: [190, 200, 210] }
};

/* Buildings: max level 5 */
const BLD = {
  infra: { n: 'Инфраструктура', i: '🛣', d: 'Ускоряет движение войск, повышает налоги и объём производства провинции.', cost: { c: 60, m: 10 }, time: 36, max: 5 },
  barracks: { n: 'Казармы', i: '🏕', d: 'Подготовка пехоты, спецназа и мотопехоты. Выше уровень — быстрее обучение.', cost: { c: 50, m: 8 }, time: 30, max: 5 },
  factory: { n: 'Военный завод', i: '🏭', d: 'Производство бронетехники, артиллерии и ПВО.', cost: { c: 90, m: 25 }, time: 48, max: 5 },
  airfield: { n: 'Аэродром', i: '🛩', d: 'Базирование и производство авиации. Уровень — вместимость и скорость.', cost: { c: 110, m: 25, e: 4 }, time: 48, max: 5 },
  naval: { n: 'Военно-морская база', i: '⚓', d: 'Строительство и стоянка кораблей. Только прибрежные провинции.', cost: { c: 120, m: 30 }, time: 54, max: 5 },
  aa: { n: 'ПВО / ПРО', i: '📡', d: 'Стационарная зенитная оборона и перехват ракет.', cost: { c: 80, m: 14, e: 6 }, time: 36, max: 5 },
  fort: { n: 'Укрепления', i: '🧱', d: 'Бонус к обороне наземных войск в провинции.', cost: { c: 60, m: 25 }, time: 36, max: 5 },
  radar: { n: 'Радар', i: '📶', d: 'Расширяет радиус обзора вокруг провинции.', cost: { c: 70, e: 8 }, time: 30, max: 3 },
  eco: { n: 'Ресурсный комплекс', i: '⛏', d: '+18% к добыче ресурсов провинции за уровень.', cost: { c: 100, m: 20 }, time: 48, max: 5 },
  silo: { n: 'Ракетная шахта', i: '🚀', d: 'Хранение и запуск ракет большой дальности (ядерная программа).', cost: { c: 400, m: 60, e: 30, r: 10 }, time: 96, max: 1 }
};
const BLD_ORDER = ['infra', 'eco', 'barracks', 'factory', 'airfield', 'naval', 'aa', 'fort', 'radar', 'silo'];

/* Units.
   dom: land/air/sea/msl ; cls: how it is targeted (soft/hard/air/ship/struct)
   a: attack {s:soft,h:hard,a:air,n:ship,x:structures}
   req: [building, minLevel]; tech: [techId, level] extra unlock */
const UNITS = {
  inf:   { n: 'Пехота', dom: 'land', cls: 'soft', a: { s: 6, h: 3.6, a: 0.6, n: 0, x: 1 }, arm: 2, spd: 2.6, vis: 1, hp: 100, cost: { c: 10, f: 2, s: 3, p: 6 }, time: 12, req: ['barracks', 1], up: { f: 1.2, s: 0.8 }, desc: 'Основа любой армии. Дёшева, хороша в обороне.' },
  mot:   { n: 'Мотопехота', dom: 'land', cls: 'hard', a: { s: 8, h: 6, a: 1, n: 0, x: 2 }, arm: 5, spd: 5.2, vis: 1, hp: 100, cost: { c: 24, m: 7, o: 2, s: 4, p: 4 }, time: 24, req: ['barracks', 2], up: { f: 1, s: 1, o: 0.7 }, desc: 'БТР и БМП. Быстрая и бронированная пехота.' },
  tank:  { n: 'Танки', dom: 'land', cls: 'hard', a: { s: 9, h: 14, a: 0, n: 0, x: 4 }, arm: 8, spd: 4.6, vis: 1, hp: 100, cost: { c: 48, m: 18, o: 5, s: 4, e: 2, p: 3 }, time: 36, req: ['factory', 2], up: { f: 0.5, s: 1.2, o: 1.5 }, desc: 'Основной боевой танк. Ломает бронетехнику и пехоту.' },
  arty:  { n: 'Артиллерия', dom: 'land', cls: 'soft', a: { s: 17, h: 9, a: 0, n: 0, x: 8 }, arm: 1, spd: 3.2, vis: 1, hp: 100, cost: { c: 30, m: 12, s: 6, p: 3 }, time: 28, req: ['factory', 1], up: { f: 0.5, s: 1.8, o: 0.4 }, desc: 'Огневая поддержка. Уязвима в ближнем бою.', backline: true },
  mlrs:  { n: 'РСЗО', dom: 'land', cls: 'soft', a: { s: 24, h: 11, a: 0, n: 0, x: 10 }, arm: 1, spd: 4.2, vis: 1, hp: 100, cost: { c: 44, m: 16, e: 3, s: 8, p: 3 }, time: 36, req: ['factory', 3], up: { f: 0.5, s: 2.2, o: 0.5 }, desc: 'Реактивные системы залпового огня.', backline: true },
  aa:    { n: 'Мобильное ПВО', dom: 'land', cls: 'soft', a: { s: 2, h: 1, a: 19, n: 0, x: 0 }, arm: 3, spd: 4.4, vis: 1, hp: 100, cost: { c: 30, m: 10, e: 4, s: 4, p: 3 }, time: 28, req: ['factory', 2], up: { f: 0.5, s: 1, o: 0.6 }, desc: 'Зенитные комплексы. Защищают от авиации и вертолётов.', backline: true },
  spec:  { n: 'Спецназ', stealth: 0.45, nbc: true, dom: 'land', cls: 'soft', a: { s: 11, h: 5, a: 1, n: 0, x: 3 }, arm: 3, spd: 3.4, vis: 2, hp: 100, cost: { c: 34, e: 3, s: 4, p: 4 }, time: 30, req: ['barracks', 3], up: { f: 1, s: 1 }, desc: 'Элитная пехота. Хороша в городах и горах, дальний обзор.' },
  recon: { n: 'Разведка', dom: 'land', cls: 'hard', a: { s: 3, h: 1, a: 0, n: 0, x: 0 }, arm: 4, spd: 8.5, vis: 3, hp: 100, cost: { c: 14, m: 4, o: 1, s: 1, p: 2 }, time: 14, req: ['barracks', 1], up: { f: 0.5, s: 0.4, o: 0.5 }, desc: 'Бронеразведка. Огромный радиус обзора и скорость.' },

  fighter: { n: 'Истребитель', dom: 'air', cls: 'air', a: { s: 4, h: 3, a: 21, n: 3, x: 0 }, arm: 4, spd: 42, vis: 2, hp: 100, rng: 130, fuel: 6, cost: { c: 70, m: 20, e: 8, o: 5, p: 1 }, time: 40, req: ['airfield', 2], up: { s: 1, o: 2.2 }, desc: 'Завоевание превосходства в воздухе. Патрулирует провинции.' },
  bomber: { n: 'Тактический бомбардировщик', dom: 'air', cls: 'air', a: { s: 15, h: 13, a: 1, n: 13, x: 16 }, arm: 3, spd: 36, vis: 2, hp: 100, rng: 200, fuel: 8, cost: { c: 85, m: 24, e: 10, o: 6, p: 1 }, time: 48, req: ['airfield', 2], up: { s: 1.2, o: 2.6 }, desc: 'Бьёт по наземным целям, кораблям и инфраструктуре.' },
  heli: { n: 'Ударный вертолёт', dom: 'air', cls: 'air', a: { s: 13, h: 19, a: 3, n: 6, x: 3 }, arm: 3, spd: 11, vis: 2, hp: 100, rng: 48, fuel: 5, cost: { c: 55, m: 14, e: 6, o: 3, p: 1 }, time: 32, req: ['airfield', 1], up: { s: 1, o: 1.4 }, desc: 'Малая дальность, отличный истребитель танков.' },
  uav: { n: 'Боевой БПЛА', dom: 'air', cls: 'air', a: { s: 7, h: 7, a: 0, n: 3, x: 4 }, arm: 1, spd: 22, vis: 3, hp: 100, rng: 260, fuel: 12, cost: { c: 28, e: 7, o: 2, p: 0 }, time: 20, req: ['airfield', 2], tech: ['elect', 1], up: { s: 0.4, o: 0.9 }, desc: 'Дешёвый разведывательно-ударный дрон с огромной дальностью.' },
  sbomber: { n: 'Стратегический бомбардировщик', dom: 'air', cls: 'air', a: { s: 28, h: 24, a: 1, n: 24, x: 34 }, arm: 3, spd: 34, vis: 2, hp: 100, rng: 520, fuel: 18, cost: { c: 240, m: 60, e: 22, o: 14, r: 4, p: 1 }, time: 90, req: ['airfield', 4], tech: ['indus', 2], up: { s: 2, o: 4 }, desc: 'Массированные удары на огромной дальности.' },

  frigate: { n: 'Фрегат', dom: 'sea', cls: 'ship', a: { s: 3, h: 3, a: 9, n: 11, x: 4 }, sub: 9, arm: 4, spd: 6.2, vis: 2, hp: 100, cost: { c: 70, m: 28, e: 5, o: 6, p: 2 }, time: 54, req: ['naval', 1], up: { f: 0.6, s: 0.6, o: 1.6 }, desc: 'Универсальный корабль охранения.' },
  destroyer: { n: 'Эсминец', dom: 'sea', cls: 'ship', a: { s: 5, h: 5, a: 15, n: 15, x: 6 }, sub: 15, arm: 5, spd: 6.6, vis: 2, hp: 100, cost: { c: 110, m: 40, e: 9, o: 9, p: 3 }, time: 72, req: ['naval', 2], up: { f: 0.7, s: 0.9, o: 2.2 }, desc: 'Противолодочная и противовоздушная оборона флота.' },
  cruiser: { n: 'Крейсер', dom: 'sea', cls: 'ship', a: { s: 11, h: 9, a: 23, n: 22, x: 14 }, sub: 8, arm: 7, spd: 6, vis: 3, hp: 100, cost: { c: 210, m: 80, e: 18, o: 16, r: 2, p: 4 }, time: 108, req: ['naval', 3], up: { f: 0.9, s: 1.4, o: 3.2 }, desc: 'Тяжёлый ракетный крейсер. Бомбардирует берег.' },
  sub: { n: 'Подводная лодка', dom: 'sea', cls: 'ship', a: { s: 0, h: 0, a: 0, n: 26, x: 5 }, sub: 13, arm: 3, spd: 5.4, vis: 1, stealth: 0.62, hp: 100, cost: { c: 120, m: 45, e: 10, o: 8, p: 2 }, time: 78, req: ['naval', 2], up: { f: 0.6, s: 0.9, o: 1.4 }, desc: 'Невидима для большинства противников. Охотится за кораблями.' },
  carrier: { n: 'Авианосец', dom: 'sea', cls: 'ship', a: { s: 2, h: 2, a: 9, n: 6, x: 2 }, sub: 0, arm: 8, spd: 5.6, vis: 3, hp: 100, cap: 8, cost: { c: 520, m: 190, e: 40, o: 30, r: 8, p: 6 }, time: 180, req: ['naval', 4], tech: ['indus', 2], up: { f: 1.2, s: 2.2, o: 5 }, desc: 'Плавучий аэродром: вмещает до 8 самолётов.' },
  transport: { n: 'Транспортный корабль', dom: 'sea', cls: 'ship', a: { s: 0, h: 0, a: 1, n: 0, x: 0 }, sub: 0, arm: 2, spd: 5.4, vis: 2, hp: 100, cap: 6, cost: { c: 55, m: 22, o: 3, p: 1 }, time: 40, req: ['naval', 1], up: { f: 0.3, s: 0.4, o: 1 }, desc: 'Перевозит до 6 наземных частей. Нужен для десанта.' },

  cruise: { n: 'Крылатая ракета', dom: 'msl', cls: 'air', a: { s: 38, h: 30, a: 0, n: 34, x: 45 }, arm: 0, spd: 28, vis: 0, hp: 100, rng: 230, cost: { c: 40, m: 8, e: 5, o: 2, p: 0 }, time: 18, req: ['airfield', 1], tech: ['rockets', 1], up: {}, desc: 'Одноразовый высокоточный удар. Перехватывается ПВО.', oneshot: true },
  btm: { n: 'Баллистическая ракета', dom: 'msl', cls: 'air', a: { s: 60, h: 50, a: 0, n: 40, x: 80 }, arm: 0, spd: 55, vis: 0, hp: 100, rng: 420, cost: { c: 85, m: 20, e: 10, o: 5, r: 1, p: 0 }, time: 30, req: ['silo', 1], tech: ['rockets', 2], up: {}, desc: 'Оперативно-тактическая ракета. Мощный разовый удар.', oneshot: true },
  icbm: { n: 'МБР (ядерная)', dom: 'msl', cls: 'air', a: { s: 100, h: 100, a: 0, n: 100, x: 100 }, arm: 0, spd: 140, vis: 0, hp: 100, rng: 1100, nuke: true, cost: { c: 700, m: 120, e: 50, o: 20, r: 20, p: 2 }, time: 168, req: ['silo', 1], tech: ['nuclear', 1], up: {}, desc: 'ЯДЕРНОЕ ОРУЖИЕ. Уничтожает всё в провинции и заражает регион.', oneshot: true }
};
const UNIT_ORDER = ['inf', 'recon', 'mot', 'tank', 'arty', 'mlrs', 'aa', 'spec', 'fighter', 'bomber', 'heli', 'uav', 'sbomber', 'frigate', 'destroyer', 'cruiser', 'sub', 'carrier', 'transport', 'cruise', 'btm', 'icbm'];
const GEN_NAMES = ['I', 'II', 'III', 'IV'];

/* National techs */
const TECHS = {
  infra: { n: 'Строительство', i: '🏗', br: 'eco', max: 3, d: 'Позволяет строить здания выше 3 уровня и ускоряет стройку (-10% времени за уровень).' },
  agri: { n: 'Агротехнологии', i: '🌾', br: 'eco', max: 3, d: '+10% продовольствия за уровень.' },
  mine: { n: 'Добыча ресурсов', i: '⛏', br: 'eco', max: 3, d: '+10% топлива, компонентов и редких материалов за уровень.' },
  indus: { n: 'Промышленность', i: '🏭', br: 'eco', max: 3, d: '+10% денег и припасов. Открывает стратегические бомбардировщики и авианосцы (ур.2).' },
  elect: { n: 'Электроника', i: '💻', br: 'eco', max: 3, d: '+12% электроники за уровень. Открывает БПЛА.' },
  logist: { n: 'Логистика', i: '🚚', br: 'eco', max: 3, d: 'Снижает расход припасов и топлива на 8% и ускоряет армии на 4% за уровень.' },
  radar: { n: 'Радиолокация', i: '📡', br: 'mil', max: 3, d: 'Увеличивает радиус обзора всех войск и баз.' },
  rockets: { n: 'Ракетостроение', i: '🚀', br: 'mil', max: 3, d: 'Ур.1: крылатые ракеты. Ур.2: баллистические ракеты.' },
  nuclear: { n: 'Ядерная программа', i: '☢', br: 'mil', max: 1, d: 'Открывает ядерное оружие (МБР). Нужны ракеты ур.2.', need: [['rockets', 2]] },
  abm: { n: 'Противоракетная оборона', i: '🛡', br: 'mil', max: 3, d: 'Здания ПВО перехватывают ракеты (+15% за уровень).', need: [['rockets', 1]] }
};
const BRANCHES = { land: 'Сухопутные', air: 'Авиация', sea: 'Флот', mil: 'Спецтехнологии', eco: 'Экономика' };
function techCost(kind, id, lvl) {
  if (kind === 'u') {
    const u = UNITS[id]; const base = Object.values(u.cost).reduce((a, b) => a + b, 0);
    const g = lvl; // target gen (1..3)
    return { c: Math.round(base * 2.2 * (g + 0.5) * g), e: Math.round(6 * g * g + base * 0.1 * g), r: g >= 2 ? Math.round(g * 3 + base * 0.02) : 0 };
  }
  const t = TECHS[id];
  return { c: 160 * lvl * lvl, e: 14 * lvl * lvl, r: lvl >= 2 ? 6 * lvl : 0 };
}
function techDays(kind, id, lvl) {
  if (kind === 'u') return 4 + 5 * lvl + (UNITS[id].dom === 'sea' ? 4 : 0) + (UNITS[id].dom === 'msl' ? 6 : 0);
  return 6 + 6 * lvl;
}
const UNIT_BRANCH = u => ({ land: 'land', air: 'air', sea: 'sea', msl: 'mil' }[UNITS[u].dom]);
const MAX_GEN = 3;
const GEN_ATK = [1, 1.25, 1.55, 1.9], GEN_ARM = [0, 1, 2, 3], GEN_SPD = [1, 1.04, 1.08, 1.12];

/* Governments */
const DOCS = {
  west: { n: 'Западная', d: 'Лучшая техника и броня (+8% атаки, +1 брони), но юниты на 20% дороже.', atk: 1.08, arm: 1, cost: 1.2, up: 1 },
  east: { n: 'Восточная', d: 'Дешёвая масса: юниты на 18% дешевле, но -5% атаки.', atk: 0.95, arm: 0, cost: 0.82, up: 1 },
  euro: { n: 'Европейская', d: 'Сбалансированная: содержание армии на 10% дешевле.', atk: 1.0, arm: 0, cost: 1.0, up: 0.9 }
};
const GOV_FX = {
  democracy: { cash: 1.06, man: 1, unit: 1, t: '+6% денег' },
  autocracy: { cash: 0.97, man: 1.05, unit: 0.93, t: '-7% цены юнитов' },
  communist: { cash: 1, man: 1.2, unit: 1, t: '+20% живой силы' },
  monarchy: { cash: 1.02, man: 1.05, unit: 1, t: '+2% денег, +5% живой силы' },
  theocracy: { cash: 0.95, man: 1.15, unit: 1, t: '+15% живой силы' },
  junta: { cash: 0.93, man: 1.1, unit: 0.9, t: '-10% цены юнитов' }
};
const GOV = { democracy: 'Демократия', autocracy: 'Автократия', communist: 'Коммунистический режим', monarchy: 'Монархия', theocracy: 'Теократия', junta: 'Военная хунта' };

const BLOCS = {
  NATO: { n: 'НАТО', c: '#3a7bd5' },
  CSTO: { n: 'ОДКБ', c: '#d94b3a' },
  PACIFIC: { n: 'Тихоокеанский пакт', c: '#2fb5a8' },
  CHINA: { n: 'Пекинский союз', c: '#e0a030' },
  ARAB: { n: 'Арабская коалиция', c: '#4caf50' }
};

const DIFF = {
  easy: { n: 'Лёгкая', aiEco: 0.8, aiAgg: 0.6, pace: 0.45 },
  normal: { n: 'Нормальная', aiEco: 1.0, aiAgg: 1.0, pace: 0.8 },
  hard: { n: 'Сложная', aiEco: 1.25, aiAgg: 1.4, pace: 1 }
};
const SCENARIOS = {
  cold: { n: 'Холодная напряжённость', d: 'Мир на грани. Первые три недели все в мире; потом конфликты нарастают.', wars: [], tension: 1 },
  eve: { n: 'Накануне Третьей мировой', d: 'Несколько горячих конфликтов уже идут. Блоки готовы вступить в войну.', wars: [['RUS', 'UKR'], ['IS1', 'IRN'], ['PRK', 'KOR'], ['CH1', 'TWN'], ['IND', 'PAK']], tension: 2 },
  chaos: { n: 'Мировой хаос', d: 'Мир уже горит: десятки войн, блоки сталкиваются сразу.', wars: [['RUS', 'UKR'], ['IS1', 'IRN'], ['PRK', 'KOR'], ['CH1', 'TWN'], ['IND', 'PAK'], ['TUR', 'GRC'], ['ARM', 'AZE'], ['ETH', 'ERI'], ['SAU', 'YEM'], ['VEN', 'GUY'], ['RUS', 'POL']], tension: 3 }
};
