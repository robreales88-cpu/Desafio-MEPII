/**
 * DESAFÍO: Método de Evaluación Psicológica II
 * Google Apps Script Backend — Version 1.0
 *
 * SETUP INSTRUCTIONS:
 * 1. Create a new Google Spreadsheet and copy its ID to CONFIG.SPREADSHEET_ID
 * 2. In Apps Script editor: Deploy → New deployment → Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 3. Copy the deployment URL into api-client.js (SCRIPT_URL)
 * 4. Run initSheets() once manually to create all sheets with headers
 */

// ══════════════════════════════════════════════════════════════════
// CONFIG
// ══════════════════════════════════════════════════════════════════
const CONFIG = {
  SPREADSHEET_ID: 'YOUR_SPREADSHEET_ID_HERE',  // ← replace this
  ADMIN_EMAILS: ['docente@universidad.edu'],    // ← teacher emails
  VERSION: '1.0',
  MAX_ROWS_PER_QUERY: 500,
  CACHE_TTL_SECONDS: 60,
};

const SHEETS = {
  ESTUDIANTES : '01_ESTUDIANTES',
  PROGRESO    : '02_PROGRESO',
  INSIGNIAS   : '03_INSIGNIAS',
  RANKING     : '04_RANKING',
  EVENTOS     : '05_EVENTOS',
  ANALITICA   : '06_ANALITICA',
};

const HEADERS = {
  ESTUDIANTES : ['ID','Correo','Nombre','Nickname','Avatar','Grupo','Seccion','FechaRegistro','UltimoAcceso','Nivel','XP','Estado'],
  PROGRESO    : ['IDEstudiante','Semana','Microreto','Tipo','Intentos','Tiempo','Correctas','Incorrectas','XP','CambiosPestana','Fecha'],
  INSIGNIAS   : ['IDEstudiante','Insignia','Fecha','XPAcumulada'],
  RANKING     : ['Posicion','Nombre','Nickname','Nivel','XP','Insignias','Grupo'],
  EVENTOS     : ['IDEstudiante','Evento','Detalle','Fecha','Navegador'],
  ANALITICA   : ['Metrica','Valor','Periodo','Fecha'],
};

// ══════════════════════════════════════════════════════════════════
// ENTRY POINTS
// ══════════════════════════════════════════════════════════════════

function doPost(e) {
  try {
    const action = e.parameter.action;
    const body   = e.postData ? JSON.parse(e.postData.contents) : {};
    logEvento(body.email || 'anonymous', 'API_POST', action, e.parameter.ua || '');

    switch (action) {
      case 'registro'        : return respond(registro(body));
      case 'login'           : return respond(login(body));
      case 'guardarProgreso' : return respond(guardarProgreso(body));
      case 'guardarXP'       : return respond(guardarXP(body));
      case 'guardarInsignia' : return respond(guardarInsignia(body));
      case 'guardarEvento'   : return respond(guardarEvento(body));
      case 'adminAction'     : return respond(adminAction(body));
      default: return respond({ ok: false, error: 'Acción no reconocida: ' + action });
    }
  } catch (err) {
    return respond({ ok: false, error: err.message });
  }
}

function doGet(e) {
  try {
    const action = e.parameter.action;
    logEvento(e.parameter.email || 'anonymous', 'API_GET', action, e.parameter.ua || '');

    switch (action) {
      case 'ranking'       : return respond(getRanking(e.parameter));
      case 'estadisticas'  : return respond(getEstadisticas(e.parameter));
      case 'perfil'        : return respond(getPerfil(e.parameter));
      case 'desafio'       : return respond(getDesafio(e.parameter));
      case 'admin'         : return respond(getAdminData(e.parameter));
      case 'ping'          : return respond({ ok: true, version: CONFIG.VERSION, ts: new Date().toISOString() });
      default: return respond({ ok: false, error: 'Acción no reconocida: ' + action });
    }
  } catch (err) {
    return respond({ ok: false, error: err.message });
  }
}

