/**
 * ============================================================
 *  ФАЙЛ Code.gs
 *  Скрипт для нової таблиці "Ліди для МРМ" (25+ колонок)
 * ============================================================
 */

// ---- Основні налаштування ----
const CFG   = { sheetName: 'Ліди для МРМ', firstDataRow: 2 };

// Робочі поля (куди пишемо ми): А, В, С
const WORK  = { respCol: 1, resCol: 2, comCol: 3 };

// Поля для генерації унікального ключа
// Ключ = Timestamp + Телефон працівника + Телефон власника
const SRC   = { dateCol: 4, empTelCol: 7, ownTelCol: 9 };

// Територія (Область, Місто)
const TERR  = { oblCol: 11, cityCol: 12 };

// Сховище та налаштування МРМ
const STORE = { sheetName: '_Сховище' };
const MRM   = { terrSheet: 'Територія МРМ' };
const MRM_EMAIL_COL = 3;

// ---- Веб-форма / листи ----
const WEB_APP_URL = 'https://script.google.com/a/macros/novaposhta.ua/s/AKfycbxqIdWc5wIcyjgMX9bGySsM9JpHQD62VQAudjFwofSVMljMF2j7sIixxCz-jODr0nQZ/exec'; 
const EMAILS_ENABLED = true;
const TEST_MODE = false;
const TEST_EMAIL = 'gurin.vv@novaposhta.ua';

// ---- Щоденний звіт ----
const REPORTS_ENABLED = true; 
const REPORT_RECIPIENTS = ['gurin.vv@novaposhta.ua'];
const KYIV_UTC_OFFSET = 3; 
const WORK_DAY_END_HOUR = 18;

// Індекси всіх полів ліда для читання (з 4 по 25)
const LEAD = {
  ts: 4, empName: 5, empPos: 6, empTel: 7,
  ownName: 8, ownTel: 9, ownType: 10,
  obl: 11, city: 12, address: 13, mapsLink: 14,
  type: 15, area: 16, price: 17, state: 18,
  entrance: 19, truck: 20, parking: 21,
  dateAvail: 22, adLink: 23, photos: 24, extra: 25
};

// Корені областей
const OBLAST_ROOTS = [
  ['kyiv_oblast',     ['київськ']],
  ['kyiv_city',       ['київ', 'киев']], // Додав місто Київ окремо для зручності
  ['kharkiv',         ['харків','kharkiv']],
  ['zhytomyr',        ['житомир','zhytomyr']],
  ['vinnytsia',       ['вінниц','vinnyts']],
  ['khmelnytskyi',    ['хмельниц','khmelnyts']],
  ['chernihiv',       ['чернігів','chernihiv']],
  ['dnipro',          ['дніпропетров','dnipropetrov','дніпро']],
  ['zaporizhzhia',    ['запор','zaporiz']],
  ['rivne',           ['рівн','rivne']],
  ['volyn',           ['волин','volyn']],
  ['ternopil',        ['тернопіл','ternopil']],
  ['chernivtsi',      ['чернівец','чернівц','chernivts']],
  ['mykolaiv',        ['микола','mykolaiv']],
  ['kherson',         ['херсон','kherson']],
  ['lviv',            ['львів','lviv']],
  ['odesa',           ['одес','odes']],
  ['kirovohrad',      ['кіровоград','kirovohrad']],
  ['cherkasy',        ['черкас','cherkas']],
  ['ivano-frankivsk', ['івано-франків','франків','ivano-frankiv']],
  ['zakarpattia',     ['закарпат','zakarpat']],
  ['poltava',         ['полтав','poltav']],
  ['sumy',            ['сумськ','sumsk','суми']],
  ['donetsk',         ['донецьк','donetsk']],
  ['luhansk',         ['луганськ','luhansk']],
];

// ---------- Меню ----------
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🔄 Скрипт МРМ')
    .addItem('Перебудувати робочі (зараз)', 'rebuildWorking')
    .addItem('Налаштувати статуси (B)', 'setupStatusDropdown')
    .addSeparator()
    .addItem('ТЕСТ: лист по останньому ліду', 'testSendLastLead')
    .addItem('ТЕСТ: надіслати звіт зараз', 'testSendReport')
    .addSeparator()
    .addItem('Увімкнути автосинхронізацію (10 хв)', 'installTriggers')
    .addItem('Вимкнути автосинхронізацію', 'removeTriggers')
    .addItem('Увімкнути щоденний звіт (08:30)', 'installReportTrigger')
    .addItem('Вимкнути щоденний звіт', 'removeReportTrigger')
    .addToUi();
}

