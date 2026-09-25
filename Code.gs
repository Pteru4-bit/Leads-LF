/**
 * ============================================================
 *  «Пропозиції приміщень» — Code.gs (працює в парі з Form.html)
 *
 *  1) Кожні 10 хв бере з таблиці-джерела (Typeform) нові ліди
 *     «Маю приміщення…» / «I have premises…» і дописує їх у
 *     «Ліди UA» / «Ліди EN» (один рядок = один лід, ключ — Token).
 *  2) Визначає МРМ за «Територія МРМ» і надсилає йому лист.
 *     Якщо МРМ не знайдено — лист на FALLBACK_EMAIL.
 *  3) Веб-форма (Form.html): результат або зміна відповідального.
 *     Пише в B/C/D і в аркуш «Журнал опрацювання».
 *  4) Щоденний звіт о 08:30 за Києвом.
 *
 *  Колонки «Ліди UA/EN»:
 *   A Дата (Київ) · B Відповідальний · C Результат · D Коментар ·
 *   E… — копія колонок джерела (як було в IMPORTRANGE).
 *
 *  ПЕРШИЙ ЗАПУСК: меню «🏢 Пропозиції приміщень» → «⚙ Первинне налаштування».
 * ============================================================
 */

// ============================================================
//  НАЛАШТУВАННЯ
// ============================================================
const CFG = {
  TARGET_ID: '10ngjClQt9Zu8FrRo6EtNuk4FFl3pPpx5adqkJTuFeUs',   // ця таблиця
  SOURCE_ID: '1E8D6UMBlQQTkd6N5ywjHyl2_qmTDIMIABGfTCvUN1yI',   // джерело (Typeform)
  SHEETS: [
    { key: 'UA', en: false, src: 'Франшиза сайт України UA v2', dst: 'Ліди UA',
      interest: 'Маю приміщення, яке можу запропонувати в оренду чи продаж' },
    { key: 'EN', en: true,  src: 'Франшиза сайт України EN v2', dst: 'Ліди EN',
      interest: 'I have premises I can offer for rent or sale' },
  ],
  MRM_SHEET: 'Територія МРМ',            // A: ПІБ · B: територія · C: e-mail
  JOURNAL_SHEET: 'Журнал опрацювання',
  SENT_SHEET: '_Надіслані',              // службовий, прихований
  FIRST_DATA_ROW: 2,
  COL: { date: 1, resp: 2, res: 3, com: 4 },   // A, B, C, D
  DATA_START_COL: 5,                          // E — копія колонок джерела
  WORK_HEADERS: ['Дата', 'Відповідальний (в роботі)', 'Результат (в роботі)', 'Коментар (в роботі)'],
};

// ---- Листи ----
const EMAILS_ENABLED = true;                      // ⛔ false → жодних автоматичних листів
const TEST_EMAIL = 'gurin.vv@novaposhta.ua';      // куди йдуть УСІ листи в тестовому режимі
const FALLBACK_EMAIL = 'gurin.vv@novaposhta.ua';  // ліди, для яких МРМ не знайдено
const MAIL_SENDER_NAME = 'Пропозиції приміщень';
const NOTIFY_ON_MANUAL_ASSIGN = true;  // МРМ змінили в колонці B вручну → лист новому МРМ
// Фото: Typeform віддає їх як файл для завантаження, тому скрипт вкладає фото в лист —
// у Gmail вони відкриваються переглядачем, без скачування.
const EMAIL_PHOTO_ATTACH = true;       // вкладати фото в лист
const EMAIL_PHOTO_MAX_MB = 15;         // межа вкладень на лист. Ліміт Google — 25 МБ, але при відправці
                                       // вкладення важчають ~на третину (кодування). Що не влізло — посиланням.
const EMAIL_PHOTO_THUMBS = false;      // true → ще й мініатюри в тексті листа (дублюють вкладення)
// Тестовий режим і URL веб-застосунку зберігаються у властивостях скрипта
// (меню → «Режим листів…», «Вказати URL…»): зміна не потребує нового розгортання.
// Тестовий режим за замовчуванням УВІМКНЕНО.
const WEB_APP_URL_DEFAULT = '';        // можна вписати …/exec і тут, але зручніше через меню
const WEB_APP_DOMAIN = 'novaposhta.ua'; // адреса форми завжди у вигляді …/a/macros/<домен>/s/…/exec —
                                        // так Google відкриває її робочим акаунтом, навіть якщо в браузері їх кілька

// ---- Щоденний звіт ----
const REPORTS_ENABLED = true;
const REPORT_RECIPIENTS = ['gurin.vv@novaposhta.ua'];
const WORK_DAY_END_HOUR = 18;          // після 18:00 у будні та у вихідні = «поза робочим часом»

// ---- Час ----
const KYIV_TZ = 'Europe/Kiev';         // Київ; літній/зимовий час враховується автоматично
const SOURCE_TIME_IS_UTC = true;       // «Submitted At» у джерелі записано в UTC

// ---- Статуси ----
const STATUSES = ['Відмова', 'В процесі обробки', 'Опрацьовано', 'Недозвон', 'Консультації з інших питань'];
const STATUS_NOT_TAKEN = 'Не взято в роботу';   // ставиться лише вручну в таблиці
const STATUS_COLORS = {
  'Опрацьовано': '#b6d7a8',
  'Відмова': '#ea9999',
  'В процесі обробки': '#ffe599',
  'Недозвон': '#f9cb9c',
  'Консультації з інших питань': '#a4c2f4',
  'Не взято в роботу': '#d9d9d9',
};

// Уточнення до статусу — замість окремої Google-форми.
// Поле з'являється у веб-формі після вибору статусу і є обов'язковим.
// Списки — чернетка: правте під свою практику (порядок = порядок у формі).
const STATUS_DETAILS = {
  'Відмова': { label: 'Причина відмови', options: [
    'Висока вартість', 'Не підходить площа', 'Не підходить локація', 'Незадовільний стан приміщення',
    'Немає під’їзду для вантажного авто', 'Власник передумав', 'Приміщення вже здано / продано', 'Інше',
  ] },
  'В процесі обробки': { label: 'Наступний крок', needsDate: true, options: [
    'Огляд приміщення', 'Переговори щодо умов', 'Очікуємо документи / фото від власника',
    'Погодження всередині компанії', 'Інше',
  ] },
  'Опрацьовано': { label: 'Підсумок', options: [
    'Приміщення взято в роботу під відкриття', 'Додано до бази резервних приміщень', 'Інше',
  ] },
};
// Якщо окрема Google-форма все ж потрібна — встав її URL: після цих статусів
// у веб-формі з'явиться кнопка на неї. Порожньо → кнопки немає.
const FOLLOWUP_FORM_URL = '';
const FOLLOWUP_STATUSES = ['Відмова', 'В процесі обробки', 'Опрацьовано'];

// ---- Поля джерела (шукаються за назвою колонки; зірочки, регістр і тип апострофа не важливі) ----
// Береться ПЕРШЕ входження назви — це блок «Маю приміщення».
const FIELDS = {
  interest:    ['Підкажіть, будь ласка, що вас цікавить найбільше?', 'What interests you most?'],
  name:        ['Як можемо до вас звертатися?', 'How should we address you?'],
  phone:       ['За яким номером з вами зручно зв’язатися?', 'What is the best phone number to reach you?'],
  region:      ['Область', 'Region'],
  settlement:  ['Населений пункт', 'Settlement'],
  address:     ['Адреса', 'Address'],
  area:        ['Площа, м²', 'Area, m²'],
  floor:       ['Поверх', 'Floor'],
  ptype:       ['Тип приміщення', 'Type of premises'],
  deal:        ['Оренда або продаж', 'Rent or sale'],
  price:       ['Загальна вартість, грн', 'Total price, UAH'],
  access:      ['Можливість під’їзду вантажного авто до приміщення', 'Cargo vehicle access to the premises'],
  ramps:       ['Наявність рамп', 'Loading ramps'],
  parking:     ['Наявність паркомісць', 'Parking spaces'],
  photoFacade: ['Фото фасаду приміщення', 'Photo of the premises facade'],
  photoArea:   ['Фото території', 'Photo of the surrounding area'],
  photoInside: ['Фото стану приміщення всередині', 'Photo of the interior condition'],
  info:        ['Додаткова інформація', 'Additional information'],
  submittedAt: ['Submitted At'],
  token:       ['Token'],
};

// Переклад відповідей EN-форми для листа й форми (невідоме лишається як є)
const EN_UK = {
  'yes': 'Так', 'no': 'Ні',
  'rent': 'Оренда', 'sale': 'Продаж', 'rent or sale': 'Оренда або продаж',
  'basement': 'Підвал', 'semi-basement': 'Напівпідвал', 'ground floor': '1 поверх',
  'warehouse': 'Склад', 'new building': 'Новобудова', 'old housing stock': 'Старий житловий фонд',
  'office': 'Офіс', 'shopping center': 'Торговий центр', 'shopping centre': 'Торговий центр',
  'detached building': 'Окрема будівля', 'separate building': 'Окрема будівля', 'other': 'Інше',
};

// ============================================================
//  ТЕРИТОРІЇ (як у попередньому проєкті + латиниця для EN-форми)
// ============================================================
const OBLAST_ROOTS = [
  ['kyiv_oblast',     ['київськ']],
  ['kharkiv',         ['харків', 'kharkiv']],
  ['zhytomyr',        ['житомир', 'zhytomyr']],
  ['vinnytsia',       ['вінниц', 'vinnyts']],
  ['khmelnytskyi',    ['хмельниц', 'khmelnyts']],
  ['chernihiv',       ['чернігів', 'chernihiv']],
  ['dnipro',          ['дніпропетров', 'dnipropetrov', 'dnipro region']],
  ['zaporizhzhia',    ['запор', 'zaporiz']],
  ['rivne',           ['рівн', 'rivne']],
  ['volyn',           ['волин', 'volyn']],
  ['ternopil',        ['тернопіл', 'ternopil']],
  ['chernivtsi',      ['чернівец', 'чернівц', 'chernivts']],
  ['mykolaiv',        ['микола', 'mykolaiv']],
  ['kherson',         ['херсон', 'kherson']],
  ['lviv',            ['львів', 'lviv']],
  ['odesa',           ['одес', 'odes']],
  ['kirovohrad',      ['кіровоград', 'kirovohrad']],
  ['cherkasy',        ['черкас', 'cherkas']],
  ['ivano-frankivsk', ['івано-франків', 'франків', 'ivano-frankiv']],
  ['zakarpattia',     ['закарпат', 'zakarpat']],
  ['poltava',         ['полтав', 'poltav']],
  ['sumy',            ['сумськ', 'sumsk', 'суми', 'sumy']],
  ['donetsk',         ['донецьк', 'donetsk']],
  ['luhansk',         ['луганськ', 'luhansk']],
];
const OBLAST_UK = {
  kyiv_city: 'м. Київ', kyiv_oblast: 'Київська обл.', kharkiv: 'Харківська обл.', zhytomyr: 'Житомирська обл.',
  vinnytsia: 'Вінницька обл.', khmelnytskyi: 'Хмельницька обл.', chernihiv: 'Чернігівська обл.',
  dnipro: 'Дніпропетровська обл.', zaporizhzhia: 'Запорізька обл.', rivne: 'Рівненська обл.', volyn: 'Волинська обл.',
  ternopil: 'Тернопільська обл.', chernivtsi: 'Чернівецька обл.', mykolaiv: 'Миколаївська обл.',
  kherson: 'Херсонська обл.', lviv: 'Львівська обл.', odesa: 'Одеська обл.', kirovohrad: 'Кіровоградська обл.',
  cherkasy: 'Черкаська обл.', 'ivano-frankivsk': 'Івано-Франківська обл.', zakarpattia: 'Закарпатська обл.',
  poltava: 'Полтавська обл.', sumy: 'Сумська обл.', donetsk: 'Донецька обл.', luhansk: 'Луганська обл.',
};
// Береги (як у старому проєкті + латиниця для EN-форми)
const KYIV_CITY_LEFT      = ['дарниц', 'деснян', 'дніпровськ', 'darnyts', 'desnian', 'desnyan', 'dniprovsk'];  // м. Київ, лівий берег
const KYIV_LEFT_RAIONS    = ['броварськ', 'бориспільськ', 'баришівськ', 'яготинськ', 'згурівськ', 'переяслав',
  'brovarsk', 'boryspilsk', 'baryshivsk', 'yahotynsk', 'zghurivsk', 'pereiaslav'];