// ══════════════════════════════════════════════════════════════════
// POST ENDPOINTS
// ══════════════════════════════════════════════════════════════════

/** Register or log in (email-based, no password). */
function registro(data) {
  if (!data.email) return { ok: false, error: 'Correo requerido' };
  const sheet = getSheet(SHEETS.ESTUDIANTES);
  const rows  = sheetToObjects(sheet);
  const existing = rows.find(r => r.Correo === data.email.toLowerCase());
  if (existing) return { ok: true, action: 'login', user: sanitizeUser(existing) };

  const id   = generateId();
  const now  = new Date().toISOString();
  const lvl  = calcLevel(0);
  sheet.appendRow([
    id, data.email.toLowerCase(), data.nombre || '', data.nickname || '',
    data.avatar || 0, data.grupo || '', data.seccion || '',
    now, now, lvl, 0, 'activo',
  ]);
  logEvento(data.email, 'REGISTRO', `Nuevo usuario: ${data.nombre}`, data.ua || '');
  return { ok: true, action: 'registro', user: { ID: id, Correo: data.email, Nombre: data.nombre, Nickname: data.nickname, Avatar: data.avatar, Grupo: data.grupo, Seccion: data.seccion, Nivel: lvl, XP: 0, Estado: 'activo' } };
}

/** Login by email — returns profile or error. */
function login(data) {
  if (!data.email) return { ok: false, error: 'Correo requerido' };
  const sheet = getSheet(SHEETS.ESTUDIANTES);
  const rows  = sheetToObjects(sheet);
  const user  = rows.find(r => r.Correo === data.email.toLowerCase());
  if (!user) return { ok: false, error: 'Usuario no encontrado' };
  if (user.Estado === 'inactivo') return { ok: false, error: 'Cuenta desactivada' };

  // Update last access
  updateRow(sheet, rows, r => r.Correo === data.email.toLowerCase(), { UltimoAcceso: new Date().toISOString() });
  logEvento(data.email, 'LOGIN', '', data.ua || '');
  return { ok: true, user: sanitizeUser(user) };
}

/** Save microreto progress. */
function guardarProgreso(data) {
  if (!data.email) return { ok: false, error: 'Correo requerido' };
  const sheet = getSheet(SHEETS.PROGRESO);
  sheet.appendRow([
    data.email, data.semana || 0, data.microreto || 0, data.tipo || '',
    data.intentos || 1, data.tiempo || 0, data.correctas || 0,
    data.incorrectas || 0, data.xp || 0, data.cambiosPestana || 0,
    new Date().toISOString(),
  ]);
  recalcAnalitica();
  return { ok: true };
}

/** Update XP for a student. */
function guardarXP(data) {
  if (!data.email || data.xp == null) return { ok: false, error: 'Correo y XP requeridos' };
  const sheet = getSheet(SHEETS.ESTUDIANTES);
  const rows  = sheetToObjects(sheet);
  const user  = rows.find(r => r.Correo === data.email.toLowerCase());
  if (!user) return { ok: false, error: 'Usuario no encontrado' };

  const newXP    = Number(user.XP) + Number(data.xp);
  const newLevel = calcLevel(newXP);
  updateRow(sheet, rows, r => r.Correo === data.email.toLowerCase(), { XP: newXP, Nivel: newLevel });
  updateRanking();
  logEvento(data.email, 'XP_GANADA', `+${data.xp} XP → Total: ${newXP}`, '');
  return { ok: true, newXP, newLevel };
}

/** Record a badge unlock. */
function guardarInsignia(data) {
  if (!data.email || !data.insignia) return { ok: false, error: 'Correo e insignia requeridos' };
  const sheet    = getSheet(SHEETS.INSIGNIAS);
  const studSheet= getSheet(SHEETS.ESTUDIANTES);
  const rows     = sheetToObjects(studSheet);
  const user     = rows.find(r => r.Correo === data.email.toLowerCase());
  sheet.appendRow([data.email, data.insignia, new Date().toISOString(), user ? user.XP : 0]);
  logEvento(data.email, 'INSIGNIA', data.insignia, '');
  return { ok: true };
}