// ---------- Утиліти ----------
function keyOf_(ts, empTel, ownTel) {
  const t = (ts instanceof Date) ? ts.toISOString() : String(ts == null ? '' : ts).trim();
  const e1 = String(empTel == null ? '' : empTel).replace(/[^\d+]/g, '');
  const e2 = String(ownTel == null ? '' : ownTel).replace(/[^\d+]/g, '');
  if (!t) return '';
  return t + '||' + e1 + '||' + e2;
}
function norm_(x) { return (x === null || x === undefined) ? '' : x; }
function pick_(ov, src) {
  if (ov !== '' && ov !== null && ov !== undefined) return ov;
  return (src === null || src === undefined) ? '' : src;
}
function strip_(x) { return String(x == null ? '' : x).replace(/[’'ʼ`ʹ]/g, ''); }
function esc_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function encKey_(key) { return Utilities.base64EncodeWebSafe(Utilities.newBlob(key).getBytes()); }
function decKey_(token) {
  try { return Utilities.newBlob(Utilities.base64DecodeWebSafe(token)).getDataAsString(); }
  catch (e) { return ''; }
}
function telHref_(raw) {
  const digits = String(raw == null ? '' : raw).replace(/[^\d+]/g, '');
  return digits ? ('tel:' + digits) : '';
}

// Чесний Round-Robin розподіл (по черзі)
function chooseMrmRR_(candidates) {
  if (!candidates || candidates.length === 0) return '';
  if (candidates.length === 1) return candidates[0];
  candidates.sort(); // Завжди однаковий порядок
  const pKey = 'RR_IDX_' + candidates.join('|');
  const props = PropertiesService.getScriptProperties();
  let idx = parseInt(props.getProperty(pKey), 10) || 0;
  if (idx >= candidates.length) idx = 0;
  const chosen = candidates[idx];
  props.setProperty(pKey, String((idx + 1) % candidates.length));
  return chosen;
}

// ---------- Сховище ----------
function loadStorage_(ss) {
  let sh = ss.getSheetByName(STORE.sheetName);
  if (!sh) {
    sh = ss.insertSheet(STORE.sheetName);
    sh.getRange(1, 1, 1, 4).setValues([['key', 'Відповідальний', 'Результат', 'Коментар']]);
    sh.hideSheet();
  }
  const last = sh.getLastRow();
  const order = [], map = {};
  if (last >= 2) {
    const vals = sh.getRange(2, 1, last - 1, 4).getValues();
    for (let i = 0; i < vals.length; i++) {
      const k = String(vals[i][0]);
      if (k === '') continue;
      if (!(k in map)) order.push(k);
      map[k] = [vals[i][1], vals[i][2], vals[i][3]];
    }
  }
  return { sheet: sh, order: order, map: map };
}
function saveStorage_(store) {
  const sh = store.sheet;
  const rows = [];
  for (let i = 0; i < store.order.length; i++) {
    const k = store.order[i], v = store.map[k];
    if (!v) continue;
    const a = norm_(v[0]), b = norm_(v[1]), c = norm_(v[2]);
    if (a === '' && b === '' && c === '') continue;
    rows.push([k, a, b, c]);
  }
  const last = sh.getLastRow();
  if (last >= 2) sh.getRange(2, 1, last - 1, 4).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, 4).setValues(rows);
}
function setField_(store, key, fieldIdx, value) {
  let v = store.map[key];
  if (!v) { v = ['', '', '']; store.map[key] = v; store.order.push(key); }
  v[fieldIdx] = (value === null || value === undefined) ? '' : value;
}

// ---------- Території ----------
function pushUniq_(arr, name) { if (arr.indexOf(name) === -1) arr.push(name); }
function buildMrmMaps() {
  const sh = SpreadsheetApp.getActive().getSheetByName(MRM.terrSheet);
  const maps = {};
  if (!sh) return maps;
  const last = sh.getLastRow();
  if (last < 2) return maps;
  const vals = sh.getRange(2, 1, last - 1, 2).getValues();
  for (const row of vals) {
    const name = String(row[0]).trim();
    const terr = String(row[1]).toLowerCase();
    if (!name || !terr) continue;
    
    // Шукаємо корені областей
    for (const [key, roots] of OBLAST_ROOTS) {
      for (const r of roots) {
        if (terr.indexOf(r) !== -1) {
          maps[key] = maps[key] || [];
          pushUniq_(maps[key], name);
          break;
        }
      }
    }
  }
  for (const k in maps) maps[k].sort();
  return maps;
}
function candidatesForLocation_(obl, city, maps) {
  const text = (String(obl) + ' ' + String(city)).toLowerCase();
  
  // Пріоритет місту Київ
  if (text.indexOf('київ') !== -1 && text.indexOf('київськ') === -1) {
      if (maps['kyiv_city']) return maps['kyiv_city'];
  }
  
  for (const [key, roots] of OBLAST_ROOTS) {
    for (const r of roots) {
      if (text.indexOf(r) !== -1) {
        return maps[key] || [];
      }
    }
  }
  return [];
}

// ---------- Читання ліда ----------
function findLeadRowByKey_(sh, key) {
  const lastRow = sh.getLastRow();
  const n = lastRow - CFG.firstDataRow + 1;
  if (n < 1) return -1;
  const tsCol = sh.getRange(CFG.firstDataRow, SRC.dateCol, n, 1).getValues();
  const t1Col = sh.getRange(CFG.firstDataRow, SRC.empTelCol, n, 1).getValues();
  const t2Col = sh.getRange(CFG.firstDataRow, SRC.ownTelCol, n, 1).getValues();
  for (let i = 0; i < n; i++) {
    if (keyOf_(tsCol[i][0], t1Col[i][0], t2Col[i][0]) === key) return CFG.firstDataRow + i;
  }
  return -1;
}
function readLead_(sh, row) {
  const vals = sh.getRange(row, 1, 1, 25).getValues()[0];
  const g = c => vals[c - 1]; // індексація з 0
  return {
    ts: g(LEAD.ts), empName: g(LEAD.empName), empPos: g(LEAD.empPos), empTel: g(LEAD.empTel),
    ownName: g(LEAD.ownName), ownTel: g(LEAD.ownTel), ownType: g(LEAD.ownType),
    obl: g(LEAD.obl), city: g(LEAD.city), address: g(LEAD.address), mapsLink: g(LEAD.mapsLink),
    type: g(LEAD.type), area: g(LEAD.area), price: g(LEAD.price), state: g(LEAD.state),
    entrance: g(LEAD.entrance), truck: g(LEAD.truck), parking: g(LEAD.parking),
    dateAvail: g(LEAD.dateAvail), adLink: g(LEAD.adLink), photos: g(LEAD.photos), extra: g(LEAD.extra)
  };
}
function allMrmNames_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(MRM.terrSheet);
  const out = [];
  if (!sh) return out;
  const last = sh.getLastRow();
  if (last < 2) return out;
  const vals = sh.getRange(2, 1, last - 1, 1).getValues();
  for (const r of vals) { const nm = String(r[0]).trim(); if (nm && out.indexOf(nm) === -1) out.push(nm); }
  out.sort(); return out;
}
function mrmEmailByName_(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(MRM.terrSheet);
  if (!sh || !name) return '';
  const last = sh.getLastRow();
  if (last < 2) return '';
  const vals = sh.getRange(2, 1, last - 1, MRM_EMAIL_COL).getValues();
  for (const r of vals) if (String(r[0]).trim() === String(name).trim()) return String(r[MRM_EMAIL_COL - 1]).trim();
  return '';
}

// ---------- Захоплення ручних правок ----------
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    const sh = e.range.getSheet();
    if (sh.getName() !== CFG.sheetName) return;
    const c0 = e.range.getColumn(), r0 = e.range.getRow();
    const nc = e.range.getNumColumns(), nr = e.range.getNumRows();
    const colStart = Math.max(c0, WORK.respCol);
    const colEnd   = Math.min(c0 + nc - 1, WORK.comCol);
    if (colStart > colEnd) return;
    const rowStart = Math.max(r0, CFG.firstDataRow);
    const rowEnd   = r0 + nr - 1;
    if (rowStart > rowEnd) return;
    
    const ss = sh.getParent();
    const cnt = rowEnd - rowStart + 1;
    
    const fullBlock = sh.getRange(rowStart, 1, cnt, 10).getValues();
    const store = loadStorage_(ss);
    
    for (let i = 0; i < cnt; i++) {
      const key = keyOf_(fullBlock[i][SRC.dateCol-1], fullBlock[i][SRC.empTelCol-1], fullBlock[i][SRC.ownTelCol-1]);
      if (!key) continue;
      for (let c = colStart; c <= colEnd; c++) {
        const fld = c - WORK.respCol;
        let val = fullBlock[i][c-1];
        setField_(store, key, fld, val);
      }
    }
    saveStorage_(store);
  } catch (err) {}
}