const KYIV_LEFT_CITIES    = ['бориспіль', 'бровари', 'переяслав', 'яготин', 'згурівка', 'баришівка', 'березань',
  'boryspil', 'brovary', 'pereiaslav', 'yahotyn', 'zghurivka', 'baryshivka', 'berezan'];
const DNIPRO_LEFT_RAIONS  = ['павлоградськ', 'синельниківськ', 'петропавлівськ', 'магдалинівськ', 'васильківськ', 'покровськ',
  'межівськ', 'новомосковськ', 'самарівськ', 'pavlohradsk', 'synelnykivsk', 'novomoskovsk', 'samarivsk'];
const DNIPRO_RIGHT_RAIONS = ['криворізьк', 'нікопольськ', 'верхньодніпровськ', 'апостолівськ', 'софіївськ', 'пятихатськ',
  'жовтоводськ', 'вільногірськ', 'солонянськ', 'криничанськ', 'царичанськ', 'широківськ', 'томаківськ', 'kryvorizk', 'nikopolsk'];
const DNIPRO_AMBIG_CITIES = ['дніпро', 'камянське', 'dnipro', 'kamianske'];

// ============================================================
//  УТИЛІТИ
// ============================================================
const MS_DAY = 86400000;
const SERIAL_EPOCH = 25569;   // 1970-01-01 у серійних датах Google Sheets
const MONTHS_GEN = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
const MONTHS_SHORT = ['січ.', 'лют.', 'бер.', 'квіт.', 'трав.', 'черв.', 'лип.', 'серп.', 'вер.', 'жовт.', 'лист.', 'груд.'];
const DOW_NAMES = ['неділя', 'понеділок', 'вівторок', 'середа', 'четвер', 'п’ятниця', 'субота'];
const JOURNAL_HEADERS = ['Час', 'Аркуш', 'Token', 'Лід', 'Населений пункт', 'Дія', 'МРМ', 'Статус', 'Уточнення', 'Дата кроку', 'Коментар', 'Хто', 'Ключ'];
const JOURNAL_KEY_COL = 13;   // M — одноразовий ключ збереження з форми
const TRIGGER_FUNCS = ['importAndNotify', 'sendDailyReport', 'onLeadEdit'];

let SS_ = null;
let MRM_REG_ = null;