/** Log any event. */
function guardarEvento(data) {
  if (!data.email || !data.evento) return { ok: false, error: 'Correo y evento requeridos' };
  logEvento(data.email, data.evento, data.detalle || '', data.ua || '');
  return { ok: true };
}

/** Admin actions (requires admin email). */
function adminAction(data) {
  if (!CONFIG.ADMIN_EMAILS.includes(data.adminEmail)) return { ok: false, error: 'No autorizado' };
  switch (data.action) {
    case 'desactivarEstudiante': return adminSetEstado(data.targetEmail, 'inactivo');
    case 'activarEstudiante':    return adminSetEstado(data.targetEmail, 'activo');
    case 'resetXP':              return adminResetXP(data.targetEmail);
    case 'editarEstudiante':     return adminEditarEstudiante(data.targetEmail, data.fields);
    default: return { ok: false, error: 'Acción admin desconocida' };
  }
}

// ══════════════════════════════════════════════════════════════════
// GET ENDPOINTS
// ══════════════════════════════════════════════════════════════════

/** Return ranked leaderboard (top N). */
function getRanking(params) {
  const limit = Number(params.limit) || 20;
  const sheet = getSheet(SHEETS.RANKING);
  const rows  = sheetToObjects(sheet);
  return { ok: true, ranking: rows.slice(0, limit) };
}

/** Aggregate statistics for the admin dashboard. */
function getEstadisticas(params) {
  const estSheet  = getSheet(SHEETS.ESTUDIANTES);
  const progSheet = getSheet(SHEETS.PROGRESO);
  const estRows   = sheetToObjects(estSheet);
  const progRows  = sheetToObjects(progSheet);

  const totalEst    = estRows.length;
  const active      = estRows.filter(r => r.Estado === 'activo').length;
  const totalXP     = estRows.reduce((s, r) => s + Number(r.XP || 0), 0);
  const avgXP       = totalEst ? Math.round(totalXP / totalEst) : 0;
  const completados = progRows.filter(r => Number(r.Correctas) === 3).length;

  // Per-semana participation
  const semanas = {};
  progRows.forEach(r => { semanas[r.Semana] = (semanas[r.Semana] || 0) + 1; });

  return { ok: true, stats: { totalEstudiantes: totalEst, activos: active, avgXP, completados, porSemana: semanas } };
}

/** Full profile for one student. */
function getPerfil(params) {
  if (!params.email) return { ok: false, error: 'Correo requerido' };
  const estRows = sheetToObjects(getSheet(SHEETS.ESTUDIANTES));
  const user    = estRows.find(r => r.Correo === params.email.toLowerCase());
  if (!user) return { ok: false, error: 'Usuario no encontrado' };

  const progRows   = sheetToObjects(getSheet(SHEETS.PROGRESO));
  const badgeRows  = sheetToObjects(getSheet(SHEETS.INSIGNIAS));
  const eventRows  = sheetToObjects(getSheet(SHEETS.EVENTOS));

  const progreso = progRows.filter(r => r.IDEstudiante === params.email.toLowerCase());
  const insignias = badgeRows.filter(r => r.IDEstudiante === params.email.toLowerCase()).map(r => r.Insignia);
  const eventos   = eventRows.filter(r => r.IDEstudiante === params.email.toLowerCase()).slice(-20);

  return { ok: true, user: sanitizeUser(user), progreso, insignias, eventos };
}

/** Challenge data proxy (reads from challenge-bank folder if Drive-hosted). */
function getDesafio(params) {
  const week = params.week;
  if (!week) return { ok: false, error: 'Semana requerida' };
  // In production: read JSON from Drive file
  // For now: return a signal to load from static files
  return { ok: true, source: 'static', week };
}