// ---------- Перебудова A/B/C ----------
function rebuildWorking() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(CFG.sheetName);
  if (!sh) return;
  const lastRow = sh.getLastRow();
  const n = lastRow - CFG.firstDataRow + 1;
  if (n < 1) return;

  // Читаємо необхідні блоки (1 по 12 колонку включно)
  const block = sh.getRange(CFG.firstDataRow, 1, n, 12).getValues();
  let qCount = 0;
  for (let i = 0; i < n; i++) if (String(block[i][SRC.dateCol-1]).trim() !== '') qCount = i + 1;

  const maps = buildMrmMaps();
  const store = loadStorage_(ss);
  const out = new Array(n);
  
  for (let i = 0; i < n; i++) {
    if (i < qCount) {
      const rowData = block[i];
      const recKey = keyOf_(rowData[SRC.dateCol-1], rowData[SRC.empTelCol-1], rowData[SRC.ownTelCol-1]);
      const ov = store.map[recKey];
      
      const nOv = ov ? ov[0] : '';
      let nVal;
      // Якщо в сховищі вже є призначений МРМ, беремо його.
      // Якщо ні — призначаємо (Round-Robin).
      if (nOv !== '' && nOv !== null && nOv !== undefined) {
        nVal = nOv;
      } else {
        const cands = candidatesForLocation_(rowData[TERR.oblCol-1], rowData[TERR.cityCol-1], maps);
        nVal = chooseMrmRR_(cands);
        // Зберігаємо вибір у сховище
        if (nVal) setField_(store, recKey, 0, nVal);
      }
      
      out[i] = [ nVal, pick_(ov ? ov[1] : '', rowData[WORK.resCol-1]), pick_(ov ? ov[2] : '', rowData[WORK.comCol-1]) ];
    } else {
      out[i] = ['', '', ''];
    }
  }
  
  saveStorage_(store); // Зберігаємо нові призначення
  sh.getRange(CFG.firstDataRow, WORK.respCol, n, 3).setValues(out);

  try {
    const keysArr = [], mrmArr = [];
    for (let i = 0; i < n; i++) {
      if (i < qCount) {
        keysArr.push(keyOf_(block[i][SRC.dateCol-1], block[i][SRC.empTelCol-1], block[i][SRC.ownTelCol-1]));
        mrmArr.push(out[i][0]);
      } else { keysArr.push(''); mrmArr.push(''); }
    }
    notifyNewLeads_(ss, sh, keysArr, mrmArr);
  } catch (err) {}
}