function ss_() {
  if (SS_) return SS_;
  try { SS_ = SpreadsheetApp.getActive(); } catch (e) { SS_ = null; }
  if (!SS_) SS_ = SpreadsheetApp.openById(CFG.TARGET_ID);
  return SS_;
}
function str_(v) { return v === null || v === undefined ? '' : String(v); }
function pad2_(n) { return ('0' + n).slice(-2); }
function normText_(s) {
  return str_(s).replace(/\*/g, '').replace(/[’'ʼ`ʹ]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
}
function stripApos_(x) { return str_(x).replace(/[’'ʼ`ʹ]/g, ''); }
function esc_(s) {
  return str_(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
// Запис у клітинку як текст: без формул і автоперетворень (+380… лишається +380…)
function txt_(s) { const v = str_(s); return v === '' ? '' : "'" + v; }
function isEmail_(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str_(s).trim()); }
function isUrl_(s) { return /^https?:\/\/\S+$/i.test(str_(s).trim()); }
function firstUrl_(s) { const m = str_(s).match(/https?:\/\/[^\s,;]+/i); return m ? m[0] : ''; }
function telHref_(raw) { const d = str_(raw).replace(/[^\d+]/g, ''); return d ? 'tel:' + d : ''; }
function hashStr_(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function chooseName_(names, key) {
  if (!names || !names.length) return '';
  return names.length === 1 ? names[0] : names[hashStr_(str_(key)) % names.length];
}
function pushUniq_(arr, v) { if (arr.indexOf(v) === -1) arr.push(v); }
function fmtMoney_(v) {
  const s = str_(v).trim();
  if (!s) return '';
  const n = typeof v === 'number' ? v : Number(s.replace(/[\s\u00a0]/g, '').replace(',', '.'));
  if (!isFinite(n)) return s;
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
}
function jsonForScript_(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
function prop_(k, def) {
  const v = PropertiesService.getScriptProperties().getProperty(k);
  return v === null || v === undefined ? def : v;
}
function isTestMode_() { return prop_('TEST_MODE', 'true') === 'true'; }
function webAppUrl_() {
  const p = prop_('WEB_APP_URL', '') || WEB_APP_URL_DEFAULT;
  if (p) return normalizeWebAppUrl_(p);
  try { const u = ScriptApp.getService().getUrl(); if (u && /\/exec$/.test(u)) return normalizeWebAppUrl_(u); } catch (e) { /* немає */ }
  return '';
}
// …/macros/s/ID/exec або …/u/1/a/macros/<домен>/s/ID/exec → …/a/macros/<домен>/s/ID/exec
function normalizeWebAppUrl_(url) {
  const u = str_(url).trim().replace(/\/u\/\d+\//, '/');
  const m = u.match(/^https:\/\/script\.google\.com\/(?:a\/macros\/([^\/]+)|macros)\/s\/([^\/?#]+)\/exec/);
  if (!m) return u;
  const domain = m[1] || WEB_APP_DOMAIN;
  return domain ? 'https://script.google.com/a/macros/' + domain + '/s/' + m[2] + '/exec' : u;
}
function errText_(err) { return err && err.message ? err.message : str_(err); }

// ---------- Дати ----------
// Рядок «настінного» часу → [y, m(0–11), d, hh, mi, ss]
function parseWall_(s) {
  s = str_(s).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return [+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)];
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return [+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)];
  m = s.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return [+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)];
  return null;
}
function serialToWall_(serial) {
  const d = new Date(Math.round((serial - SERIAL_EPOCH) * 86400) * 1000);   // до секунди, як показує Sheets
  return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()];
}
function partsFromWall_(p) {
  if (!p) return null;
  const dow = new Date(Date.UTC(p[0], p[1], p[2])).getUTCDay();
  return { y: p[0], m: p[1], d: p[2], hh: p[3], mi: p[4], dow: dow };
}
function tzOffsetMin_(date, tz) {
  const z = Utilities.formatDate(date, tz, 'Z');   // «+0300»
  const sign = z.charAt(0) === '-' ? -1 : 1;
  return sign * (parseInt(z.substr(1, 2), 10) * 60 + parseInt(z.substr(3, 2), 10));
}
// Значення «Submitted At» (серійне число / Date / текст) → момент часу
function srcToInstant_(v, srcTz) {
  if (v === '' || v === null || v === undefined) return null;
  let p = null;
  if (typeof v === 'number') p = serialToWall_(v);
  else if (v instanceof Date) p = parseWall_(Utilities.formatDate(v, srcTz, 'yyyy-MM-dd HH:mm:ss'));
  else p = parseWall_(str_(v));
  if (!p) return null;
  const guess = Date.UTC(p[0], p[1], p[2], p[3], p[4], p[5]);
  if (SOURCE_TIME_IS_UTC) return new Date(guess);
  return new Date(guess - tzOffsetMin_(new Date(guess), KYIV_TZ) * 60000);
}
function kyivParts_(instant) {
  return partsFromWall_(parseWall_(Utilities.formatDate(instant, KYIV_TZ, 'yyyy-MM-dd HH:mm:ss')));
}
function kyivSerial_(k) { return Date.UTC(k.y, k.m, k.d, k.hh, k.mi) / MS_DAY + SERIAL_EPOCH; }
function nowKyivSerial_() { return kyivSerial_(kyivParts_(new Date())); }
// Значення колонки A (дата за Києвом) → частини дати
function cellToKyivParts_(v, tz) {
  if (v === '' || v === null || v === undefined) return null;
  if (v instanceof Date) return partsFromWall_(parseWall_(Utilities.formatDate(v, tz, 'yyyy-MM-dd HH:mm:ss')));
  if (typeof v === 'number') return partsFromWall_(serialToWall_(v));
  return partsFromWall_(parseWall_(v));
}
function fmtFull_(k) { return pad2_(k.d) + '.' + pad2_(k.m + 1) + '.' + k.y + ' ' + pad2_(k.hh) + ':' + pad2_(k.mi); }
function fmtSubj_(k) { return k.d + ' ' + MONTHS_GEN[k.m] + ' ' + pad2_(k.hh) + ':' + pad2_(k.mi); }
function isoToSerial_(iso) {
  const m = str_(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / MS_DAY + SERIAL_EPOCH : '';
}
function isoToUa_(iso) {
  const m = str_(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? m[3] + '.' + m[2] + '.' + m[1] : str_(iso);
}
function dayKey_(y, m, d) { return y + '-' + pad2_(m + 1) + '-' + pad2_(d); }

// ============================================================
//  ЗАГОЛОВКИ Й ПОЛЯ
// ============================================================
// Ключі заголовків з урахуванням дублікатів: «назва#1», «назва#2»…
function headerKeys_(headers) {
  const cnt = {};
  return headers.map(function (h) {
    const n = normText_(h);
    if (!n) return '';
    cnt[n] = (cnt[n] || 0) + 1;
    return n + '#' + cnt[n];
  });
}
function fieldIndex_(headers) {
  const norm = headers.map(normText_);
  const fi = {};
  Object.keys(FIELDS).forEach(function (f) {
    const al = FIELDS[f].map(normText_);
    fi[f] = -1;
    for (let i = 0; i < norm.length; i++) if (al.indexOf(norm[i]) !== -1) { fi[f] = i; break; }
  });
  fi.kyivDistrict = -1;   // колонка «Оберіть район м. Київ» / «Select a city district in Kyiv»
  if (fi.region >= 0 && fi.settlement > fi.region) {
    for (let i = fi.region + 1; i < fi.settlement; i++) {
      if (/район м\. ?київ|city district in kyiv/.test(norm[i])) { fi.kyivDistrict = i; break; }
    }
  }
  return fi;
}
function trEn_(v) {
  const s = str_(v).trim();
  if (!s) return '';
  return s.split(/\s*,\s*/).map(function (part) {
    const k = part.toLowerCase();
    if (EN_UK[k]) return EN_UK[k];
    const m = k.match(/^(\d+)(?:st|nd|rd|th)?\s+floor$/);
    return m ? m[1] + ' поверх' : part;
  }).join(', ');
}
// Лід із рядка значень (розкладка джерела або аркуша «Ліди» — визначає fi)
function leadFromValues_(vals, fi, sc) {
  const g = function (f) { return fi[f] >= 0 ? str_(vals[fi[f]]).trim() : ''; };
  const tr = sc.en ? trEn_ : function (x) { return x; };
  let district = '', isKyivCity = false;
  if (fi.region >= 0 && fi.settlement > fi.region) {
    for (let i = fi.region + 1; i < fi.settlement; i++) {   // район = перше заповнене поле між «Область» і «Населений пункт»
      const v = str_(vals[i]).trim();
      if (v) { district = v; isKyivCity = (i === fi.kyivDistrict); break; }
    }
  }
  const lead = {
    sheetKey: sc.key, en: !!sc.en, token: g('token'),
    name: g('name'), phone: g('phone'), region: g('region'), district: district, isKyivCity: isKyivCity,
    settlement: g('settlement'), address: g('address'), area: g('area'),
    floor: tr(g('floor')), ptype: tr(g('ptype')), deal: tr(g('deal')),
    price: fmtMoney_(fi.price >= 0 ? vals[fi.price] : ''),
    access: tr(g('access')), ramps: tr(g('ramps')), parking: tr(g('parking')), info: g('info'),
    photos: [
      { label: 'Фасад', url: firstUrl_(g('photoFacade')) },
      { label: 'Територія', url: firstUrl_(g('photoArea')) },
      { label: 'Всередині', url: firstUrl_(g('photoInside')) },
    ],
    mrm: '', status: '', comment: '', row: 0, kyiv: null, date: '', subjDate: '',
  };
  lead.locKey = locationKey_(lead);
  lead.regionUk = sc.en ? (OBLAST_UK[lead.locKey] || lead.region) : lead.region;
  const districtTxt = district ? (/район|р-н|district/i.test(district) ? district : district + ' р-н') : '';
  const kyivSettl = /^(м\.?\s*)?(київ|kyiv)$/i.test(lead.settlement);
  lead.place = lead.settlement || (lead.locKey === 'kyiv_city' ? 'Київ' : '') || lead.regionUk || 'локація не вказана';
  lead.location = [lead.regionUk, districtTxt, (lead.locKey === 'kyiv_city' && kyivSettl) ? '' : lead.settlement]
    .filter(Boolean).join(', ');
  return lead;
}
function setLeadDate_(lead, k) {
  lead.kyiv = k || null;
  lead.date = k ? fmtFull_(k) : '';
  lead.subjDate = k ? fmtSubj_(k) : '';
}
function sheetCfgByDst_(name) {
  for (let i = 0; i < CFG.SHEETS.length; i++) if (CFG.SHEETS[i].dst === name) return CFG.SHEETS[i];
  return null;
}
function sheetCtx_(sh, sc) {
  const lastCol = Math.max(sh.getLastColumn(), CFG.DATA_START_COL);
  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  return { sh: sh, sc: sc, lastRow: sh.getLastRow(), lastCol: lastCol, headers: headers,
    fi: fieldIndex_(headers), tz: sh.getParent().getSpreadsheetTimeZone() };
}
function leadFromDstRow_(vals, ctx, rowNum) {
  const lead = leadFromValues_(vals, ctx.fi, ctx.sc);
  lead.row = rowNum;
  lead.mrm = str_(vals[CFG.COL.resp - 1]).trim();
  lead.status = str_(vals[CFG.COL.res - 1]).trim();
  lead.comment = str_(vals[CFG.COL.com - 1]).trim();
  let k = cellToKyivParts_(vals[CFG.COL.date - 1], ctx.tz);
  if (!k && ctx.fi.submittedAt >= 0) {
    const inst = srcToInstant_(vals[ctx.fi.submittedAt], ctx.tz);
    if (inst) k = kyivParts_(inst);
  }
  setLeadDate_(lead, k);
  return lead;
}
function readLead_(ctx, rowNum) {
  return leadFromDstRow_(ctx.sh.getRange(rowNum, 1, 1, ctx.lastCol).getValues()[0], ctx, rowNum);
}
function findLeadByToken_(token) {
  const ss = ss_();
  for (let s = 0; s < CFG.SHEETS.length; s++) {
    const sc = CFG.SHEETS[s];
    const sh = ss.getSheetByName(sc.dst);
    if (!sh) continue;
    const ctx = sheetCtx_(sh, sc);
    if (ctx.fi.token < 0 || ctx.lastRow < CFG.FIRST_DATA_ROW) continue;
    const col = sh.getRange(CFG.FIRST_DATA_ROW, ctx.fi.token + 1, ctx.lastRow - CFG.FIRST_DATA_ROW + 1, 1).getValues();
    for (let i = 0; i < col.length; i++) {
      if (str_(col[i][0]).trim() === token) {
        const row = CFG.FIRST_DATA_ROW + i;
        return { ctx: ctx, row: row, lead: readLead_(ctx, row) };
      }
    }
  }
  return null;
}

// ============================================================
//  МРМ І РОЗПОДІЛ
// ============================================================
function mrmRegistry_() {
  if (MRM_REG_) return MRM_REG_;
  const reg = { names: [], emailByName: {}, nameByEmail: {}, rows: [] };
  const sh = ss_().getSheetByName(CFG.MRM_SHEET);
  if (sh && sh.getLastRow() >= 2) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues().forEach(function (r) {
      const name = str_(r[0]).trim(), email = str_(r[2]).trim();
      if (!name) return;
      pushUniq_(reg.names, name);
      if (isEmail_(email) && !reg.emailByName[name]) reg.emailByName[name] = email;
      if (isEmail_(email)) reg.nameByEmail[email.toLowerCase()] = name;
      reg.rows.push([name, str_(r[1])]);
    });
  }
  reg.names.sort(function (a, b) { return a.localeCompare(b, 'uk'); });
  MRM_REG_ = reg;
  return reg;
}
function mrmEmail_(name) { return mrmRegistry_().emailByName[str_(name).trim()] || ''; }
function nameByEmail_(email) { return email ? (mrmRegistry_().nameByEmail[str_(email).toLowerCase()] || '') : ''; }

// ---- Парсинг «Територія МРМ» — без змін відносно старого проєкту ----
function findOblastOccurrences_(t) {
  const occ = [];
  let idx = 0;
  while ((idx = t.indexOf('київ', idx)) !== -1) {
    if (t.slice(idx + 4, idx + 7) !== 'ськ') occ.push({ pos: idx, key: 'kyiv_city' });
    idx += 4;
  }
  for (const [key, roots] of OBLAST_ROOTS) {
    for (const r of roots) {
      let i = 0;
      while ((i = t.indexOf(r, i)) !== -1) { occ.push({ pos: i, key: key }); i += r.length; }
    }
  }
  occ.sort(function (a, b) { return a.pos - b.pos; });
  const out = [];
  for (const o of occ) {
    const prev = out[out.length - 1];
    if (prev && prev.key === o.key) continue;
    out.push(o);
  }
  return out;
}
function parseTerritory_(str) {
  const t = str_(str).toLowerCase();
  const occ = findOblastOccurrences_(t);
  const res = {};
  for (let k = 0; k < occ.length; k++) {
    const start = occ[k].pos;
    const end = (k + 1 < occ.length) ? occ[k + 1].pos : t.length;
    const seg = t.slice(start, end);
    let bank = null;
    if (/ліви/.test(seg)) bank = 'L';
    else if (/прави/.test(seg)) bank = 'R';
    if (!(occ[k].key in res) || (bank && !res[occ[k].key])) res[occ[k].key] = bank;
  }
  return res;
}
function buildMrmMaps_() {
  const maps = { plain: {}, bank: {} };
  mrmRegistry_().rows.forEach(function (row) {
    const name = row[0], terr = row[1];
    if (!name || !str_(terr).trim()) return;
    const rules = parseTerritory_(terr);
    for (const key in rules) {
      const bank = rules[key];
      if (bank) { const kk = key + '|' + bank; maps.bank[kk] = maps.bank[kk] || []; pushUniq_(maps.bank[kk], name); }
      else { maps.plain[key] = maps.plain[key] || []; pushUniq_(maps.plain[key], name); }
    }
  });
  for (const k in maps.plain) maps.plain[k].sort();
  for (const k in maps.bank) maps.bank[k].sort();
  return maps;
}
function collectCandidates_(maps, key, bank) {
  const out = [];
  const add = function (a) { if (a) for (const n of a) if (out.indexOf(n) === -1) out.push(n); };
  if (bank === 'L' || bank === 'R') {
    add(maps.bank[key + '|' + bank]);
    if (out.length === 0) { add(maps.plain[key]); add(maps.bank[key + '|L']); add(maps.bank[key + '|R']); }
  } else {
    add(maps.plain[key]); add(maps.bank[key + '|L']); add(maps.bank[key + '|R']);
  }
  out.sort();
  return out;
}
function oblastKeyFromText_(text) {
  const t = str_(text).toLowerCase();
  for (const [key, roots] of OBLAST_ROOTS) for (const r of roots) if (t.indexOf(r) !== -1) return key;
  return null;
}
function bankOf_(key, raionText, name) {
  const r = stripApos_(raionText).toLowerCase();
  const nm = stripApos_(name).toLowerCase().trim();
  if (key === 'kyiv_oblast') {
    for (const x of KYIV_LEFT_RAIONS) if (r.indexOf(x) !== -1) return 'L';
    if (!r) for (const c of KYIV_LEFT_CITIES) if (nm === c) return 'L';
    return 'R';
  }
  if (key === 'dnipro') {
    for (const c of DNIPRO_AMBIG_CITIES) if (nm === c) return '?';
    for (const x of DNIPRO_LEFT_RAIONS) if (r.indexOf(x) !== -1) return 'L';
    for (const x of DNIPRO_RIGHT_RAIONS) if (r.indexOf(x) !== -1) return 'R';
    return '?';
  }
  return null;
}
// ---- Нове: визначення області/берега для ліда з окремих полів форми ----
function locationKey_(lead) {
  if (lead.isKyivCity) return 'kyiv_city';
  const r = stripApos_(lead.region).toLowerCase().replace(/\s+/g, ' ').trim();
  if (!r) return null;
  if (/^(м\.? ?)?київ$|^місто київ$|^kyiv( city)?$|^city of kyiv$/.test(r)) return 'kyiv_city';
  if (/київськ|kyiv (region|oblast)/.test(r)) return 'kyiv_oblast';
  return oblastKeyFromText_(r);
}
function kyivCityBank_(district) {
  const d = stripApos_(district).toLowerCase();
  if (!d) return null;
  for (const x of KYIV_CITY_LEFT) if (d.indexOf(x) !== -1) return 'L';
  return 'R';
}
function candidatesForLead_(lead, maps) {
  const key = lead.locKey || locationKey_(lead);
  if (!key) return { key: null, bank: null, names: [] };
  let bank = null;
  if (key === 'kyiv_city') bank = kyivCityBank_(lead.district);
  else if (key === 'kyiv_oblast' || key === 'dnipro') {
    const b = bankOf_(key, lead.district, lead.settlement);
    bank = (b === 'L' || b === 'R') ? b : null;
  }
  return { key: key, bank: bank, names: collectCandidates_(maps, key, bank) };
}
function resolveMrm_(lead, maps) {
  return chooseName_(candidatesForLead_(lead, maps).names, lead.token || lead.name);
}

// ============================================================
//  СЛУЖБОВІ АРКУШІ: «_Надіслані» та «Журнал опрацювання»
// ============================================================
function appendRows_(sh, rows) {
  if (!rows || !rows.length) return 0;
  const start = sh.getLastRow() + 1;
  const need = start + rows.length - 1;
  if (need > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
  sh.getRange(start, 1, rows.length, rows[0].length).setValues(rows);
  return start;
}
function sentSheet_(ss) {
  let sh = ss.getSheetByName(CFG.SENT_SHEET);
  if (!sh) {
    sh = ss.insertSheet(CFG.SENT_SHEET);
    sh.getRange(1, 1, 1, 4).setValues([['Token', 'Аркуш', 'Коли (Київ)', 'Кому / примітка']]);
    sh.getRange('C:C').setNumberFormat('dd.MM.yyyy HH:mm');
    sh.hideSheet();
  }
  return sh;
}
function loadSent_(ss) {
  const sh = sentSheet_(ss), last = sh.getLastRow(), set = {};
  if (last >= 2) sh.getRange(2, 1, last - 1, 1).getValues().forEach(function (r) {
    const t = str_(r[0]).trim();
    if (t) set[t] = true;
  });
  return { sheet: sh, set: set };
}
// entries: [[token, аркуш, примітка], …]
function markSent_(sent, entries) {
  const rows = [], now = nowKyivSerial_();
  entries.forEach(function (e) {
    if (!e[0] || sent.set[e[0]]) return;
    sent.set[e[0]] = true;
    rows.push([txt_(e[0]), e[1], now, txt_(e[2])]);
  });
  if (rows.length === 1) sent.sheet.appendRow(rows[0]);   // атомарно: безпечно при одночасних записах
  else appendRows_(sent.sheet, rows);
}
let JOURNAL_CHECKED_ = false;
function journalSheet_(ss) {
  let sh = ss.getSheetByName(CFG.JOURNAL_SHEET);
  if (!sh) {
    sh = ss.insertSheet(CFG.JOURNAL_SHEET);
    sh.getRange(1, 1, 1, JOURNAL_HEADERS.length).setValues([JOURNAL_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('A:A').setNumberFormat('dd.MM.yyyy HH:mm');
    sh.getRange('J:J').setNumberFormat('dd.MM.yyyy');
    JOURNAL_CHECKED_ = true;
  } else if (!JOURNAL_CHECKED_) {
    // журнал зі старішої версії — дописуємо заголовок «Ключ»
    if (sh.getMaxColumns() < JOURNAL_KEY_COL) sh.insertColumnsAfter(sh.getMaxColumns(), JOURNAL_KEY_COL - sh.getMaxColumns());
    const h = sh.getRange(1, JOURNAL_KEY_COL);
    if (str_(h.getValue()).trim() === '') h.setValue(JOURNAL_HEADERS[JOURNAL_KEY_COL - 1]).setFontWeight('bold');
    JOURNAL_CHECKED_ = true;
  }
  return sh;
}
// Чи вже зберігали відповідь із цим ключем (пошук у колонці «Ключ» журналу)
function keyUsed_(key) {
  if (!key) return false;
  const sh = journalSheet_(ss_());
  const last = sh.getLastRow();
  if (last < 2) return false;
  return !!sh.getRange(2, JOURNAL_KEY_COL, last - 1, 1).createTextFinder(key).matchEntireCell(true).findNext();
}
function jRow_(lead, action, o) {
  o = o || {};
  return [nowKyivSerial_(), lead.sheetKey || '', txt_(lead.token), txt_(lead.name), txt_(lead.place), action,
    txt_(o.mrm), txt_(o.status), txt_(o.detail), o.nextDate ? isoToSerial_(o.nextDate) : '', txt_(o.comment), txt_(o.who), txt_(o.key)];
}
function journal_(ss, rows) {
  if (!rows || !rows.length) return;
  const sh = journalSheet_(ss);
  if (rows.length === 1) sh.appendRow(rows[0]);   // атомарно: безпечно при одночасних записах
  else appendRows_(sh, rows);
}

// ============================================================
//  ІМПОРТ
// ============================================================
function getOrCreateDst_(ss, sc) { return ss.getSheetByName(sc.dst) || ss.insertSheet(sc.dst); }

// Узгоджує заголовки «Ліди …» із джерелом. Повертає: індекс колонки джерела → колонка аркуша (0 = пропустити)
function syncHeaders_(dst, sHeaders) {
  const base = CFG.DATA_START_COL;
  const lastCol = dst.getLastColumn();
  const head = lastCol ? dst.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  const dataHead = head.slice(base - 1);
  const hasData = dataHead.some(function (h) { return str_(h).trim() !== ''; });
  if (!hasData) {
    const need = base - 1 + sHeaders.length;
    if (dst.getMaxColumns() < need) dst.insertColumnsAfter(dst.getMaxColumns(), need - dst.getMaxColumns());
    dst.getRange(1, 1, 1, base - 1).setValues([CFG.WORK_HEADERS]);
    dst.getRange(1, base, 1, sHeaders.length).setValues([sHeaders.map(function (h) { return str_(h); })]);
    return sHeaders.map(function (h, j) { return normText_(h) ? base + j : 0; });
  }
  if (head.slice(0, base - 1).every(function (h) { return str_(h).trim() === ''; })) {
    dst.getRange(1, 1, 1, base - 1).setValues([CFG.WORK_HEADERS]);
  }
  const pos = {};
  headerKeys_(dataHead).forEach(function (k, i) { if (k) pos[k] = base + i; });
  let next = base + dataHead.length;
  const map = [], add = [];
  headerKeys_(sHeaders).forEach(function (k, j) {
    if (!k) { map[j] = 0; return; }
    if (pos[k]) { map[j] = pos[k]; return; }
    map[j] = next; add.push([next, str_(sHeaders[j])]); next++;   // нова колонка в джерелі → додаємо в кінець
  });
  if (add.length) {
    if (dst.getMaxColumns() < next - 1) dst.insertColumnsAfter(dst.getMaxColumns(), next - 1 - dst.getMaxColumns());
    add.forEach(function (a) { dst.getRange(1, a[0]).setValue(a[1]); });
  }
  return map;
}

function importSheet_(ss, src, sc, maps) {
  const out = { added: 0, errors: [], inserted: false };
  const sSh = src.getSheetByName(sc.src);
  if (!sSh) { out.errors.push('у джерелі немає аркуша «' + sc.src + '»'); return out; }
  const sLastRow = sSh.getLastRow(), sLastCol = sSh.getLastColumn();
  if (sLastCol < 1) return out;
  const sHeaders = sSh.getRange(1, 1, 1, sLastCol).getValues()[0];
  const sfi = fieldIndex_(sHeaders);
  if (sfi.token < 0) { out.errors.push('у «' + sc.src + '» немає колонки Token'); return out; }

  const dst = getOrCreateDst_(ss, sc);
  const colMap = syncHeaders_(dst, sHeaders);
  if (sLastRow < 2) return out;
  const dLastCol = dst.getLastColumn();
  const dLastRow = dst.getLastRow();
  const existing = {};
  const dTokCol = colMap[sfi.token];
  if (dTokCol && dLastRow >= CFG.FIRST_DATA_ROW) {
    dst.getRange(CFG.FIRST_DATA_ROW, dTokCol, dLastRow - CFG.FIRST_DATA_ROW + 1, 1).getValues().forEach(function (r) {
      const t = str_(r[0]).trim();
      if (t) existing[t] = true;
    });
  }

  // Спершу читаємо лише 2 колонки джерела (інтерес + Token), повні рядки — тільки для нових
  const n = sLastRow - 1;
  const intIdx = sfi.interest >= 0 ? sfi.interest : 0;
  const interest = sSh.getRange(2, intIdx + 1, n, 1).getValues();
  const tokens = sSh.getRange(2, sfi.token + 1, n, 1).getValues();
  const want = normText_(sc.interest);
  const pick = [];
  for (let i = 0; i < n; i++) {
    const t = str_(tokens[i][0]).trim();
    if (!t || existing[t]) continue;
    if (normText_(interest[i][0]).indexOf(want) === -1) continue;
    existing[t] = true;
    pick.push(i);
  }
  if (!pick.length) return out;

  const first = pick[0], last = pick[pick.length - 1];
  const block = sSh.getRange(2 + first, 1, last - first + 1, sLastCol).getValues();
  const srcTz = src.getSpreadsheetTimeZone();
  const rows = pick.map(function (i) {
    const s = block[i - first];
    const row = new Array(dLastCol).fill('');
    for (let j = 0; j < s.length; j++) {
      if (!colMap[j]) continue;
      const v = s[j];
      row[colMap[j] - 1] = (typeof v === 'string' && v !== '') ? "'" + v : v;
    }
    const inst = sfi.submittedAt >= 0 ? srcToInstant_(s[sfi.submittedAt], srcTz) : null;
    row[CFG.COL.date - 1] = inst ? kyivSerial_(kyivParts_(inst)) : '';
    row[CFG.COL.resp - 1] = resolveMrm_(leadFromValues_(s, sfi, sc), maps);
    return row;
  });
  const maxBefore = dst.getMaxRows();
  const start = appendRows_(dst, rows);
  dst.getRange(start, CFG.COL.date, rows.length, 1).setNumberFormat('dd.MM.yyyy HH:mm');
  out.added = rows.length;
  out.inserted = dst.getMaxRows() > maxBefore;
  return out;
}

// Тригер кожні 10 хв (і пункт меню «Імпортувати нові ліди зараз»)
function importAndNotify(e) {
  const deadline = Date.now() + 270000;   // 4,5 хв: ліміт виконання — 6 хв; решту листів надішле наступний запуск
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return null;
  let res;
  try {
    const ss = ss_();
    const src = SpreadsheetApp.openById(CFG.SOURCE_ID);
    const maps = buildMrmMaps_();
    res = { added: 0, sent: 0, errors: [], note: '' };
    let inserted = false;
    CFG.SHEETS.forEach(function (sc) {
      const r = importSheet_(ss, src, sc, maps);
      res.added += r.added;
      res.errors = res.errors.concat(r.errors);
      inserted = inserted || r.inserted;
    });
    if (inserted) setupValidation_(ss);
    const nres = notifyUnsent_(ss, deadline);
    res.sent = nres.sent;
    res.note = nres.note || '';
    res.errors = res.errors.concat(nres.errors || []);
  } finally {
    lock.releaseLock();
  }
  // із тригера — помилку видно в «Виконаннях» і в листі-сповіщенні Google
  if (e && res.errors.length) throw new Error(res.errors.join('; '));
  return res;
}

// ============================================================
//  ЛИСТИ
// ============================================================
function notifyUnsent_(ss, deadline) {
  if (!EMAILS_ENABLED) return { sent: 0, note: 'розсилку вимкнено (EMAILS_ENABLED = false)' };
  if (!webAppUrl_()) return { sent: 0, note: 'не вказано URL веб-застосунку — листи чекають' };
  const sent = loadSent_(ss);
  let cnt = 0;
  const errors = [];
  for (let s = 0; s < CFG.SHEETS.length; s++) {
    const sc = CFG.SHEETS[s];
    const sh = ss.getSheetByName(sc.dst);
    if (!sh) continue;
    const ctx = sheetCtx_(sh, sc);
    if (ctx.fi.token < 0 || ctx.lastRow < CFG.FIRST_DATA_ROW) continue;
    const toks = sh.getRange(CFG.FIRST_DATA_ROW, ctx.fi.token + 1, ctx.lastRow - CFG.FIRST_DATA_ROW + 1, 1).getValues();
    for (let i = 0; i < toks.length; i++) {
      const t = str_(toks[i][0]).trim();
      if (!t || sent.set[t]) continue;
      if (deadline && Date.now() > deadline) return { sent: cnt, note: 'решту листів надішле наступний запуск (ліміт часу)', errors: errors };
      if (MailApp.getRemainingDailyQuota() < 1) return { sent: cnt, note: 'вичерпано денну квоту листів', errors: errors };
      const lead = readLead_(ctx, CFG.FIRST_DATA_ROW + i);
      try {
        const r = sendNewLeadEmail_(lead, false);
        markSent_(sent, [[t, sc.key, (r.fallback ? 'резерв → ' : '') + r.to]]);
        journal_(ss, [jRow_(lead, r.fallback ? 'Лист без МРМ (резерв)' : 'Лист МРМ', { mrm: lead.mrm, who: 'скрипт' })]);
        cnt++;
      } catch (err) {
        errors.push('лист по ' + t + ': ' + errText_(err));
      }
    }
  }
  return { sent: cnt, errors: errors };
}

function subjPrefix_(lead, test) { return (test ? '[ТЕСТ] ' : '') + (lead && lead.en ? '[EN] ' : ''); }
function subjTail_(lead) {
  return lead.place + (lead.area ? ', ' + lead.area + ' м²' : '') +
    (lead.deal ? ', ' + lead.deal.toLowerCase() : '') + (lead.subjDate ? ' · ' + lead.subjDate : '');
}
function formUrl_(token, action) { return webAppUrl_() + '?t=' + encodeURIComponent(token) + '&a=' + action; }

function sendNewLeadEmail_(lead, forceTest) {
  const mrmEmail = lead.mrm ? mrmEmail_(lead.mrm) : '';
  const fallback = !mrmEmail;
  const test = isTestMode_() || !!forceTest;
  const intended = fallback ? FALLBACK_EMAIL : mrmEmail;
  const to = test ? TEST_EMAIL : intended;
  let reason = '';
  if (fallback) {
    reason = lead.mrm
      ? 'у «' + CFG.MRM_SHEET + '» немає e-mail для «' + lead.mrm + '»'
      : 'локацію «' + (lead.location || '—') + '» не знайдено в «' + CFG.MRM_SHEET + '»';
  }
  const subject = subjPrefix_(lead, test) + (fallback ? '[Без МРМ] ' : '') + 'Нова пропозиція приміщення — ' + subjTail_(lead);
  sendLeadMail_(to, subject, lead, {
    fallback: fallback, reason: reason,
    intendedTo: test ? (fallback ? intended + ' (резервна адреса)' : lead.mrm + ' <' + intended + '>') : '',
  });
  return { to: to, fallback: fallback };
}

function sendReassignEmail_(lead, newMrm, o) {
  o = o || {};
  const email = mrmEmail_(newMrm);
  if (!email) return '';
  const test = isTestMode_();
  const to = test ? TEST_EMAIL : email;
  const subject = subjPrefix_(lead, test) + 'Вам переназначено пропозицію приміщення — ' + subjTail_(lead);
  sendLeadMail_(to, subject, lead, {
    reassign: true, byName: o.byName, status: o.status, comment: o.comment,
    intendedTo: test ? newMrm + ' <' + email + '>' : '',
  });
  return to;
}

// Лист по ліду: фото — вкладеннями (переглядач Gmail), що не вдалося — посиланнями
function sendLeadMail_(to, subject, lead, o) {
  o.photoPack = photoAttachments_(lead);
  const send = function () {
    const msg = { to: to, subject: subject, name: MAIL_SENDER_NAME, htmlBody: leadEmailHtml_(lead, o) };
    if (o.photoPack.blobs.length) msg.attachments = o.photoPack.blobs;
    MailApp.sendEmail(msg);
  };
  try {
    send();
  } catch (err) {
    if (!o.photoPack.blobs.length) throw err;
    // лист із фото не пройшов (розмір тощо) → той самий лист із посиланнями: лід не «застрягне»
    Logger.log('Лист із фото не пройшов (' + errText_(err) + ') — надсилаю з посиланнями');
    o.photoPack = { blobs: [], attached: [] };
    send();
  }
}
function photoAttachments_(lead) {
  const pack = { blobs: [], attached: [] };
  if (!EMAIL_PHOTO_ATTACH) return pack;
  const limit = EMAIL_PHOTO_MAX_MB * 1024 * 1024;
  let total = 0;
  (lead.photos || []).forEach(function (p) {
    if (!isUrl_(p.url)) return;
    try {
      const r = UrlFetchApp.fetch(p.url, { muteHttpExceptions: true, followRedirects: true });
      if (r.getResponseCode() !== 200) return;
      const h = r.getHeaders();
      const blob = r.getBlob();
      // розмір — із заголовка (без getBytes: для 10 МБ це важкий масив у пам'яті)
      let size = Number(h['Content-Length'] || h['content-length'] || 0);
      if (!size) size = blob.getBytes().length;
      if (!size || total + size > limit) return;
      total += size;
      const ext = (p.url.split('?')[0].match(/\.([a-z0-9]{2,5})$/i) || [])[1];
      const base = (p.label + ' — ' + lead.place).replace(/[\\/:*?"<>|]+/g, ' ').trim();
      blob.setName(base + (ext ? '.' + ext.toLowerCase() : ''));
      if (ext && !/^image\//i.test(str_(blob.getContentType()))) blob.setContentTypeFromExtension();
      pack.blobs.push(blob);
      pack.attached.push(p.label);
    } catch (e) { /* лишиться посилання */ }
  });
  return pack;
}

function rowHtml_(k, vHtml) {
  return '<tr><td style="padding:8px 12px 8px 0;color:#777;width:150px;vertical-align:top;border-top:1px solid #f0f0f0;">' + esc_(k) +
    '</td><td style="padding:8px 0;color:#1a1a1a;border-top:1px solid #f0f0f0;">' + vHtml + '</td></tr>';
}
function emailBtn_(url, label, bg, fg) {
  return '<a href="' + esc_(url) + '" style="display:inline-block;padding:11px 20px;margin:0 8px 8px 0;background:' + bg +
    ';color:' + fg + ';border:1px solid #185FA5;border-radius:8px;text-decoration:none;font-size:14px;font-weight:bold;">' + esc_(label) + '</a>';
}
function noteBox_(bg, fg, html) {
  return '<div style="background:' + bg + ';padding:12px 16px;border-radius:8px;margin-bottom:14px;font-size:14px;color:' + fg + ';">' + html + '</div>';
}
function photosHtml_(photos, pack) {
  const ok = (photos || []).filter(function (p) { return isUrl_(p.url); });
  if (!ok.length) return '';
  const attached = pack ? pack.attached : [];
  const rest = ok.filter(function (p) { return attached.indexOf(p.label) === -1; });
  const lines = [];
  if (EMAIL_PHOTO_THUMBS) lines.push(thumbsHtml_(ok));
  if (attached.length) lines.push(esc_(attached.join(', ')) + ' — у вкладеннях унизу листа, відкриваються для перегляду');
  if (rest.length) {
    lines.push(rest.map(function (p) { return '<a href="' + esc_(p.url) + '" style="color:#185FA5;">' + esc_(p.label) + '</a>'; }).join(' &middot; ') +
      (attached.length ? ' — посиланням (файл завантажиться)' : ''));
  }
  return lines.join('<br>');
}
function thumbsHtml_(photos) {
  let cells = '';
  photos.forEach(function (p) {
    if (!/\.(png|jpe?g|gif|webp)(\?|$)/i.test(p.url)) return;
    cells += '<td style="padding:0 8px 6px 0;vertical-align:top;"><img src="' + esc_(p.url) + '" width="160" alt="' + esc_(p.label) +
      '" style="display:block;width:160px;max-width:100%;height:auto;border:1px solid #e0ddd3;border-radius:6px;"></td>';
  });
  return cells ? '<table role="presentation" style="border-collapse:collapse;"><tr>' + cells + '</tr></table>' : '';
}
function leadEmailHtml_(lead, o) {
  o = o || {};
  const tel = telHref_(lead.phone);
  const phoneHtml = tel
    ? '<a href="' + tel + '" style="color:#185FA5;text-decoration:none;font-weight:bold;">' + esc_(lead.phone) + '</a>'
    : esc_(lead.phone);
  let top = '';
  if (o.intendedTo) top += noteBox_('#EEEDFE', '#3C3489', '<b>Тестовий режим.</b> У бойовому режимі лист отримав би: ' + esc_(o.intendedTo));
  if (o.fallback) {
    top += noteBox_('#FCEBEB', '#A32D2D', '<b>МРМ не визначено автоматично</b>' + (o.reason ? ': ' + esc_(o.reason) : '') +
      '. Призначте відповідального кнопкою «Змінити відповідального» — він отримає лист.');
  }
  if (o.reassign) top += noteBox_('#FAEEDA', '#854F0B', '<b>' + esc_(o.byName || 'Колега') + '</b> переназначив(ла) цю заявку на вас.');
  if (o.reassign && (o.status || o.comment)) {
    top += '<div style="background:#EAF3DE;padding:12px 16px;border-radius:8px;margin-bottom:14px;">' +
      '<p style="margin:0 0 6px;font-size:12px;color:#3B6D11;">Попередня інформація</p>' +
      (o.status ? '<p style="margin:0 0 4px;font-size:14px;"><b>Статус:</b> ' + esc_(o.status) + '</p>' : '') +
      (o.comment ? '<p style="margin:0;font-size:14px;"><b>Коментар:</b> ' + esc_(o.comment) + '</p>' : '') + '</div>';
  }
  const rows = [
    ['Дата', esc_(lead.date)],
    ['Ім’я', esc_(lead.name)],
    ['Телефон', phoneHtml],
    ['Локація', esc_(lead.location)],
    ['Адреса', esc_(lead.address)],
    ['Площа', lead.area ? esc_(lead.area) + ' м²' : ''],
    ['Поверх', esc_(lead.floor)],
    ['Тип приміщення', esc_(lead.ptype)],
    ['Оренда / продаж', esc_(lead.deal)],
    ['Вартість', lead.price ? esc_(lead.price) + ' грн' : ''],
    ['Під’їзд вантажного авто', esc_(lead.access)],
    ['Наявність рамп', esc_(lead.ramps)],
    ['Наявність паркомісць', esc_(lead.parking)],
    ['Фото', photosHtml_(lead.photos, o.photoPack)],
    ['Додатково', esc_(lead.info)],
  ].filter(function (r) { return r[1] !== ''; }).map(function (r) { return rowHtml_(r[0], r[1]); }).join('');
  const badge = lead.en
    ? ' <span style="display:inline-block;padding:1px 7px;border-radius:6px;background:#fff;color:#0C447C;font-size:12px;font-weight:normal;vertical-align:2px;">EN-форма</span>'
    : '';
  const sub = o.fallback ? 'Потрібно призначити відповідального МРМ' : 'Ви — відповідальний МРМ за цією заявкою';
  return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;background:#fff;border:1px solid #e0ddd3;border-radius:12px;overflow:hidden;">' +
    '<div style="background:#E6F1FB;padding:16px 20px;">' +
    '<p style="margin:0;font-size:16px;font-weight:bold;color:#0C447C;">Пропозиція приміщення' + badge + '</p>' +
    '<p style="margin:2px 0 0;font-size:13px;color:#185FA5;">' + sub + '</p></div>' +
    '<div style="padding:20px;">' + top +
    '<table style="width:100%;border-collapse:collapse;font-size:14px;">' + rows + '</table>' +
    '<div style="margin-top:20px;">' +
    emailBtn_(formUrl_(lead.token, 'result'), 'Вказати результат', '#185FA5', '#ffffff') +
    emailBtn_(formUrl_(lead.token, 'respawn'), 'Змінити відповідального', '#ffffff', '#185FA5') +
    '</div></div>' +
    '<div style="padding:12px 20px;background:#f5f5f0;border-top:1px solid #eee;">' +
    '<p style="margin:0;font-size:12px;color:#999;">Автоматичне сповіщення · Відділ аудиту та обліку стандарту середовища</p></div></div>';
}

// ============================================================
//  ВЕБ-ФОРМА
// ============================================================
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.a === 'save') return saveViaGet_(p);
  return renderForm_(str_(p.t || p.key).trim(), (p.a || p.action) === 'respawn' ? 'respawn' : 'result', null, null);
}
// Збереження з форми — переходом за посиланням (GET), тим самим шляхом, яким форма відкривається з листа.
// POST і google.script.run при кількох акаунтах Google у браузері йдуть від «основного» акаунта
// і падають з «Не вдалося відкрити файл»; GET Google спрямовує на потрібний (робочий) акаунт.
// Одноразовий ключ n: оновлення сторінки результату не зберігає вдруге.
function saveViaGet_(p) {
  const token = str_(p.t).trim();
  const act = p.act === 'respawn' ? 'respawn' : 'result';
  const nonce = str_(p.n).replace(/[^\w-]/g, '').slice(0, 40);
  const payload = { token: token, action: act, mrm: p.mrm, status: p.status, detail: p.detail,
    nextDate: p.nextDate, comment: p.comment, key: nonce };
  let cache = null, res = null;
  try { cache = CacheService.getScriptCache(); } catch (e) { cache = null; }
  if (nonce) {
    const hit = cache ? cache.get('save:' + nonce) : null;
    if (hit) res = JSON.parse(hit);                       // оновлення сторінки одразу після збереження
    else if (keyUsed_(nonce)) {                           // давня вкладка / історія браузера — через будь-який час
      res = { ok: true, title: 'Уже збережено',
        subtitle: 'Цю відповідь збережено раніше, повторно її не записано. Щоб змінити результат, відкрийте заявку ще раз.' };
    }
  }
  if (!res) {
    res = saveForm(payload);
    if (cache && nonce && res.ok) cache.put('save:' + nonce, JSON.stringify(res), 21600);
  }
  return renderForm_(token, act, res, res.ok ? null : payload);
}
// Збереження з форми — звичайний POST на адресу веб-застосунку.
// На відміну від google.script.run, працює і тоді, коли в браузері відкрито кілька акаунтів Google.
function doPost(e) {
  const p = (e && e.parameter) || {};
  const res = saveForm(p);
  return renderForm_(str_(p.token).trim(), p.action === 'respawn' ? 'respawn' : 'result', res, res.ok ? null : p);
}
function renderForm_(token, action, result, prefill) {
  const data = {
    found: false, token: token, action: action, statuses: STATUSES, details: STATUS_DETAILS,
    mrmNames: [], lead: null, postUrl: webAppUrl_(), result: result, prefill: null,
  };
  if (result && result.ok) {
    data.found = true;                          // успіх: картка «Збережено», дані ліда не потрібні
  } else {
    const found = token ? findLeadByToken_(token) : null;
    if (found) {
      data.found = true;
      data.mrmNames = mrmRegistry_().names;
      data.lead = leadForClient_(found.lead);
    }
    if (prefill) {
      data.prefill = { mrm: str_(prefill.mrm), status: str_(prefill.status), detail: str_(prefill.detail),
        nextDate: str_(prefill.nextDate), comment: str_(prefill.comment).slice(0, 2000) };
    }
  }
  const t = HtmlService.createTemplateFromFile('Form');
  t.dataJson = jsonForScript_(data);
  return t.evaluate()
    .setTitle('Пропозиція приміщення')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
function leadForClient_(L) {
  return {
    en: L.en, name: L.name, place: L.place, date: L.date, phone: L.phone, telHref: telHref_(L.phone),
    location: L.location, address: L.address, area: L.area ? L.area + ' м²' : '', floor: L.floor, ptype: L.ptype,
    deal: L.deal, price: L.price ? L.price + ' грн' : '', access: L.access, ramps: L.ramps, parking: L.parking,
    info: L.info, photos: L.photos.filter(function (ph) { return isUrl_(ph.url); }),
    cur: { mrm: L.mrm, status: L.status, comment: L.comment },
  };
}
function whoAmI_() {
  try { return str_(Session.getActiveUser().getEmail()).trim(); } catch (e) { return ''; }
}
// «Причина, до 30.09.2026 — коментар»
function composeComment_(detail, nextIso, comment) {
  let head = detail || '';
  if (nextIso) head += (head ? ', ' : '') + 'до ' + isoToUa_(nextIso);
  if (!head) return comment;
  return comment ? head + ' — ' + comment : head;
}

// Виклик із Form.html
function saveForm(p) {
  p = p || {};
  const token = str_(p.token).trim();
  const action = p.action === 'respawn' ? 'respawn' : 'result';
  if (!token) return { ok: false, message: 'Недійсне посилання: немає ідентифікатора заявки.' };
  const status = str_(p.status).trim();
  const detail = str_(p.detail).trim();
  const nextDate = str_(p.nextDate).trim();
  const comment = str_(p.comment).trim().slice(0, 2000);
  const newMrm = str_(p.mrm).trim();
  const key = str_(p.key).replace(/[^\w-]/g, '').slice(0, 40);   // одноразовий ключ збереження (з форми)

  if (status && STATUSES.indexOf(status) === -1) return { ok: false, message: 'Невідомий статус.' };
  if (action === 'result' && !status) return { ok: false, message: 'Оберіть результат.' };
  const det = status ? STATUS_DETAILS[status] : null;
  if (det) {
    if (det.options.indexOf(detail) === -1) return { ok: false, message: 'Оберіть: ' + det.label.toLowerCase() + '.' };
    if (det.needsDate && !/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) return { ok: false, message: 'Вкажіть дату наступного кроку.' };
  }
  if (action === 'result' && !comment) return { ok: false, message: 'Заповніть коментар.' };
  if (action === 'respawn' && mrmRegistry_().names.indexOf(newMrm) === -1) return { ok: false, message: 'Оберіть МРМ зі списку.' };

  // Без блокування: імпорт лише дописує нові рядки внизу, а журнал і реєстр пишуться атомарно,
  // тож збереження не чекає, поки відпрацює 10-хвилинний імпорт.
  try {
    const f = findLeadByToken_(token);
    if (!f) return { ok: false, message: 'Заявку не знайдено: можливо, рядок видалено з таблиці.' };
    const ss = ss_(), sh = f.ctx.sh, row = f.row, L = f.lead;
    const who = whoAmI_();
    const useDetail = det ? detail : '';
    const useDate = det && det.needsDate ? nextDate : '';
    const full = composeComment_(useDetail, useDate, comment);

    if (action === 'result') {
      sh.getRange(row, CFG.COL.res, 1, 2).setValues([[status, txt_(full)]]);
      journal_(ss, [jRow_(L, 'Результат', { mrm: L.mrm, status: status, detail: useDetail, nextDate: useDate, comment: comment, who: who, key: key })]);
      return {
        ok: true, title: 'Результат збережено', subtitle: 'Статус: ' + status,
        nedozvon: status === 'Недозвон',
        formUrl: (FOLLOWUP_FORM_URL && FOLLOWUP_STATUSES.indexOf(status) !== -1) ? FOLLOWUP_FORM_URL : '',
      };
    }

    // Зміна відповідального: спершу запис, потім лист (помилка листа не скасовує збереження)
    const oldMrm = L.mrm;
    sh.getRange(row, CFG.COL.resp).setValue(newMrm);
    if (status) sh.getRange(row, CFG.COL.res).setValue(status);
    if (full) sh.getRange(row, CFG.COL.com).setValue(txt_(full));
    let sub = 'Відповідального не змінено.', mailNote = '';
    if (newMrm !== oldMrm) {
      L.mrm = newMrm;
      if (!EMAILS_ENABLED || !webAppUrl_()) {
        mailNote = 'лист не надіслано: розсилку вимкнено';
      } else {
        try {
          const to = sendReassignEmail_(L, newMrm, {
            byName: nameByEmail_(who) || oldMrm || who || 'Колега',
            status: status || L.status, comment: full || L.comment,
          });
          if (to) {
            markSent_(loadSent_(ss), [[L.token, L.sheetKey, 'переназначено → ' + to]]);
            mailNote = 'лист надіслано → ' + to;
          } else {
            mailNote = 'лист не надіслано: у «' + CFG.MRM_SHEET + '» немає e-mail';
          }
        } catch (err) {
          mailNote = 'лист не надіслано: ' + errText_(err);
        }
      }
      sub = 'Заявку закріплено за: ' + newMrm + '. ' + (mailNote.indexOf('лист надіслано') === 0
        ? (isTestMode_() ? 'Лист надіслано на тестову адресу.' : 'Йому надіслано лист.')
        : mailNote.charAt(0).toUpperCase() + mailNote.slice(1) + '.');
    }
    const parts = [];
    if (oldMrm && oldMrm !== newMrm) parts.push('було: ' + oldMrm);
    if (comment) parts.push(comment);
    if (mailNote) parts.push(mailNote);
    journal_(ss, [jRow_(L, 'Переназначення', { mrm: newMrm, status: status, detail: useDetail, nextDate: useDate,
      comment: parts.join('. '), who: who, key: key })]);
    if (status) sub += ' Статус: ' + status + '.';
    return { ok: true, title: 'Збережено', subtitle: sub, nedozvon: status === 'Недозвон' };
  } catch (err) {
    return { ok: false, message: 'Помилка збереження: ' + errText_(err) };
  }
}

// ============================================================
//  РУЧНІ ЗМІНИ В ТАБЛИЦІ (встановлюваний тригер «Під час редагування»)
// ============================================================
function onLeadEdit(e) {
  try {
    if (!e || !e.range) return;
    const sh = e.range.getSheet();
    const sc = sheetCfgByDst_(sh.getName());
    if (!sc) return;
    if (e.range.getNumRows() !== 1 || e.range.getNumColumns() !== 1) return;
    const r = e.range.getRow(), c = e.range.getColumn();
    if (r < CFG.FIRST_DATA_ROW || (c !== CFG.COL.resp && c !== CFG.COL.res)) return;
    SS_ = sh.getParent();
    const lead = readLead_(sheetCtx_(sh, sc), r);
    if (!lead.token) return;
    const who = (e.user && e.user.getEmail) ? str_(e.user.getEmail()) : '';
    const newV = str_(e.value !== undefined ? e.value : e.range.getValue()).trim();
    const oldV = str_(e.oldValue).trim();
    if (newV === oldV) return;
    if (c === CFG.COL.res) {
      journal_(SS_, [jRow_(lead, 'Статус змінено в таблиці', { mrm: lead.mrm, status: newV, who: who })]);
      return;
    }
    let note = oldV ? 'було: ' + oldV : '';
    if (NOTIFY_ON_MANUAL_ASSIGN && EMAILS_ENABLED && newV && webAppUrl_() && mrmEmail_(newV)) {
      const to = sendReassignEmail_(lead, newV, { byName: nameByEmail_(who) || 'Керівник', status: lead.status, comment: lead.comment });
      if (to) {
        markSent_(loadSent_(SS_), [[lead.token, sc.key, 'призначено вручну → ' + to]]);
        note += (note ? '; ' : '') + 'лист надіслано';
      }
    }
    journal_(SS_, [jRow_(lead, 'МРМ змінено в таблиці', { mrm: newV, comment: note, who: who })]);
  } catch (err) {
    Logger.log('onLeadEdit: ' + errText_(err));
  }
}

// ============================================================
//  ВИПАДАЮЧІ СПИСКИ Й КОЛЬОРИ
// ============================================================
function setupValidation_(ss) {
  MRM_REG_ = null;
  const names = mrmRegistry_().names;
  const all = ['Опрацьовано', 'Відмова', 'В процесі обробки', 'Недозвон', 'Консультації з інших питань', STATUS_NOT_TAKEN];
  CFG.SHEETS.forEach(function (sc) {
    const sh = ss.getSheetByName(sc.dst);
    if (!sh) return;
    const n = Math.max(sh.getMaxRows() - 1, 1);
    if (names.length) {
      sh.getRange(2, CFG.COL.resp, n, 1).setDataValidation(
        SpreadsheetApp.newDataValidation().requireValueInList(names, true).setAllowInvalid(true).build());
    }
    const rng = sh.getRange(2, CFG.COL.res, n, 1);
    rng.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(all, true).setAllowInvalid(true).build());
    const kept = sh.getConditionalFormatRules().filter(function (rule) {
      return !rule.getRanges().some(function (x) { return x.getColumn() === CFG.COL.res && x.getNumColumns() === 1; });
    });
    all.forEach(function (s) {
      kept.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(s)
        .setBackground(STATUS_COLORS[s] || '#d9d9d9').setRanges([rng]).build());
    });
    sh.setConditionalFormatRules(kept);
    sh.getRange(2, CFG.COL.date, n, 1).setNumberFormat('dd.MM.yyyy HH:mm');
  });
}

// ============================================================
//  ЩОДЕННИЙ ЗВІТ
// ============================================================
// пн → п’ятниця; вт → сб + нд + пн; ср–пт → попередній день; сб/нд — без звіту
function reportPeriodForToday_() {
  const t = kyivParts_(new Date());
  if (t.dow === 0 || t.dow === 6) return null;
  const base = Date.UTC(t.y, t.m, t.d);
  const dayMinus = function (n) {
    const k = new Date(base - n * MS_DAY);
    const w = k.getUTCDay();
    return { y: k.getUTCFullYear(), m: k.getUTCMonth(), d: k.getUTCDate(), dow: w, weekend: (w === 0 || w === 6) };
  };
  if (t.dow === 1) return { days: [dayMinus(3)] };
  if (t.dow === 2) return { days: [dayMinus(3), dayMinus(2), dayMinus(1)] };
  return { days: [dayMinus(1)] };
}
function buildReportData_(ss) {
  const period = reportPeriodForToday_();
  if (!period) return null;
  const dset = {};
  period.days.forEach(function (d) { dset[dayKey_(d.y, d.m, d.d)] = d; });
  const stat = { total: 0, processed: 0, notTaken: 0, byStatus: {}, mrm: {}, bySheet: {}, days: period.days };
  STATUSES.concat([STATUS_NOT_TAKEN]).forEach(function (s) { stat.byStatus[s] = 0; });
  CFG.SHEETS.forEach(function (sc) {
    stat.bySheet[sc.key] = 0;
    const sh = ss.getSheetByName(sc.dst);
    if (!sh) return;
    const last = sh.getLastRow();
    if (last < CFG.FIRST_DATA_ROW) return;
    const tz = ss.getSpreadsheetTimeZone();
    sh.getRange(CFG.FIRST_DATA_ROW, 1, last - CFG.FIRST_DATA_ROW + 1, 3).getValues().forEach(function (r) {
      const k = cellToKyivParts_(r[CFG.COL.date - 1], tz);
      if (!k) return;
      const day = dset[dayKey_(k.y, k.m, k.d)];
      if (!day) return;
      stat.total++;
      stat.bySheet[sc.key]++;
      const res = str_(r[CFG.COL.res - 1]).trim();
      if (res && res !== STATUS_NOT_TAKEN) {
        stat.processed++;
        stat.byStatus[res] = (stat.byStatus[res] || 0) + 1;
        return;
      }
      stat.notTaken++;
      stat.byStatus[STATUS_NOT_TAKEN]++;
      const nm = str_(r[CFG.COL.resp - 1]).trim() || '(без МРМ)';
      if (!stat.mrm[nm]) stat.mrm[nm] = { notTaken: 0, afterHours: 0, critical: 0 };
      stat.mrm[nm].notTaken++;
      if (day.weekend || k.hh >= WORK_DAY_END_HOUR) stat.mrm[nm].afterHours++;
      else stat.mrm[nm].critical++;
    });
  });
  return stat;
}
function fmtDayShort_(d) { return d.d + ' ' + MONTHS_SHORT[d.m]; }
function fmtDayFull_(d) { return DOW_NAMES[d.dow] + ' ' + fmtDayShort_(d); }
function reportCard_(label, value, color, sub) {
  return '<td style="background:#f5f5f0;border-radius:8px;padding:14px;width:33%;vertical-align:top;">' +
    '<p style="margin:0;font-size:12px;color:#666;">' + esc_(label) + '</p>' +
    '<p style="margin:4px 0 0;font-size:24px;font-weight:bold;color:' + color + ';">' + esc_(value) + '</p>' +
    (sub ? '<p style="margin:2px 0 0;font-size:12px;color:#999;">' + esc_(sub) + '</p>' : '') + '</td>';
}
// Вигляд — як у звіті попереднього проєкту
function reportEmailHtml_(stat) {
  const days = stat.days, first = days[0], last = days[days.length - 1];
  const periodLabel = days.length === 1 ? fmtDayFull_(first) : fmtDayFull_(first) + ' – ' + fmtDayFull_(last);
  const pct = stat.total > 0 ? Math.round(stat.processed / stat.total * 100) : 0;
  const split = CFG.SHEETS.map(function (sc) { return sc.key + ' ' + (stat.bySheet[sc.key] || 0); }).join(' · ');
  const cards = reportCard_('Надійшло', String(stat.total), '#1a1a1a', split) +
    reportCard_('Опрацьовано', String(stat.processed), '#3B6D11', '') +
    reportCard_('Не взято в роботу', String(stat.notTaken), '#854F0B', '');
  let statusRows = '';
  ['Опрацьовано', 'В процесі обробки', 'Недозвон', 'Консультації з інших питань', 'Відмова', STATUS_NOT_TAKEN].forEach(function (s) {
    statusRows += '<tr style="border-bottom:1px solid #f0f0f0;">' +
      '<td style="padding:8px 0;font-size:14px;"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:' +
      (STATUS_COLORS[s] || '#d9d9d9') + ';margin-right:8px;"></span>' + esc_(s) + '</td>' +
      '<td style="padding:8px 0;text-align:right;font-size:14px;font-weight:bold;">' + (stat.byStatus[s] || 0) + '</td></tr>';
  });
  const names = Object.keys(stat.mrm).sort(function (a, b) {
    const ma = stat.mrm[a], mb = stat.mrm[b];
    if (mb.critical !== ma.critical) return mb.critical - ma.critical;
    if (mb.notTaken !== ma.notTaken) return mb.notTaken - ma.notTaken;
    return a.localeCompare(b, 'uk');
  });
  let mrmBlock;
  if (!names.length) {
    mrmBlock = '<p style="margin:0;font-size:14px;color:#3B6D11;">Усі пропозиції взято в роботу — не взятих немає.</p>';
  } else {
    let rows = '';
    names.forEach(function (nm) {
      const m = stat.mrm[nm];
      rows += '<table role="presentation" width="100%" style="border-collapse:collapse;border-bottom:1px solid #f0f0f0;"><tr>' +
        '<td style="padding:11px 12px 11px 0;vertical-align:middle;">' +
        '<div style="font-size:14px;font-weight:bold;color:#1a1a1a;">' + esc_(nm) + '</div>' +
        '<div style="font-size:12px;color:#999;margin-top:2px;">поза робочим часом: ' + m.afterHours + '</div></td>' +
        '<td width="70" style="padding:11px 0;text-align:right;vertical-align:middle;white-space:nowrap;">' +
        '<span style="font-size:18px;font-weight:bold;color:' + (m.critical > 0 ? '#A32D2D' : '#999') + ';">' + m.critical + '</span>' +
        '<span style="font-size:13px;color:#999;">&nbsp;/&nbsp;' + m.notTaken + '</span></td></tr></table>';
    });
    mrmBlock = '<div style="background:#f5f5f0;border-radius:8px;padding:4px 14px;">' + rows + '</div>' +
      '<p style="margin:12px 2px 0;font-size:12px;color:#666;"><span style="color:#A32D2D;font-weight:bold;">Червоне</span> — критичні (робочий час, не опрацьовано). Сіре / — усього не взято.</p>';
  }
  return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;background:#fff;border:1px solid #e0ddd3;border-radius:12px;overflow:hidden;">' +
    '<div style="background:#E6F1FB;padding:16px 20px;"><p style="margin:0;font-size:16px;font-weight:bold;color:#0C447C;">Звіт по пропозиціях приміщень</p>' +
    '<p style="margin:2px 0 0;font-size:13px;color:#185FA5;">Період: ' + esc_(periodLabel) + '</p></div>' +
    '<div style="padding:20px;">' +
    '<table style="width:100%;border-collapse:separate;border-spacing:10px 0;margin:0 -10px 22px;"><tr>' + cards + '</tr></table>' +
    '<p style="margin:0 0 10px;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Розбивка за результатом</p>' +
    '<table style="width:100%;border-collapse:collapse;margin-bottom:8px;">' + statusRows + '</table>' +
    '<div style="margin:16px 0 22px;padding:12px 14px;background:#f5f5f0;border-radius:8px;">' +
    '<p style="margin:0;font-size:13px;color:#666;">Опрацьовано <b style="color:#1a1a1a;">' + pct + '%</b> пропозицій за період</p></div>' +
    '<div style="border-top:2px solid #ccc;padding-top:18px;">' +
    '<p style="margin:0 0 4px;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Не взято в роботу — по МРМ</p>' +
    '<p style="margin:0 0 14px;font-size:12px;color:#999;">Поза робочим часом = після ' + WORK_DAY_END_HOUR + ':00 у будні + весь день у вихідні</p>' +
    mrmBlock + '</div></div>' +
    '<div style="padding:12px 20px;background:#f5f5f0;border-top:1px solid #eee;"><p style="margin:0;font-size:12px;color:#999;">' +
    'Автоматичний звіт · щодня о 08:30 · Відділ аудиту та обліку стандарту середовища</p></div></div>';
}
function sendReportCore_() {
  const stat = buildReportData_(ss_());
  if (!stat) return null;
  const test = isTestMode_();
  const to = test ? [TEST_EMAIL] : REPORT_RECIPIENTS.slice();
  const days = stat.days, first = days[0], last = days[days.length - 1];
  const range = days.length === 1 ? fmtDayShort_(first) : fmtDayShort_(first) + ' – ' + fmtDayShort_(last);
  MailApp.sendEmail({
    to: to.join(','), name: MAIL_SENDER_NAME, htmlBody: reportEmailHtml_(stat),
    subject: (test ? '[ТЕСТ] ' : '') + 'Звіт по пропозиціях приміщень — за ' + range,
  });
  return { stat: stat, to: to };
}
// Тригер щодня о 08:30 (Київ)
function sendDailyReport() {
  if (!REPORTS_ENABLED) return;
  sendReportCore_();
}

// ============================================================
//  МЕНЮ
// ============================================================
function onOpen() {
  let mode = '';
  try { mode = isTestMode_() ? ' — зараз ТЕСТОВИЙ' : ' — зараз БОЙОВИЙ'; } catch (e) { /* без властивостей */ }
  SpreadsheetApp.getUi().createMenu('🏢 Пропозиції приміщень')
    .addItem('Імпортувати нові ліди зараз', 'runImportNow')
    .addItem('✉ Надіслати лист по виділеному рядку', 'resendSelected')
    .addItem('Показати ліди без МРМ', 'listUnresolved')
    .addItem('Оновити списки МРМ і статусів', 'refreshLists')
    .addSeparator()
    .addItem('ТЕСТ: лист по останньому ліду (мені)', 'testSendLastLead')
    .addItem('ТЕСТ: надіслати звіт зараз', 'testSendReport')
    .addItem('Перевірити доступ до фото', 'checkPhotoAccess')
    .addItem('Показати залишок квоти листів', 'showMailQuota')
    .addItem('Діагностика: території МРМ', 'debugTerr')
    .addItem('Діагностика: розподіл лідів', 'debugRouting')
    .addSeparator()
    .addItem('⚙ Первинне налаштування', 'setupProject')
    .addItem('Вказати URL веб-застосунку', 'setWebAppUrl')
    .addItem('Режим листів: тестовий / бойовий' + mode, 'toggleTestMode')
    .addItem('⚑ Позначити всі поточні ліди як надіслані', 'markAllCurrentAsSent')
    .addItem('Увімкнути автоматизацію', 'installTriggers')
    .addItem('Вимкнути автоматизацію', 'removeTriggers')
    .addToUi();
}

function setupProject() {
  const ui = SpreadsheetApp.getUi();
  const ans = ui.alert('Первинне налаштування',
    'Скрипт прибере формули з аркушів «' + CFG.SHEETS.map(function (s) { return s.dst; }).join('» і «') + '» і далі заповнюватиме їх сам.\n' +
    'Значення в колонках B, C, D збережуться (прив’язка за Token).\n' +
    'Листи НЕ надсилатимуться: усі наявні ліди буде позначено як надіслані.\n\nПродовжити?', ui.ButtonSet.YES_NO);
  if (ans !== ui.Button.YES) return;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { ui.alert('Зараз виконується імпорт. Спробуйте за хвилину.'); return; }
  const lines = [];
  try {
    const ss = ss_(), src = SpreadsheetApp.openById(CFG.SOURCE_ID);
    MRM_REG_ = null;
    const maps = buildMrmMaps_();
    const sent = loadSent_(ss);
    journalSheet_(ss);
    CFG.SHEETS.forEach(function (sc) {
      const sh = getOrCreateDst_(ss, sc);
      const saved = captureWork_(sh);
      sh.clearContents();
      const r = importSheet_(ss, src, sc, maps);
      const restored = restoreWork_(sh, sc, saved);
      const ctx = sheetCtx_(sh, sc);
      const entries = [], jr = [];
      if (ctx.fi.token >= 0 && ctx.lastRow >= CFG.FIRST_DATA_ROW) {
        sh.getRange(CFG.FIRST_DATA_ROW, 1, ctx.lastRow - CFG.FIRST_DATA_ROW + 1, ctx.lastCol).getValues().forEach(function (v, i) {
          const lead = leadFromDstRow_(v, ctx, CFG.FIRST_DATA_ROW + i);
          if (!lead.token || sent.set[lead.token]) return;
          entries.push([lead.token, sc.key, 'первинний імпорт — без листа']);
          jr.push(jRow_(lead, 'Імпорт без листа', { mrm: lead.mrm, who: 'налаштування' }));
        });
      }
      markSent_(sent, entries);
      journal_(ss, jr);
      lines.push('«' + sc.dst + '»: лідів ' + r.added + (restored ? ', відновлено значень у B–D: ' + restored : '') +
        (r.errors.length ? ' — ПОМИЛКА: ' + r.errors.join('; ') : ''));
    });
    setupValidation_(ss);
  } finally {
    lock.releaseLock();
  }
  ui.alert('Готово', lines.join('\n') + '\n\nДалі:\n' +
    (webAppUrl_() ? '' : '• розгорніть веб-застосунок і вкажіть URL (меню → «Вказати URL веб-застосунку»);\n') +
    '• «ТЕСТ: лист по останньому ліду» — перевірте лист і форму;\n' +
    '• «Увімкнути автоматизацію».', ui.ButtonSet.OK);
}
// Знімок B–D за Token (з будь-якої старої розкладки, де є колонка «Token»)
function captureWork_(sh) {
  const saved = {};
  const lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  if (lastRow < CFG.FIRST_DATA_ROW || !lastCol) return saved;
  const tIdx = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(normText_).indexOf('token');
  if (tIdx < 0) return saved;
  const n = lastRow - CFG.FIRST_DATA_ROW + 1;
  const tok = sh.getRange(CFG.FIRST_DATA_ROW, tIdx + 1, n, 1).getDisplayValues();
  const work = sh.getRange(CFG.FIRST_DATA_ROW, CFG.COL.resp, n, 3).getValues();
  for (let i = 0; i < n; i++) {
    const t = str_(tok[i][0]).trim();
    if (t && work[i].some(function (v) { return str_(v).trim() !== ''; })) saved[t] = work[i];
  }
  return saved;
}
function restoreWork_(sh, sc, saved) {
  if (!Object.keys(saved).length) return 0;
  const ctx = sheetCtx_(sh, sc);
  if (ctx.fi.token < 0 || ctx.lastRow < CFG.FIRST_DATA_ROW) return 0;
  const n = ctx.lastRow - CFG.FIRST_DATA_ROW + 1;
  const tok = sh.getRange(CFG.FIRST_DATA_ROW, ctx.fi.token + 1, n, 1).getValues();
  const rng = sh.getRange(CFG.FIRST_DATA_ROW, CFG.COL.resp, n, 3);
  const work = rng.getValues();
  let cnt = 0;
  for (let i = 0; i < n; i++) {
    const s = saved[str_(tok[i][0]).trim()];
    for (let f = 0; f < 3; f++) {
      if (s && str_(s[f]).trim() !== '') { work[i][f] = s[f]; cnt++; }
      if (f === 2) work[i][f] = txt_(work[i][f]);   // коментар — як текст
    }
  }
  rng.setValues(work);
  return cnt;
}

function runImportNow() {
  const ss = ss_();
  const r = importAndNotify();
  if (!r) { ss.toast('Імпорт уже виконується — спробуйте за хвилину.'); return; }
  ss.toast('Нових лідів: ' + r.added + ' · листів: ' + r.sent + (r.note ? ' · ' + r.note : '') +
    (r.errors.length ? ' · ПОМИЛКИ: ' + r.errors.join('; ') : ''), 'Імпорт', 10);
}
function resendSelected() {
  const ss = ss_(), sh = ss.getActiveSheet();
  const sc = sheetCfgByDst_(sh.getName());
  if (!sc) { ss.toast('Перейдіть на «Ліди UA» або «Ліди EN» і виділіть рядок ліда.'); return; }
  const r = sh.getActiveRange().getRow();
  if (r < CFG.FIRST_DATA_ROW) { ss.toast('Виділіть рядок ліда (з 2-го рядка).'); return; }
  if (!webAppUrl_()) { ss.toast('Спершу вкажіть URL веб-застосунку (меню).'); return; }
  const lead = readLead_(sheetCtx_(sh, sc), r);
  if (!lead.token) { ss.toast('У цьому рядку немає Token.'); return; }
  const res = sendNewLeadEmail_(lead, false);
  markSent_(loadSent_(ss), [[lead.token, sc.key, 'повторно → ' + res.to]]);
  journal_(ss, [jRow_(lead, 'Лист повторно', { mrm: lead.mrm, who: whoAmI_() })]);
  ss.toast('Лист надіслано на ' + res.to + (res.fallback ? ' (МРМ не визначено — резервна адреса)' : ''), 'Лист', 8);
}
function listUnresolved() {
  const ss = ss_(), lines = [];
  CFG.SHEETS.forEach(function (sc) {
    const sh = ss.getSheetByName(sc.dst);
    if (!sh) return;
    const ctx = sheetCtx_(sh, sc);
    if (ctx.lastRow < CFG.FIRST_DATA_ROW) return;
    sh.getRange(CFG.FIRST_DATA_ROW, 1, ctx.lastRow - CFG.FIRST_DATA_ROW + 1, ctx.lastCol).getValues().forEach(function (v, i) {
      if (str_(v[CFG.COL.resp - 1]).trim()) return;
      const L = leadFromValues_(v, ctx.fi, sc);
      lines.push('«' + sc.dst + '», рядок ' + (CFG.FIRST_DATA_ROW + i) + ': ' + (L.name || '—') + ' — ' + (L.location || 'локацію не вказано'));
    });
  });
  const ui = SpreadsheetApp.getUi();
  ui.alert('Ліди без МРМ', lines.length
    ? lines.slice(0, 40).join('\n') + (lines.length > 40 ? '\n… і ще ' + (lines.length - 40) : '')
    : 'Усі ліди мають відповідального.', ui.ButtonSet.OK);
}
function refreshLists() {
  setupValidation_(ss_());
  ss_().toast('Списки МРМ і статусів оновлено.');
}
function testSendLastLead() {
  const ss = ss_();
  if (!webAppUrl_()) { ss.toast('Спершу вкажіть URL веб-застосунку (меню).'); return; }
  let best = null;
  CFG.SHEETS.forEach(function (sc) {
    const sh = ss.getSheetByName(sc.dst);
    if (!sh) return;
    const ctx = sheetCtx_(sh, sc);
    if (ctx.lastRow < CFG.FIRST_DATA_ROW) return;
    sh.getRange(CFG.FIRST_DATA_ROW, CFG.COL.date, ctx.lastRow - CFG.FIRST_DATA_ROW + 1, 1).getValues().forEach(function (d, i) {
      const k = cellToKyivParts_(d[0], ctx.tz);
      if (!k) return;
      const s = kyivSerial_(k);
      if (!best || s >= best.s) best = { s: s, ctx: ctx, row: CFG.FIRST_DATA_ROW + i };
    });
  });
  if (!best) { ss.toast('Немає лідів із датою.'); return; }
  const lead = readLead_(best.ctx, best.row);
  const r = sendNewLeadEmail_(lead, true);
  ss.toast('Тестовий лист («' + best.ctx.sc.dst + '», рядок ' + best.row + ', ' + lead.place + ') надіслано на ' + r.to, 'Тест', 8);
}
function testSendReport() {
  const r = sendReportCore_();
  ss_().toast(r ? 'Звіт надіслано на ' + r.to.join(', ') + ' (лідів за період: ' + r.stat.total + ')' : 'Сьогодні вихідний — звіт не формується.', 'Звіт', 8);
}
function checkPhotoAccess() {
  const ss = ss_(), ui = SpreadsheetApp.getUi();
  let url = '';
  for (let s = 0; s < CFG.SHEETS.length && !url; s++) {
    const sh = ss.getSheetByName(CFG.SHEETS[s].dst);
    if (!sh) continue;
    const ctx = sheetCtx_(sh, CFG.SHEETS[s]);
    if (ctx.lastRow < CFG.FIRST_DATA_ROW || ctx.fi.photoFacade < 0) continue;
    const col = sh.getRange(CFG.FIRST_DATA_ROW, ctx.fi.photoFacade + 1, ctx.lastRow - CFG.FIRST_DATA_ROW + 1, 1).getValues();
    for (let i = col.length - 1; i >= 0 && !url; i--) url = firstUrl_(col[i][0]);
  }
  if (!url) { ui.alert('Не знайдено жодного посилання на фото.'); return; }
  const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  const code = resp.getResponseCode();
  const h = resp.getHeaders();
  const type = str_(h['Content-Type'] || h['content-type']);
  const ok = code === 200 && /^image\//i.test(type);
  const download = /attachment/i.test(str_(h['Content-Disposition'] || h['content-disposition']));
  ui.alert('Доступ до фото', (ok
    ? 'Фото відкриваються без входу в Typeform — МРМ їх побачать.' +
      (download ? '\nTypeform віддає їх як файл для завантаження, тому в листі фото йдуть вкладеннями.' : '') +
      (EMAIL_PHOTO_ATTACH ? '' : '\nВкладення фото вимкнено (EMAIL_PHOTO_ATTACH = false).')
    : 'Фото НЕ відкриваються без входу (HTTP ' + code + ', ' + (type || 'тип невідомий') + '). МРМ їх не побачать.') +
    '\n\nПеревірене посилання:\n' + url, ui.ButtonSet.OK);
}
function showMailQuota() {
  ss_().toast('Залишок листів на сьогодні: ' + MailApp.getRemainingDailyQuota(), 'Квота', 6);
}
function debugTerr() {
  MRM_REG_ = null;
  const reg = mrmRegistry_();
  const lines = reg.rows.map(function (r) {
    return r[0] + ' → ' + JSON.stringify(parseTerritory_(r[1])) + (reg.emailByName[r[0]] ? '' : '  ⚠ немає e-mail');
  });
  Logger.log(lines.join('\n'));
  const ui = SpreadsheetApp.getUi();
  ui.alert('Території МРМ (L/R — берег, null — уся область)', lines.join('\n') || 'Аркуш порожній.', ui.ButtonSet.OK);
}
function debugRouting() {
  const ss = ss_(), maps = buildMrmMaps_(), lines = [];
  CFG.SHEETS.forEach(function (sc) {
    const sh = ss.getSheetByName(sc.dst);
    if (!sh) return;
    const ctx = sheetCtx_(sh, sc);
    if (ctx.lastRow < CFG.FIRST_DATA_ROW) return;
    sh.getRange(CFG.FIRST_DATA_ROW, 1, ctx.lastRow - CFG.FIRST_DATA_ROW + 1, ctx.lastCol).getValues().forEach(function (v, i) {
      const L = leadFromValues_(v, ctx.fi, sc);
      const c = candidatesForLead_(L, maps);
      lines.push(sc.key + ' р.' + (CFG.FIRST_DATA_ROW + i) + ' | ' + (L.location || '—') + ' | ключ ' + (c.key || '—') +
        (c.bank ? '/' + c.bank : '') + ' | кандидати: ' + (c.names.join(', ') || '—') +
        ' | обрано: ' + (chooseName_(c.names, L.token) || '—') + ' | у B: ' + (str_(v[CFG.COL.resp - 1]) || '—'));
    });
  });
  Logger.log(lines.join('\n'));
  const ui = SpreadsheetApp.getUi();
  ui.alert('Розподіл лідів (останні 30)', lines.slice(-30).join('\n') || 'Немає лідів.', ui.ButtonSet.OK);
}
function setWebAppUrl() {
  const ui = SpreadsheetApp.getUi();
  const cur = webAppUrl_();
  const r = ui.prompt('URL веб-застосунку',
    'Розгортання → Керування розгортаннями → Веб-застосунок → URL (закінчується на /exec).' + (cur ? '\n\nЗараз: ' + cur : ''),
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const url = normalizeWebAppUrl_(str_(r.getResponseText()).trim().replace(/[?#].*$/, ''));
  if (!/^https:\/\/script\.google\.com\/\S+\/exec$/.test(url)) {
    ui.alert('Це не схоже на URL веб-застосунку: він починається з https://script.google.com/ і закінчується на /exec.');
    return;
  }
  PropertiesService.getScriptProperties().setProperty('WEB_APP_URL', url);
  ss_().toast('URL веб-застосунку збережено: ' + url, 'URL', 8);
}
function toggleTestMode() {
  const ui = SpreadsheetApp.getUi();
  const nowTest = isTestMode_();
  const ans = ui.alert(nowTest ? 'Увімкнути БОЙОВИЙ режим?' : 'Повернути ТЕСТОВИЙ режим?',
    nowTest
      ? 'Листи про нові ліди підуть МРМ, ліди без МРМ — на ' + FALLBACK_EMAIL + ', звіт — на ' + REPORT_RECIPIENTS.join(', ') + '.'
      : 'Усі листи й звіт ітимуть лише на ' + TEST_EMAIL + '.', ui.ButtonSet.YES_NO);
  if (ans !== ui.Button.YES) return;
  PropertiesService.getScriptProperties().setProperty('TEST_MODE', nowTest ? 'false' : 'true');
  ss_().toast('Режим листів: ' + (nowTest ? 'БОЙОВИЙ' : 'ТЕСТОВИЙ') + '. Оновіть сторінку, щоб меню показало новий режим.', 'Режим', 8);
}
function markAllCurrentAsSent() {
  const ss = ss_(), sent = loadSent_(ss), entries = [];
  CFG.SHEETS.forEach(function (sc) {
    const sh = ss.getSheetByName(sc.dst);
    if (!sh) return;
    const ctx = sheetCtx_(sh, sc);
    if (ctx.fi.token < 0 || ctx.lastRow < CFG.FIRST_DATA_ROW) return;
    sh.getRange(CFG.FIRST_DATA_ROW, ctx.fi.token + 1, ctx.lastRow - CFG.FIRST_DATA_ROW + 1, 1).getValues().forEach(function (r) {
      const t = str_(r[0]).trim();
      if (t && !sent.set[t]) entries.push([t, sc.key, 'позначено вручну — без листа']);
    });
  });
  const cnt = entries.length;
  markSent_(sent, entries);
  ss.toast('Позначено як надіслані (без листів): ' + cnt + '. Далі листи підуть лише по нових лідах.', 'Готово', 8);
}
function installTriggers() {
  removeTriggers_();
  const ss = ss_();
  ScriptApp.newTrigger('importAndNotify').timeBased().everyMinutes(10).create();
  ScriptApp.newTrigger('sendDailyReport').timeBased().atHour(8).nearMinute(30).everyDays(1).inTimezone(KYIV_TZ).create();
  ScriptApp.newTrigger('onLeadEdit').forSpreadsheet(ss).onEdit().create();
  const r = importAndNotify();
  ss.toast('Імпорт кожні 10 хв, звіт о 08:30, облік ручних змін. ' +
    (r ? 'Нових лідів: ' + r.added + ', листів: ' + r.sent + (r.note ? ' (' + r.note + ')' : '') + '. ' : '') +
    'Режим листів: ' + (isTestMode_() ? 'ТЕСТОВИЙ' : 'БОЙОВИЙ') + '.', 'Автоматизацію ввімкнено', 12);
}
function removeTriggers() {
  removeTriggers_();
  ss_().toast('Автоматизацію вимкнено.');
}
function removeTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (TRIGGER_FUNCS.indexOf(t.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(t);
  });
}