/** Admin dashboard data. */
function getAdminData(params) {
  if (!CONFIG.ADMIN_EMAILS.includes(params.adminEmail)) return { ok: false, error: 'No autorizado' };
  const estRows  = sheetToObjects(getSheet(SHEETS.ESTUDIANTES));
  const progRows = sheetToObjects(getSheet(SHEETS.PROGRESO));
  const badgeRows= sheetToObjects(getSheet(SHEETS.INSIGNIAS));
  const eventRows= sheetToObjects(getSheet(SHEETS.EVENTOS));

  const page    = Number(params.page) || 0;
  const perPage = Number(params.perPage) || 50;
  const query   = (params.query || '').toLowerCase();

  const filtered = query
    ? estRows.filter(r => r.Nombre.toLowerCase().includes(query) || r.Correo.toLowerCase().includes(query))
    : estRows;

  const paginado = filtered.slice(page * perPage, (page + 1) * perPage);
  const enriched = paginado.map(u => ({
    ...sanitizeUser(u),
    completados: progRows.filter(r => r.IDEstudiante === u.Correo && Number(r.Correctas) === 3).length,
    insignias  : badgeRows.filter(r => r.IDEstudiante === u.Correo).length,
    tiempoTotal: progRows.filter(r => r.IDEstudiante === u.Correo).reduce((s, r) => s + Number(r.Tiempo || 0), 0),
    cambiosPestana: eventRows.filter(r => r.IDEstudiante === u.Correo && r.Evento === 'TAB_SWITCH').length,
  }));

  return {
    ok: true,
    students: enriched,
    total: filtered.length,
    page, perPage,
    totalStudents: estRows.length,
    avgXP: estRows.length ? Math.round(estRows.reduce((s,r)=>s+Number(r.XP||0),0)/estRows.length) : 0,
    activos: estRows.filter(r=>r.Estado==='activo').length,
    completados: progRows.filter(r=>Number(r.Correctas)===3).length,
    insigniasTotal: badgeRows.length,
  };
}

// ══════════════════════════════════════════════════════════════════
// ADMIN HELPERS
// ══════════════════════════════════════════════════════════════════

function adminSetEstado(email, estado) {
  const sheet = getSheet(SHEETS.ESTUDIANTES);
  const rows  = sheetToObjects(sheet);
  const ok    = updateRow(sheet, rows, r => r.Correo === email, { Estado: estado });
  return ok ? { ok: true } : { ok: false, error: 'Usuario no encontrado' };
}

function adminResetXP(email) {
  const sheet = getSheet(SHEETS.ESTUDIANTES);
  const rows  = sheetToObjects(sheet);
  const ok    = updateRow(sheet, rows, r => r.Correo === email, { XP: 0, Nivel: 1 });
  if (ok) { updateRanking(); logEvento(email, 'ADMIN_RESET_XP', 'XP restablecido a 0', ''); }
  return ok ? { ok: true } : { ok: false, error: 'Usuario no encontrado' };
}

function adminEditarEstudiante(email, fields) {
  const allowed = ['Nombre','Nickname','Grupo','Seccion','Avatar'];
  const safe = {};
  allowed.forEach(k => { if (fields[k] != null) safe[k] = fields[k]; });
  const sheet = getSheet(SHEETS.ESTUDIANTES);
  const rows  = sheetToObjects(sheet);
  const ok    = updateRow(sheet, rows, r => r.Correo === email, safe);
  return ok ? { ok: true } : { ok: false, error: 'Usuario no encontrado' };
}

// ══════════════════════════════════════════════════════════════════
// RANKING + ANALYTICS
// ══════════════════════════════════════════════════════════════════

function updateRanking() {
  const estRows = sheetToObjects(getSheet(SHEETS.ESTUDIANTES));
  const badgeRows = sheetToObjects(getSheet(SHEETS.INSIGNIAS));

  const sorted = estRows
    .filter(r => r.Estado === 'activo')
    .sort((a, b) => Number(b.XP) - Number(a.XP));

  const rankSheet = getSheet(SHEETS.RANKING);
  rankSheet.clearContents();
  rankSheet.appendRow(HEADERS.RANKING);
  sorted.forEach((u, i) => {
    const badges = badgeRows.filter(b => b.IDEstudiante === u.Correo).map(b => b.Insignia).join(',');
    rankSheet.appendRow([i + 1, u.Nombre, u.Nickname, u.Nivel, u.XP, badges, u.Grupo]);
  });
}