// ---------- Статуси ----------
function statusOptions_() {
  return ['Відмова','В процесі обробки','Опрацьовано','Недозвон','Консультації з інших питань'];
}
function setupStatusDropdown() {
  const sh = SpreadsheetApp.getActive().getSheetByName(CFG.sheetName);
  if (!sh) return;
  const options = [
    { text: 'Опрацьовано', bg: '#b6d7a8' }, { text: 'Відмова', bg: '#ea9999' },
    { text: 'В процесі обробки', bg: '#ffe599' }, { text: 'Недозвон', bg: '#f9cb9c' },
    { text: 'Консультації з інших питань', bg: '#a4c2f4' }, { text: 'Не взято в роботу', bg: '#d9d9d9' },
  ];
  const rng = sh.getRange(2, WORK.resCol, 1000, 1);
  const rule = SpreadsheetApp.newDataValidation().requireValueInList(options.map(o => o.text), true).setAllowInvalid(true).build();
  rng.setDataValidation(rule);
  
  const kept = sh.getConditionalFormatRules().filter(r =>
    !r.getRanges().some(x => x.getColumn() === WORK.resCol && x.getNumColumns() === 1));
  options.forEach(o => kept.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo(o.text).setBackground(o.bg).setRanges([rng]).build()));
  sh.setConditionalFormatRules(kept);
  SpreadsheetApp.getActive().toast('Список статусів і кольори налаштовано.');
}

// ============================================================
//  ВЕБ-ФОРМА (через google.script.run — Form.html)
// ============================================================
function doGet(e) {
  const token  = (e && e.parameter && e.parameter.key)    ? e.parameter.key    : '';
  const action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'respawn';
  const key = decKey_(token);
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(CFG.sheetName);
  const row = key ? findLeadRowByKey_(sh, key) : -1;

  const t = HtmlService.createTemplateFromFile('Form');
  t.notFound = (row === -1);
  t.token = token;
  t.action = (action === 'result') ? 'result' : 'respawn';
  t.statuses = statusOptions_();
  t.mrmNames = allMrmNames_();

  if (row === -1) {
    t.lead = {}; t.cur = { mrm:'', result:'', comment:'' };
  } else {
    const lead = readLead_(sh, row);
    const store = loadStorage_(ss);
    const ov = store.map[key] || ['', '', ''];
    
    // Форматування дати
    let fDate = lead.ts;
    if (fDate instanceof Date) fDate = fDate.toLocaleString('uk-UA');
    else fDate = String(fDate);
    
    // Форматування дати доступності
    let aDate = lead.dateAvail;
    if (aDate instanceof Date) {
      aDate = ('0'+aDate.getDate()).slice(-2) + '.' + ('0'+(aDate.getMonth()+1)).slice(-2) + '.' + aDate.getFullYear();
    }
    
    t.lead = {
      ts: fDate, empName: esc_(lead.empName), empPos: esc_(lead.empPos), 
      empTel: esc_(lead.empTel), empTelHref: telHref_(lead.empTel),
      ownName: esc_(lead.ownName), ownTel: esc_(lead.ownTel), ownTelHref: telHref_(lead.ownTel), ownType: esc_(lead.ownType),
      obl: esc_(lead.obl), city: esc_(lead.city), address: esc_(lead.address), mapsLink: esc_(lead.mapsLink),
      type: esc_(lead.type), area: esc_(lead.area), price: esc_(lead.price), state: esc_(lead.state),
      entrance: esc_(lead.entrance), truck: esc_(lead.truck), parking: esc_(lead.parking),
      dateAvail: esc_(aDate), adLink: esc_(lead.adLink), extra: esc_(lead.extra),
      photosRaw: String(lead.photos || '')
    };
    t.cur = { mrm: ov[0] || '', result: ov[1] || '', comment: ov[2] || '' };
  }
  return t.evaluate()
    .setTitle('Заявка на оренду')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function saveForm(payload) {
  payload = payload || {};
  const token = payload.token || '';
  const action = payload.action || '';
  const key = decKey_(token);
  if (!key) return { ok: false, message: 'Недійсне посилання (немає ключа).' };

  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(CFG.sheetName);
  const row = findLeadRowByKey_(sh, key);
  if (row === -1) return { ok: false, message: 'Заявку не знайдено (можливо, запис видалено).' };

  const store = loadStorage_(ss);
  const res = (payload.result || '').trim();
  const com = (payload.comment || '').trim();

  if (action === 'respawn') {
    const prevMrm = store.map[key] ? store.map[key][0] : ''; // запам'ятовуємо старого МРМ
    const newMrm = (payload.mrm || '').trim();
    
    setField_(store, key, 0, newMrm);
    if (res) setField_(store, key, 1, res);
    if (com) setField_(store, key, 2, com);
    saveStorage_(store);
    
    sh.getRange(row, WORK.respCol).setValue(newMrm);
    if (res) sh.getRange(row, WORK.resCol).setValue(res);
    if (com) sh.getRange(row, WORK.comCol).setValue(com);
    
    // Надсилаємо лист новому МРМ, якщо відповідальний змінився
    if (newMrm && newMrm !== prevMrm) {
      try {
        const lead = readLead_(sh, row);
        sendReassignEmail_(lead, token, prevMrm, newMrm);
      } catch (err) {}
    }
    
    let sub = newMrm ? ('Заявку закріплено за: ' + newMrm) : '';
    if (res) sub += (sub ? ' · ' : '') + 'Результат: ' + res;
    return { ok: true, title: 'Збережено', subtitle: sub };
  }

  if (action === 'result') {
    if (res) setField_(store, key, 1, res);
    if (com) setField_(store, key, 2, com);
    saveStorage_(store);
    if (res) sh.getRange(row, WORK.resCol).setValue(res);
    if (com) sh.getRange(row, WORK.comCol).setValue(com);
    return { ok: true, title: 'Результат збережено', subtitle: res ? ('Статус: ' + res) : '' };
  }
  return { ok: false, message: 'Невідома дія.' };
}

// ============================================================
//  ЛИСТИ МРМ
// ============================================================
function formUrl_(token, action) {
  return WEB_APP_URL + '?key=' + encodeURIComponent(token) + '&action=' + action;
}

// Парсер фотографій для генерації кнопок у листі та мініатюр у формі
function parsePhotosHtml_(rawString, isEmail) {
  if (!rawString) return 'Немає фото';
  const links = rawString.split(',').map(s => s.trim()).filter(Boolean);
  if (links.length === 0) return 'Немає фото';
  
  let html = '';
  if (!isEmail) html += '<div class="photo-carousel">';
  else html += '<div style="margin-top:8px;">';

  links.forEach((link, idx) => {
    const m = link.match(/id=([^&]+)/) || link.match(/\/d\/([a-zA-Z0-9_-]+)/);
    const id = m ? m[1] : null;
    const num = idx + 1;
    
    if (isEmail) {
      // Для листа: замість битих картинок робимо красиві кнопки
      html += `<a href="${link}" target="_blank" style="display:inline-block;background:#E6F1FB;color:#185FA5;padding:8px 12px;border-radius:6px;margin:0 6px 6px 0;text-decoration:none;font-size:13px;font-weight:bold;border:1px solid #cce0f5;">🖼️ Фото ${num}</a>`;
    } else {
      // Для веб-форми: залишаємо спробу показати мініатюру
      if (id) {
        const thumbUrl = 'https://drive.google.com/thumbnail?id=' + id + '&sz=w300-h200';
        html += `<a href="${link}" target="_blank" class="photo-item"><img src="${thumbUrl}" alt="Фото ${num}"></a>`;
      } else {
        html += `<a href="${link}" target="_blank" class="photo-item link-only">🔗 Відкрити лінк ${num}</a>`;
      }
    }
  });
  html += '</div>';
  return html;
}

function linkHtml_(url, label) {
  if (!url || url.indexOf('http') === -1) return esc_(url);
  return `<a href="${url}" style="color:#185FA5;text-decoration:none;">${label} ↗</a>`;
}

function leadEmailHtml_(lead, token) {
  let fDate = lead.ts;
  if (fDate instanceof Date) fDate = fDate.toLocaleString('uk-UA');

  const telE = lead.empTel ? `<a href="${telHref_(lead.empTel)}" style="color:#185FA5;text-decoration:none;font-weight:bold;">${esc_(lead.empTel)}</a>` : '';
  const telO = lead.ownTel ? `<a href="${telHref_(lead.ownTel)}" style="color:#185FA5;text-decoration:none;font-weight:bold;">${esc_(lead.ownTel)}</a>` : '';
  
  const photosBlock = parsePhotosHtml_(lead.photos, true);

  const rowHtml = (k, vHtml) => {
    if (!vHtml || vHtml === 'undefined') return '';
    return `<tr><td style="padding:8px 0;color:#777;width:35%;vertical-align:top;border-bottom:1px dashed #f0f0f0;">${esc_(k)}</td><td style="padding:8px 0;color:#1a1a1a;font-weight:500;border-bottom:1px dashed #f0f0f0;">${vHtml}</td></tr>`;
  };
  const secTitle = t => `<tr><td colspan="2" style="padding:24px 0 4px;font-size:12px;color:#888;text-transform:uppercase;font-weight:bold;letter-spacing:0.5px;border-bottom:1px solid #eee;">${t}</td></tr>`;

  let rows = ''
    + secTitle('Працівник (Хто надав)')
    + rowHtml('ПІБ', esc_(lead.empName)) + rowHtml('Посада', esc_(lead.empPos)) + rowHtml('Телефон', telE)
    + secTitle('Власник / Представник')
    + rowHtml('ПІБ', esc_(lead.ownName)) + rowHtml('Телефон', telO) + rowHtml('Статус', esc_(lead.ownType))
    + secTitle('Локація')
    + rowHtml('Область', esc_(lead.obl)) + rowHtml('Місто', esc_(lead.city)) + rowHtml('Адреса', esc_(lead.address))
    + rowHtml('На карті', linkHtml_(lead.mapsLink, 'Google Maps'))
    + secTitle('Характеристики')
    + rowHtml('Тип приміщення', esc_(lead.type)) + rowHtml('Площа', esc_(lead.area)) + rowHtml('Вартість', esc_(lead.price))
    + rowHtml('Стан', esc_(lead.state)) + rowHtml('Окремий вхід', esc_(lead.entrance))
    + rowHtml('Під\'їзд авто', esc_(lead.truck)) + rowHtml('Паркування', esc_(lead.parking))
    + rowHtml('Доступно з', esc_(lead.dateAvail))
    + secTitle('Додатково')
    + rowHtml('Оголошення', linkHtml_(lead.adLink, 'Перейти'))
    + rowHtml('Інформація', esc_(lead.extra));

  const btnHtml = (url, label, bg, fg, outline) => `<a href="${url}" style="display:inline-block;padding:11px 20px;background:${bg};color:${fg};border:${outline?'1px solid #185FA5':'none'};border-radius:8px;text-decoration:none;font-size:14px;font-weight:bold;">${esc_(label)}</a>`;

  return ''
    + '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;background:#fff;border:1px solid #e0ddd3;border-radius:12px;overflow:hidden;">'
    + '<div style="background:#E6F1FB;padding:16px 20px;"><h1 style="margin:0;font-size:18px;color:#0C447C;">Нова заявка на оренду</h1>'
    + `<p style="margin:4px 0 0;font-size:13px;color:#185FA5;">Надійшла: ${esc_(fDate)} · ${esc_(lead.city)}</p></div>`
    + '<div style="padding:20px;">'
    + '<table style="width:100%;border-collapse:collapse;font-size:14px;">' + rows + '</table>'
    + '<div style="margin-top:16px;"><span style="font-size:12px;color:#888;text-transform:uppercase;font-weight:bold;">Фотографії</span><br>' + photosBlock + '</div>'
    + '<div style="margin-top:24px;">'
    + btnHtml(formUrl_(token, 'result'), 'Вказати результат', '#185FA5', '#fff', false) + '&nbsp;&nbsp;'
    + btnHtml(formUrl_(token, 'respawn'), 'Змінити МРМ', '#fff', '#185FA5', true)
    + '</div></div>'
    + '<div style="padding:12px 20px;background:#f5f5f0;border-top:1px solid #eee;"><p style="margin:0;font-size:12px;color:#999;">Автоматичне сповіщення</p></div></div>';
}

function resolveRecipient_(mrmName) { return TEST_MODE ? TEST_EMAIL : mrmEmailByName_(mrmName); }
function sendNewLeadEmail_(lead, token, mrmName) {
  const to = resolveRecipient_(mrmName);
  if (!to) return false;
  const subj = (TEST_MODE ? '[ТЕСТ] ' : '') + 'Нова заявка на оренду — ' + String(lead.city || 'Місто не вказано');
  MailApp.sendEmail({ to: to, subject: subj, htmlBody: leadEmailHtml_(lead, token) });
  return true;
}

function sendReassignEmail_(lead, token, oldMrm, newMrm) {
  const to = resolveRecipient_(newMrm);
  if (!to) return false;
  const subj = (TEST_MODE ? '[ТЕСТ] ' : '') + 'Вам переназначено заявку на оренду — ' + String(lead.city || '');
  
  // Додаємо банер про те, що це перепризначення
  let html = leadEmailHtml_(lead, token);
  const banner = `<div style="background:#FAEEDA;padding:14px 20px;border-bottom:1px solid #e0ddd3;"><p style="margin:0;font-size:14px;color:#854F0B;"><b>${oldMrm || 'Колега'}</b> переназначив(ла) цю заявку на вас.</p></div>`;
  html = html.replace('<div style="padding:20px;">', banner + '<div style="padding:20px;">');
  
  MailApp.sendEmail({ to: to, subject: subj, htmlBody: html });
  return true;
}

// ---------- Антидубль ----------
const SENT = { sheetName: '_Надіслані' };
function loadSent_(ss) {
  let sh = ss.getSheetByName(SENT.sheetName);
  if (!sh) { sh = ss.insertSheet(SENT.sheetName); sh.getRange(1,1,1,2).setValues([['key','sentAt']]); sh.hideSheet(); }
  const last = sh.getLastRow(); const set = {};
  if (last >= 2) { const v = sh.getRange(2,1,last-1,1).getValues(); for (const r of v) if (r[0]) set[String(r[0])] = true; }
  return { sheet: sh, set: set };
}
function markSent_(sentObj, key) { sentObj.set[key] = true; sentObj.sheet.appendRow([key, new Date()]); }

function notifyNewLeads_(ss, sh, keys, mrmByRow) {
  if (!EMAILS_ENABLED) return;
  if (!WEB_APP_URL || WEB_APP_URL.indexOf('ВСТАВ') === 0) return;
  const sent = loadSent_(ss);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (!key || sent.set[key]) continue;
    const mrmName = mrmByRow[i];
    if (!mrmName) continue;
    const row = findLeadRowByKey_(sh, key);
    if (row === -1) continue;
    const lead = readLead_(sh, row);
    try { if (sendNewLeadEmail_(lead, encKey_(key), mrmName)) markSent_(sent, key); } catch (err) {}
  }
}