function recalcAnalitica() {
  const progRows = sheetToObjects(getSheet(SHEETS.PROGRESO));
  const total = progRows.length;
  if (!total) return;

  const avgTime   = progRows.reduce((s, r) => s + Number(r.Tiempo || 0), 0) / total;
  const avgXP     = progRows.reduce((s, r) => s + Number(r.XP || 0), 0) / total;
  const errRate   = progRows.reduce((s, r) => s + Number(r.Incorrectas || 0), 0) / (total * 3);

  const hardest = Object.entries(
    progRows.reduce((acc, r) => {
      const key = `S${r.Semana}M${r.Microreto}`;
      if (!acc[key]) acc[key] = { correct: 0, total: 0 };
      acc[key].total++; acc[key].correct += Number(r.Correctas || 0);
      return acc;
    }, {})
  ).sort((a, b) => (a[1].correct / a[1].total) - (b[1].correct / b[1].total))[0];

  const sheet = getSheet(SHEETS.ANALITICA);
  const now   = new Date().toISOString();
  const rows  = [
    ['TiempoPromedio',  avgTime.toFixed(1),        'global', now],
    ['XPPromedio',      avgXP.toFixed(1),           'global', now],
    ['TasaError',       (errRate * 100).toFixed(1), 'global', now],
    ['RetoMasDificil',  hardest ? hardest[0] : '',  'global', now],
  ];
  sheet.clearContents();
  sheet.appendRow(HEADERS.ANALITICA);
  rows.forEach(r => sheet.appendRow(r));
}

// ══════════════════════════════════════════════════════════════════
// SHEET UTILITIES
// ══════════════════════════════════════════════════════════════════

function getSheet(name) {
  const ss    = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet   = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(HEADERS[name.replace(/^\d+_/, '')]);
  }
  return sheet;
}

function sheetToObjects(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1).map(row =>
    Object.fromEntries(headers.map((h, i) => [h, row[i] ?? '']))
  );
}

function updateRow(sheet, rows, predicate, updates) {
  const idx = rows.findIndex(predicate);
  if (idx === -1) return false;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rowNum  = idx + 2; // +1 for header, +1 for 1-indexed
  const range   = sheet.getRange(rowNum, 1, 1, headers.length);
  const vals    = range.getValues()[0];
  headers.forEach((h, i) => { if (updates[h] != null) vals[i] = updates[h]; });
  range.setValues([vals]);
  return true;
}

function logEvento(email, evento, detalle, ua) {
  try {
    getSheet(SHEETS.EVENTOS).appendRow([email, evento, detalle, new Date().toISOString(), ua]);
  } catch(e) { /* non-critical */ }
}

// ══════════════════════════════════════════════════════════════════
// MISC HELPERS
// ══════════════════════════════════════════════════════════════════

function generateId() {
  return 'u_' + Utilities.getUuid().replace(/-/g, '').substring(0, 12);
}

function calcLevel(xp) {
  if (xp >= 4000) return 5;
  if (xp >= 2500) return 4;
  if (xp >= 1200) return 3;
  if (xp >= 500)  return 2;
  return 1;
}

function sanitizeUser(u) {
  return { ID: u.ID, Correo: u.Correo, Nombre: u.Nombre, Nickname: u.Nickname,
    Avatar: u.Avatar, Grupo: u.Grupo, Seccion: u.Seccion, Nivel: u.Nivel,
    XP: u.XP, Estado: u.Estado, FechaRegistro: u.FechaRegistro };
}

function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ══════════════════════════════════════════════════════════════════
// INIT — Run once manually after deploying
// ══════════════════════════════════════════════════════════════════

function initSheets() {
  Object.values(SHEETS).forEach(name => getSheet(name));
  Logger.log('✅ Sheets inicializados correctamente.');
}