// ============================================================
//  ЩОДЕННИЙ ЗВІТ
// ============================================================
function isProcessedStatus_(s) { const v = String(s == null ? '' : s).trim(); return v !== ''; }
function toKyiv_(rawDate) {
  let d;
  if (rawDate instanceof Date) d = rawDate;
  else { const t = Date.parse(String(rawDate)); if (isNaN(t)) return null; d = new Date(t); }
  const kyivMs = d.getTime() + KYIV_UTC_OFFSET * 3600 * 1000;
  const k = new Date(kyivMs);
  return { y: k.getUTCFullYear(), m: k.getUTCMonth(), d: k.getUTCDate(), hour: k.getUTCHours(), dow: k.getUTCDay() };
}
function kyivToday_() {
  const now = new Date();
  const kyivMs = now.getTime() + KYIV_UTC_OFFSET * 3600 * 1000;
  const k = new Date(kyivMs);
  return { y: k.getUTCFullYear(), m: k.getUTCMonth(), d: k.getUTCDate(), dow: k.getUTCDay() };
}
function dayKey_(y, m, d) { return y + '-' + ('0'+(m+1)).slice(-2) + '-' + ('0'+d).slice(-2); }
function reportPeriodForToday_() {
  const today = kyivToday_();
  const dow = today.dow; 
  if (dow === 6 || dow === 0) return null; // сб, нд - без звіту
  function dayMinus(n) {
    const base = Date.UTC(today.y, today.m, today.d) - n * 86400000;
    const k = new Date(base);
    const w = k.getUTCDay();
    return { y: k.getUTCFullYear(), m: k.getUTCMonth(), d: k.getUTCDate(), dow: w, weekend: (w === 0 || w === 6) };
  }
  let days;
  if (dow === 2) { days = [ dayMinus(3), dayMinus(2), dayMinus(1) ]; } 
  else { days = [ dayMinus(1) ]; }
  return { days: days };
}

function buildReportData_(ss) {
  const period = reportPeriodForToday_();
  if (!period) return null;
  const days = period.days;
  const dset = {}; days.forEach(d => dset[dayKey_(d.y, d.m, d.d)] = d);

  const sh = ss.getSheetByName(CFG.sheetName);
  const n = sh.getLastRow() - CFG.firstDataRow + 1;

  const stat = { total: 0, processed: 0, notTaken: 0, byStatus: {}, mrm: {}, days: days };
  statusOptions_().forEach(s => { if(isProcessedStatus_(s)) stat.byStatus[s] = 0; });

  if (n < 1) return stat;

  const dateB = sh.getRange(CFG.firstDataRow, SRC.dateCol, n, 1).getValues(); 
  const resO  = sh.getRange(CFG.firstDataRow, WORK.resCol, n, 1).getValues(); 
  const mrmN  = sh.getRange(CFG.firstDataRow, WORK.respCol, n, 1).getValues(); 

  for (let i = 0; i < n; i++) {
    const raw = dateB[i][0];
    if (!raw) continue;
    const kv = toKyiv_(raw);
    if (!kv) continue;
    const dk = dayKey_(kv.y, kv.m, kv.d);
    const dayInfo = dset[dk];
    if (!dayInfo) continue; 

    stat.total++;
    const result = String(resO[i][0] == null ? '' : resO[i][0]).trim();
    const processed = isProcessedStatus_(result);

    if (processed) {
      stat.processed++;
      if (stat.byStatus[result] !== undefined) stat.byStatus[result]++;
      else stat.byStatus[result] = 1;
    } else {
      stat.notTaken++;
      const mrmName = String(mrmN[i][0] == null ? '' : mrmN[i][0]).trim() || '(без МРМ)';
      if (!stat.mrm[mrmName]) stat.mrm[mrmName] = { notTaken: 0, afterHours: 0, critical: 0 };
      stat.mrm[mrmName].notTaken++;
      const afterHours = dayInfo.weekend || (kv.hour >= WORK_DAY_END_HOUR);
      if (afterHours) stat.mrm[mrmName].afterHours++;
      else stat.mrm[mrmName].critical++;
    }
  }
  return stat;
}

function reportEmailHtml_(stat) {
  const pct = stat.total > 0 ? Math.round(stat.processed / stat.total * 100) : 0;
  const cbs = { 'Опрацьовано':'#b6d7a8','Відмова':'#ea9999','В процесі обробки':'#ffe599','Недозвон':'#f9cb9c','Консультації з інших питань':'#a4c2f4','Не взято в роботу':'#d9d9d9' };
  let statusRows = '';
  ['Опрацьовано','В процесі обробки','Недозвон','Консультації з інших питань','Відмова','Не взято в роботу'].forEach(s => {
    const cnt = stat.byStatus[s] || 0;
    statusRows += `<tr><td style="padding:4px 0;font-size:14px;"><span style="display:inline-block;width:10px;height:10px;background:${cbs[s]};margin-right:8px;"></span>${s}</td><td style="text-align:right;font-weight:bold;">${cnt}</td></tr>`;
  });

  const mrmNames = Object.keys(stat.mrm).sort((a,b) => (stat.mrm[b].critical - stat.mrm[a].critical) || (stat.mrm[b].notTaken - stat.mrm[a].notTaken));
  let mrmBlock = '';
  if (mrmNames.length === 0) mrmBlock = '<p style="color:#3B6D11;">Усі заявки опрацьовано.</p>';
  else {
    mrmNames.forEach(nm => {
      const m = stat.mrm[nm];
      mrmBlock += `<div style="border-bottom:1px solid #ddd;padding:8px 0;display:flex;justify-content:space-between;">
        <div><b>${esc_(nm)}</b><div style="font-size:11px;color:#888;">поза роб. часом: ${m.afterHours}</div></div>
        <div style="text-align:right;"><span style="color:${m.critical>0?'#A32D2D':'#999'};font-weight:bold;font-size:16px;">${m.critical}</span> <span style="color:#999;font-size:12px;">/ ${m.notTaken}</span></div></div>`;
    });
  }

  return `<div style="font-family:sans-serif;max-width:500px;background:#f5f5f0;padding:20px;">
    <div style="background:#fff;padding:20px;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.05);">
    <h2 style="margin:0 0 16px;color:#0C447C;">Звіт по заявках на оренду</h2>
    <div style="display:flex;gap:10px;margin-bottom:20px;">
      <div style="flex:1;background:#f9f9f9;padding:10px;border-radius:8px;text-align:center;"><div style="font-size:11px;color:#666;">Надійшло</div><div style="font-size:20px;font-weight:bold;">${stat.total}</div></div>
      <div style="flex:1;background:#f9f9f9;padding:10px;border-radius:8px;text-align:center;"><div style="font-size:11px;color:#666;">Опрацьовано</div><div style="font-size:20px;font-weight:bold;color:#3B6D11;">${stat.processed}</div></div>
      <div style="flex:1;background:#f9f9f9;padding:10px;border-radius:8px;text-align:center;"><div style="font-size:11px;color:#666;">Не взято</div><div style="font-size:20px;font-weight:bold;color:#A32D2D;">${stat.notTaken}</div></div>
    </div>
    <table width="100%" style="margin-bottom:20px;">${statusRows}</table>
    <h3 style="font-size:14px;border-bottom:2px solid #ccc;padding-bottom:4px;">Не взято в роботу по МРМ</h3>
    ${mrmBlock}
    </div></div>`;
}

function sendReportCore_(force) {
  const ss = SpreadsheetApp.getActive();
  const stat = buildReportData_(ss);
  if (!stat) return { ok: false, reason: 'Вихідний' };
  const to = (TEST_MODE ? [TEST_EMAIL] : REPORT_RECIPIENTS).join(',');
  MailApp.sendEmail({ to: to, subject: (TEST_MODE?'[ТЕСТ] ':'')+'Щоденний звіт по лідах на оренду', htmlBody: reportEmailHtml_(stat) });
  return { ok: true, stat: stat, to: to };
}

function sendDailyReport() { if(REPORTS_ENABLED) sendReportCore_(false); }
function testSendReport() {
  const r = sendReportCore_(true);
  SpreadsheetApp.getActive().toast(r.ok ? ('Звіт надіслано на '+r.to) : ('Помилка: '+r.reason));
}
function testSendLastLead() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(CFG.sheetName);
  const n = sh.getLastRow() - CFG.firstDataRow + 1;
  const dateCol = sh.getRange(CFG.firstDataRow, SRC.dateCol, n, 1).getValues();
  let best = -1, bt = -1;
  for (let i = 0; i < n; i++) {
    const t = Date.parse(String(dateCol[i][0]));
    if (!isNaN(t) && t > bt) { bt = t; best = i; }
  }
  if (best === -1) return ss.toast('Немає дат.');
  const row = CFG.firstDataRow + best;
  const lead = readLead_(sh, row);
  const key = keyOf_(lead.ts, lead.empTel, lead.ownTel);
  const mrmName = sh.getRange(row, WORK.respCol).getValue() || allMrmNames_()[0];
  const ok = sendNewLeadEmail_(lead, encKey_(key), mrmName);
  ss.toast(ok ? 'Тест надіслано на ' + TEST_EMAIL : 'Помилка');
}

// Тригери
function installTriggers() { removeTriggers(); ScriptApp.newTrigger('rebuildWorking').timeBased().everyMinutes(10).create(); SpreadsheetApp.getActive().toast('Автосинхронізацію ввімкнено.'); }
function removeTriggers() { ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'rebuildWorking').forEach(t => ScriptApp.deleteTrigger(t)); }
function installReportTrigger() { removeReportTrigger(); ScriptApp.newTrigger('sendDailyReport').timeBased().atHour(8).nearMinute(30).everyDays(1).create(); SpreadsheetApp.getActive().toast('Звіт увімкнено (08:30).'); }
function removeReportTrigger() { ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'sendDailyReport').forEach(t => ScriptApp.deleteTrigger(t)); }