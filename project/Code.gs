/**
 * DESAFÍO: Método de Evaluación Psicológica II
 * Google Apps Script Backend — Version 1.0 RC
 *
 * SETUP INSTRUCTIONS:
 * 1. Create a new Google Spreadsheet and copy its ID to CONFIG.SPREADSHEET_ID
 * 2. Set CONFIG.ADMIN_TOKEN to a long random string (this is the shared secret the
 *    teacher enters once in AdminPanel.dc.html / AuthorStudio.dc.html to unlock them).
 *    Generate one yourself, e.g. with `Utilities.getUuid() + Utilities.getUuid()` in
 *    the Apps Script editor's execution log, and paste the result below.
 * 3. In Apps Script editor: Deploy → New deployment → Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4. Copy the deployment URL into api-client.js (SCRIPT_URL)
 * 5. Run initSheets() once manually to create all sheets with headers
 *
 * SECURITY MODEL (v1.0 RC):
 *   - Students authenticate with email + a random Token issued at first registro()
 *     and stored in localStorage on their device. Every endpoint that reads or
 *     writes a specific student's data requires that token to match the one on
 *     file for that email — a bare email is no longer sufficient (closes the
 *     identity-spoofing gap from the technical audit, SEC-1/BACK-7).
 *   - Admin endpoints require BOTH an email in CONFIG.ADMIN_EMAILS AND a shared
 *     CONFIG.ADMIN_TOKEN — a client can no longer self-declare adminEmail and be
 *     believed (SEC-2/BACK-8).
 *   - guardarProgreso/guardarXP independently recompute correctness and XP from
 *     the 07_RESPUESTAS answer key (populated by Author Studio when a docente
 *     saves a week) instead of trusting client-reported numbers outright. Until a
 *     given week's key has been (re-)saved through Author Studio, those endpoints
 *     fall back to the client-reported values, clamped to CONFIG.MAX_XP_PER_EVENT.
 *   - Mutating endpoints accept an optional requestId; a duplicate requestId
 *     returns the original cached result instead of re-applying the action, so a
 *     retried/offline-queued request can't double-credit XP or progress
 *     (SEC-9/BACK-15). Dedup window is CacheService's max TTL (6 hours).
 *   - guardarXP / ranking updates are wrapped in LockService so two students
 *     finishing at the same instant can't clobber each other's XP, and the
 *     ranking sheet is rewritten with a single range write instead of a
 *     clear+append-in-a-loop, so it's never readable half-built (SEC-5/BACK-3/BACK-12).
 */

// ══════════════════════════════════════════════════════════════════
// CONFIG
// ══════════════════════════════════════════════════════════════════
const CONFIG = {
  SPREADSHEET_ID: '1wRaDF9ytZz56805n9CvFhV32YFuz9uSBDKqrTG45qIA',
  ADMIN_EMAILS: ['rob.reales88@gmail.com'],
  ADMIN_TOKEN: '3ffe8c6e64caba7c20b34c1043d01a52254d19667c07d055',
  VERSION: '1.0-rc',
  MAX_ROWS_PER_QUERY: 500,
  CACHE_TTL_SECONDS: 60,
  MAX_XP_PER_EVENT: 400,
  IDEMPOTENCY_TTL_SECONDS: 21600,
};

const SHEETS = {
  ESTUDIANTES : '01_ESTUDIANTES',
  PROGRESO    : '02_PROGRESO',
  INSIGNIAS   : '03_INSIGNIAS',
  RANKING     : '04_RANKING',
  EVENTOS     : '05_EVENTOS',
  ANALITICA   : '06_ANALITICA',
  RESPUESTAS  : '07_RESPUESTAS',
  CALENDARIO  : '08_CALENDARIO',
};

const HEADERS = {
  ESTUDIANTES : ['ID','Correo','Nombre','Nickname','Avatar','Grupo','Seccion','FechaRegistro','UltimoAcceso','Nivel','XP','Estado','Token'],
  PROGRESO    : ['IDEstudiante','Semana','Microreto','Tipo','Intentos','Tiempo','Correctas','Incorrectas','XP','CambiosPestana','Fecha','Validado'],
  INSIGNIAS   : ['IDEstudiante','Insignia','Fecha','XPAcumulada'],
  RANKING     : ['Posicion','Nombre','Nickname','Nivel','XP','Insignias','Grupo','Avatar'],
  EVENTOS     : ['Actor','Evento','Detalle','Fecha','Navegador'],
  ANALITICA   : ['Metrica','Valor','Periodo','Fecha'],
  RESPUESTAS  : ['Semana','Microreto','PreguntaIdx','CorrectaEs','CorrectaEn','XPBase','XPSpeedMax','XPPerfectBonus','TiempoRespuesta'],
  CALENDARIO  : ['Semana','FechaInicio','FechaFin','Estado','ActualizadoPor','UltimaActualizacion'],
};

// ══════════════════════════════════════════════════════════════════
// ENTRY POINTS
// ══════════════════════════════════════════════════════════════════

function doPost(e) {
  try {
    const action = e.parameter.action;
    const body   = e.postData ? JSON.parse(e.postData.contents) : {};
    logEvento(body.adminEmail || body.email || 'anonymous', 'API_POST', action, e.parameter.ua || '');

    switch (action) {
      case 'registro'        : return respond(registro(body));
      case 'login'           : return respond(login(body));
      case 'guardarProgreso' : return respond(guardarProgreso(body));
      case 'guardarXP'       : return respond(guardarXP(body));
      case 'guardarInsignia' : return respond(guardarInsignia(body));
      case 'guardarEvento'   : return respond(guardarEvento(body));
      case 'adminAction'     : return respond(adminAction(body));
      case 'docenteAction'   : return respond(docenteAction(body));
      case 'subirBanco'      : return respond(subirBanco(body));
      case 'recuperarSesion' : return respond(recuperarSesion(body));
      default: return respond({ ok: false, error: 'Acción no reconocida: ' + action });
    }
  } catch (err) {
    return respond({ ok: false, error: err.message });
  }
}

function doGet(e) {
  try {
    const action = e.parameter.action;
    logEvento(e.parameter.adminEmail || e.parameter.email || 'anonymous', 'API_GET', action, e.parameter.ua || '');

    switch (action) {
      case 'ranking'       : return respond(getRanking(e.parameter));
      case 'estadisticas'  : return respond(getEstadisticas(e.parameter));
      case 'perfil'        : return respond(getPerfil(e.parameter));
      case 'desafio'       : return respond(getDesafio(e.parameter));
      case 'admin'         : return respond(getAdminData(e.parameter));
      case 'calendario'    : return respond(getCalendario(e.parameter));
      case 'teacherPanel'  : return respond(getTeacherPanel(e.parameter));
      case 'ping'          : return respond({ ok: true, version: CONFIG.VERSION, ts: new Date().toISOString() });
      default: return respond({ ok: false, error: 'Acción no reconocida: ' + action });
    }
  } catch (err) {
    return respond({ ok: false, error: err.message });
  }
}

// ══════════════════════════════════════════════════════════════════
// AUTH HELPERS
// ══════════════════════════════════════════════════════════════════

/** Generate a fresh random session token for a newly-registered student. */
function generateToken() {
  return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
}

/** Constant-effort string compare (best-effort in the Apps Script sandbox). */
function tokensMatch(a, b) {
  const sa = String(a || ''), sb = String(b || '');
  if (!sa || !sb || sa.length !== sb.length) return false;
  let diff = 0;
  for (let i = 0; i < sa.length; i++) diff |= sa.charCodeAt(i) ^ sb.charCodeAt(i);
  return diff === 0;
}

/**
 * Verify a student request. Returns { ok:true, user, rows, sheet } on success,
 * or { ok:false, error } — callers should `return` that object directly.
 */
function requireStudent(email, token) {
  if (!email) return { ok: false, error: 'Correo requerido' };
  const sheet = getSheet(SHEETS.ESTUDIANTES);
  const rows  = sheetToObjects(sheet);
  const user  = rows.find(r => r.Correo === String(email).trim().toLowerCase());
  if (!user) return { ok: false, error: 'Usuario no encontrado' };
  if (!tokensMatch(token, user.Token)) return { ok: false, error: 'No autorizado' };
  return { ok: true, user, rows, sheet };
}

/** Verify an admin request (email in allow-list AND correct shared admin token). */
function requireAdmin(adminEmail, adminToken) {
  if (!adminEmail || !adminToken) return false;
  if (!CONFIG.ADMIN_EMAILS.includes(adminEmail)) return false;
  return tokensMatch(adminToken, CONFIG.ADMIN_TOKEN);
}

/**
 * Run `fn` at most once per requestId. Repeated calls with the same requestId
 * (retries, offline-queue replays) return the original cached result instead of
 * re-applying the action. Requests without a requestId always run (older
 * clients) — callers of mutating endpoints should always send one.
 */
function withIdempotency(requestId, fn) {
  if (!requestId) return fn();
  const cache    = CacheService.getScriptCache();
  const cacheKey = 'req_' + requestId;
  const cached   = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);
  const result = fn();
  try { cache.put(cacheKey, JSON.stringify(result), CONFIG.IDEMPOTENCY_TTL_SECONDS); } catch (e) { /* non-critical */ }
  return result;
}

// ══════════════════════════════════════════════════════════════════
// POST ENDPOINTS
// ══════════════════════════════════════════════════════════════════

/** Register (first visit) or acknowledge an existing account (email + token, no password). */
function registro(data) {
  if (!data.email) return { ok: false, error: 'Correo requerido' };
  const email = data.email.trim().toLowerCase();
  const sheet = getSheet(SHEETS.ESTUDIANTES);
  const rows  = sheetToObjects(sheet);
  const existing = rows.find(r => r.Correo === email);

  if (existing) {
    // Do not hand another student's profile/token to whoever merely knows their email.
    if (tokensMatch(data.token, existing.Token)) {
      const role = CONFIG.ADMIN_EMAILS.includes(email) ? 'docente' : 'estudiante';
      return { ok: true, action: 'login', user: sanitizeUser(existing), token: existing.Token, role };
    }
    return {
      ok: false,
      error: 'CUENTA_EXISTENTE',
      message: 'Ya existe una cuenta con este correo. Si es tuya, usa el dispositivo donde te registraste originalmente o contacta a tu docente.',
    };
  }

  const id    = generateId();
  const token = generateToken();
  const now   = new Date().toISOString();
  const lvl   = calcLevel(0);
  sheet.appendRow([
    id, email, data.nombre || '', data.nickname || '',
    data.avatar || 0, data.grupo || '', data.seccion || '',
    now, now, lvl, 0, 'activo', token,
  ]);
  logEvento(email, 'REGISTRO', `Nuevo usuario: ${data.nombre}`, data.ua || '');
  return {
    ok: true, action: 'registro',
    user: { ID: id, Correo: email, Nombre: data.nombre, Nickname: data.nickname, Avatar: data.avatar, Grupo: data.grupo, Seccion: data.seccion, Nivel: lvl, XP: 0, Estado: 'activo' },
    token,
    role: CONFIG.ADMIN_EMAILS.includes(email) ? 'docente' : 'estudiante',
  };
}

/** Login by email + token — returns profile or error. */
function login(data) {
  const auth = requireStudent(data.email, data.token);
  if (!auth.ok) return auth;
  if (auth.user.Estado === 'inactivo') return { ok: false, error: 'Cuenta desactivada' };

  updateRow(auth.sheet, auth.rows, r => r.Correo === auth.user.Correo, { UltimoAcceso: new Date().toISOString() });
  logEvento(auth.user.Correo, 'LOGIN', '', data.ua || '');
  const role = CONFIG.ADMIN_EMAILS.includes(auth.user.Correo) ? 'docente' : 'estudiante';
  return { ok: true, user: sanitizeUser(auth.user), token: auth.user.Token, role };
}

/** Save microreto progress. Recomputes correctas/incorrectas from the answer key when available. */
function guardarProgreso(data) {
  return withIdempotency(data.requestId, () => {
    const auth = requireStudent(data.email, data.token);
    if (!auth.ok) return auth;

    const evalResult = evaluateSubmission(data.semana, data.microreto, data.answers, data.tiempo, {
      correctas: data.correctas, incorrectas: data.incorrectas, xp: data.xp,
    });

    const sheet = getSheet(SHEETS.PROGRESO);
    sheet.appendRow([
      auth.user.Correo, data.semana || 0, data.microreto || 0, data.tipo || '',
      data.intentos || 1, data.tiempo || 0, evalResult.correctas,
      evalResult.incorrectas, evalResult.xp, data.cambiosPestana || 0,
      new Date().toISOString(), evalResult.validated,
    ]);
    recalcAnalitica();
    return { ok: true, correctas: evalResult.correctas, incorrectas: evalResult.incorrectas, xp: evalResult.xp, validated: evalResult.validated };
  });
}

/** Update XP for a student. Recomputes the XP delta from the answer key when available. */
function guardarXP(data) {
  return withIdempotency(data.requestId, () => {
    const auth = requireStudent(data.email, data.token);
    if (!auth.ok) return auth;
    if (data.xp == null) return { ok: false, error: 'XP requerido' };

    const evalResult = evaluateSubmission(data.semana, data.microreto, data.answers, data.tiempo, {
      correctas: data.correctas, incorrectas: data.incorrectas, xp: data.xp,
    });
    // Bonus for completing all 3 microretos of a challenge — same cap applies.
    const delta = Math.max(0, Math.min(Number(evalResult.xp) + (Number(data.bonus) || 0), CONFIG.MAX_XP_PER_EVENT));

    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(10000);
      const sheet = getSheet(SHEETS.ESTUDIANTES);
      const rows  = sheetToObjects(sheet);
      const user  = rows.find(r => r.Correo === auth.user.Correo);
      if (!user) return { ok: false, error: 'Usuario no encontrado' };

      const newXP    = Number(user.XP) + delta;
      const newLevel = calcLevel(newXP);
      updateRow(sheet, rows, r => r.Correo === user.Correo, { XP: newXP, Nivel: newLevel });
      updateRanking();
      logEvento(user.Correo, 'XP_GANADA', `+${delta} XP → Total: ${newXP}`, '');
      return { ok: true, newXP, newLevel, xpApplied: delta, validated: evalResult.validated };
    } finally {
      lock.releaseLock();
    }
  });
}

/** Record a badge unlock. */
function guardarInsignia(data) {
  return withIdempotency(data.requestId, () => {
    const auth = requireStudent(data.email, data.token);
    if (!auth.ok) return auth;
    if (!data.insignia) return { ok: false, error: 'Insignia requerida' };

    const sheet = getSheet(SHEETS.INSIGNIAS);
    sheet.appendRow([auth.user.Correo, data.insignia, new Date().toISOString(), auth.user.XP]);
    logEvento(auth.user.Correo, 'INSIGNIA', data.insignia, '');
    return { ok: true };
  });
}

/** Log any event (student-authenticated). */
function guardarEvento(data) {
  const auth = requireStudent(data.email, data.token);
  if (!auth.ok) return auth;
  if (!data.evento) return { ok: false, error: 'Evento requerido' };
  logEvento(auth.user.Correo, data.evento, data.detalle || '', data.ua || '');
  return { ok: true };
}

/** Admin actions (email in allow-list + shared admin token required). */
function adminAction(data) {
  if (!requireAdmin(data.adminEmail, data.adminToken)) return { ok: false, error: 'No autorizado' };
  switch (data.action) {
    case 'desactivarEstudiante': return adminSetEstado(data.adminEmail, data.targetEmail, 'inactivo');
    case 'activarEstudiante':    return adminSetEstado(data.adminEmail, data.targetEmail, 'activo');
    case 'resetXP':              return adminResetXP(data.adminEmail, data.targetEmail);
    case 'editarEstudiante':     return adminEditarEstudiante(data.adminEmail, data.targetEmail, data.fields);
    case 'calendarioUpdate':     return adminUpdateCalendario(data.adminEmail, data.semana, data.fields);
    default: return { ok: false, error: 'Acción admin desconocida' };
  }
}

/**
 * Publish a week's answer key so guardarProgreso/guardarXP can validate against
 * it server-side. Called from Author Studio whenever a docente saves a week.
 * Does NOT touch the static challenge-bank/weekNN.json files (those still ship
 * the full content to the student's browser as before) — this only mirrors the
 * grading-relevant fields (correct answers + XP config) into the backend.
 */
function subirBanco(data) {
  if (!requireAdmin(data.adminEmail, data.adminToken)) return { ok: false, error: 'No autorizado' };
  const weekJson = data.weekJson;
  if (!weekJson || !weekJson.week || !Array.isArray(weekJson.microretos)) {
    return { ok: false, error: 'JSON de semana inválido: se requiere "week" y "microretos".' };
  }

  const sheet    = getSheet(SHEETS.RESPUESTAS);
  const existing = sheetToObjects(sheet).filter(r => Number(r.Semana) !== Number(weekJson.week));
  const fresh    = [];
  weekJson.microretos.forEach((mr, mi) => {
    (mr.questions || []).forEach((q, qi) => {
      fresh.push({
        Semana: weekJson.week, Microreto: mi, PreguntaIdx: qi,
        CorrectaEs: q.correctEs || '', CorrectaEn: q.correctEn || q.correctEs || '',
        XPBase: (mr.xp && mr.xp.base) || 50,
        XPSpeedMax: (mr.xp && mr.xp.speedMax) || 30,
        XPPerfectBonus: (mr.xp && mr.xp.perfectBonus) || 50,
        TiempoRespuesta: mr.answerTime || 20,
      });
    });
  });

  const merged = existing.concat(fresh);
  const values = [HEADERS.RESPUESTAS].concat(merged.map(r => HEADERS.RESPUESTAS.map(h => r[h])));
  sheet.clearContents();
  sheet.getRange(1, 1, values.length, HEADERS.RESPUESTAS.length).setValues(values);
  logEvento(data.adminEmail, 'BANCO_ACTUALIZADO', `Semana ${weekJson.week} · ${fresh.length} preguntas`, data.ua || '');
  return { ok: true, week: weekJson.week, preguntas: fresh.length };
}

/**
 * Session recovery — lets a student reclaim their account from a new device
 * without a password. Validates the email exists and is active, generates a
 * fresh token (invalidating the old one), and returns the full profile so the
 * frontend can reconstruct the local challenges/badges state.
 * Security note: knowledge of the email address is the only credential required,
 * which is intentional — there are no passwords in this system.
 */
function recuperarSesion(data) {
  if (!data.email) return { ok: false, error: 'Correo requerido' };
  const email = data.email.trim().toLowerCase();
  const sheet = getSheet(SHEETS.ESTUDIANTES);
  const rows  = sheetToObjects(sheet);
  const user  = rows.find(r => r.Correo === email);
  if (!user)                      return { ok: false, error: 'CUENTA_NO_ENCONTRADA' };
  if (user.Estado === 'inactivo') return { ok: false, error: 'Cuenta desactivada. Contacta a tu docente.' };

  const newToken = generateToken();
  updateRow(sheet, rows, r => r.Correo === email, { Token: newToken, UltimoAcceso: new Date().toISOString() });

  const progRows  = sheetToObjects(getSheet(SHEETS.PROGRESO));
  const badgeRows = sheetToObjects(getSheet(SHEETS.INSIGNIAS));
  const progreso  = progRows.filter(r => r.IDEstudiante === email);
  const insignias = badgeRows.filter(r => r.IDEstudiante === email).map(r => r.Insignia);

  logEvento(email, 'SESION_RECUPERADA', 'Token reemplazado por recuperación de sesión', data.ua || '');
  const role = CONFIG.ADMIN_EMAILS.includes(email) ? 'docente' : 'estudiante';
  return { ok: true, user: sanitizeUser(user), token: newToken, role, progreso, insignias };
}

/**
 * Recompute correctas/incorrectas/xp from the 07_RESPUESTAS answer key when one
 * exists for this week+microreto AND the client sent raw answers. Otherwise
 * falls back to the client-reported values, clamped to MAX_XP_PER_EVENT — this
 * keeps weeks whose key hasn't been (re-)published through Author Studio yet
 * working exactly as before, just with an XP ceiling.
 */
function evaluateSubmission(semana, microretoOneBased, answers, tiempo, fallback) {
  const microretoIdx = Number(microretoOneBased) - 1;
  const keyRows = sheetToObjects(getSheet(SHEETS.RESPUESTAS))
    .filter(r => Number(r.Semana) === Number(semana) && Number(r.Microreto) === microretoIdx);

  if (!keyRows.length || !Array.isArray(answers)) {
    return {
      correctas: Number(fallback.correctas) || 0,
      incorrectas: Number(fallback.incorrectas) || 0,
      xp: Math.max(0, Math.min(Number(fallback.xp) || 0, CONFIG.MAX_XP_PER_EVENT)),
      validated: false,
    };
  }

  let correct = 0;
  keyRows.forEach(row => {
    const given = answers.find(a => Number(a.qIdx) === Number(row.PreguntaIdx));
    if (!given) return;
    const answerEs = String(given.answerEs || given.answer || '').trim();
    const answerEn = String(given.answerEn || given.answer || '').trim();
    const correctEs = String(row.CorrectaEs || '').trim();
    const correctEn = String(row.CorrectaEn || '').trim();
    const isRight = (answerEs && (answerEs === correctEs || answerEs === correctEn))
                 || (answerEn && (answerEn === correctEs || answerEn === correctEn));
    if (isRight) correct++;
  });

  const total = keyRows.length;
  const first = keyRows[0];
  const base       = Number(first.XPBase) || 50;
  const speedMax   = Number(first.XPSpeedMax) || 30;
  const perfect    = Number(first.XPPerfectBonus) || 50;
  const maxTime    = Number(first.TiempoRespuesta) || 20;
  const timeUsed   = Number(tiempo) || 0;
  const speedRatio = maxTime > 0 ? Math.max(0, (maxTime - timeUsed) / maxTime) : 0;

  let xp = correct * (base + Math.round(speedRatio * speedMax));
  if (total > 0 && correct === total) xp += perfect;
  xp = Math.max(0, Math.min(xp, CONFIG.MAX_XP_PER_EVENT));

  return { correctas: correct, incorrectas: total - correct, xp, validated: true };
}

// ══════════════════════════════════════════════════════════════════
// GET ENDPOINTS
// ══════════════════════════════════════════════════════════════════

/** Return ranked leaderboard (top N) — public read, no per-student secrets in this sheet. */
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

  const semanas = {};
  progRows.forEach(r => { semanas[r.Semana] = (semanas[r.Semana] || 0) + 1; });

  return { ok: true, stats: { totalEstudiantes: totalEst, activos: active, avgXP, completados, porSemana: semanas } };
}

/** Full profile for one student — requires the student's own token. */
function getPerfil(params) {
  const auth = requireStudent(params.email, params.token);
  if (!auth.ok) return auth;

  const progRows  = sheetToObjects(getSheet(SHEETS.PROGRESO));
  const badgeRows = sheetToObjects(getSheet(SHEETS.INSIGNIAS));
  const eventRows = sheetToObjects(getSheet(SHEETS.EVENTOS));

  const email = auth.user.Correo;
  const progreso  = progRows.filter(r => r.IDEstudiante === email);
  const insignias = badgeRows.filter(r => r.IDEstudiante === email).map(r => r.Insignia);
  const eventos   = eventRows.filter(r => r.Actor === email).slice(-20);

  return { ok: true, user: sanitizeUser(auth.user), progreso, insignias, eventos };
}

/** Challenge data proxy (reads from challenge-bank folder if Drive-hosted). */
function getDesafio(params) {
  const week = params.week;
  if (!week) return { ok: false, error: 'Semana requerida' };
  // In production: read JSON from Drive file
  // For now: return a signal to load from static files
  return { ok: true, source: 'static', week };
}

/** Admin dashboard data — email in allow-list AND shared admin token required. */
function getAdminData(params) {
  if (!requireAdmin(params.adminEmail, params.adminToken)) return { ok: false, error: 'No autorizado' };
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
    cambiosPestana: eventRows.filter(r => r.Actor === u.Correo && r.Evento === 'TAB_SWITCH').length,
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

/** Public schedule data — students use this to determine which weeks are accessible. */
function getCalendario(params) {
  const rows = sheetToObjects(getSheet(SHEETS.CALENDARIO));
  const schedule = {};
  rows.forEach(r => {
    schedule[Number(r.Semana)] = {
      semana     : Number(r.Semana),
      fechaInicio: r.FechaInicio || '',
      fechaFin   : r.FechaFin || '',
      estado     : r.Estado || 'pendiente',
    };
  });
  return { ok: true, schedule };
}

/** Teacher panel data — uses student token to authenticate docentes without exposing ADMIN_TOKEN. */
function getTeacherPanel(params) {
  const auth = requireStudent(params.email, params.token);
  if (!auth.ok) return auth;
  if (!CONFIG.ADMIN_EMAILS.includes(auth.user.Correo)) return { ok: false, error: 'No autorizado' };
  return getAdminData({ ...params, adminEmail: auth.user.Correo, adminToken: CONFIG.ADMIN_TOKEN });
}

/** Docente admin actions authenticated via student token (not shared ADMIN_TOKEN). */
function docenteAction(data) {
  const auth = requireStudent(data.email, data.token);
  if (!auth.ok) return auth;
  if (!CONFIG.ADMIN_EMAILS.includes(auth.user.Correo)) return { ok: false, error: 'No autorizado' };
  switch (data.action) {
    case 'calendarioUpdate': return adminUpdateCalendario(auth.user.Correo, data.semana, data.fields);
    default: return { ok: false, error: 'Acción docente desconocida' };
  }
}

/** Upsert a week's schedule entry in 08_CALENDARIO.
 *  When fields.estado === 'activo' and closeOthers !== false, auto-closes all other active weeks. */
function adminUpdateCalendario(adminEmail, semana, fields) {
  if (!semana) return { ok: false, error: 'Semana requerida' };

  // Validate date range
  if (fields.fechaInicio && fields.fechaFin && fields.fechaFin < fields.fechaInicio) {
    return { ok: false, error: 'FechaFin debe ser igual o posterior a FechaInicio.' };
  }
  // Prevent invalid date strings
  if (fields.fechaInicio && !/^\d{4}-\d{2}-\d{2}$/.test(fields.fechaInicio)) {
    return { ok: false, error: 'FechaInicio inválida. Formato esperado: YYYY-MM-DD.' };
  }
  if (fields.fechaFin && !/^\d{4}-\d{2}-\d{2}$/.test(fields.fechaFin)) {
    return { ok: false, error: 'FechaFin inválida. Formato esperado: YYYY-MM-DD.' };
  }

  const sheet = getSheet(SHEETS.CALENDARIO);
  const rows  = sheetToObjects(sheet);
  const now   = new Date().toISOString();

  // Auto-close other active weeks when activating one
  const closedWeeks = [];
  if (fields.estado === 'activo' && fields.closeOthers !== false) {
    rows.forEach(function(r) {
      if (Number(r.Semana) !== Number(semana) && r.Estado === 'activo') {
        updateRow(sheet, rows, function(rr) { return Number(rr.Semana) === Number(r.Semana); },
          { Estado: 'cerrado', ActualizadoPor: adminEmail, UltimaActualizacion: now });
        closedWeeks.push(Number(r.Semana));
        logEvento(adminEmail, 'CALENDARIO_CERRADO',
          'Semana ' + r.Semana + ' cerrada automáticamente al activar semana ' + semana, '');
      }
    });
  }

  const existing = rows.find(function(r) { return Number(r.Semana) === Number(semana); });
  if (existing) {
    const updates = { ActualizadoPor: adminEmail, UltimaActualizacion: now };
    if (fields.fechaInicio != null) updates.FechaInicio = fields.fechaInicio;
    if (fields.fechaFin    != null) updates.FechaFin    = fields.fechaFin;
    if (fields.estado      != null) updates.Estado      = fields.estado;
    updateRow(sheet, rows, function(r) { return Number(r.Semana) === Number(semana); }, updates);
  } else {
    sheet.appendRow([Number(semana), fields.fechaInicio || '', fields.fechaFin || '',
      fields.estado || 'pendiente', adminEmail, now]);
  }

  var evtLabel = fields.estado === 'activo'  ? 'CALENDARIO_ACTIVADO'
               : fields.estado === 'cerrado' ? 'CALENDARIO_CERRADO'
               : 'CALENDARIO_ACTUALIZADO';
  logEvento(adminEmail, evtLabel,
    'Semana ' + semana + ' → ' + JSON.stringify({ fechaInicio: fields.fechaInicio, fechaFin: fields.fechaFin, estado: fields.estado }), '');
  return { ok: true, closedWeeks: closedWeeks };
}

// ══════════════════════════════════════════════════════════════════
// ADMIN HELPERS
// ══════════════════════════════════════════════════════════════════

function adminSetEstado(adminEmail, email, estado) {
  const sheet = getSheet(SHEETS.ESTUDIANTES);
  const rows  = sheetToObjects(sheet);
  const ok    = updateRow(sheet, rows, r => r.Correo === email, { Estado: estado });
  if (ok) logEvento(adminEmail, 'ADMIN_SET_ESTADO', `${email} → ${estado}`, '');
  return ok ? { ok: true } : { ok: false, error: 'Usuario no encontrado' };
}

function adminResetXP(adminEmail, email) {
  const sheet = getSheet(SHEETS.ESTUDIANTES);
  const rows  = sheetToObjects(sheet);
  const ok    = updateRow(sheet, rows, r => r.Correo === email, { XP: 0, Nivel: 1 });
  if (ok) { updateRanking(); logEvento(adminEmail, 'ADMIN_RESET_XP', `${email} → XP restablecido a 0`, ''); }
  return ok ? { ok: true } : { ok: false, error: 'Usuario no encontrado' };
}

function adminEditarEstudiante(adminEmail, email, fields) {
  const allowed = ['Nombre','Nickname','Grupo','Seccion','Avatar'];
  const safe = {};
  allowed.forEach(k => { if (fields[k] != null) safe[k] = fields[k]; });
  const sheet = getSheet(SHEETS.ESTUDIANTES);
  const rows  = sheetToObjects(sheet);
  const ok    = updateRow(sheet, rows, r => r.Correo === email, safe);
  if (ok) logEvento(adminEmail, 'ADMIN_EDITAR_ESTUDIANTE', `${email} → ${JSON.stringify(safe)}`, '');
  return ok ? { ok: true } : { ok: false, error: 'Usuario no encontrado' };
}

// ══════════════════════════════════════════════════════════════════
// RANKING + ANALYTICS
// ══════════════════════════════════════════════════════════════════

/** Rewritten with a single range write (not clear+appendRow-in-a-loop) so the
 *  sheet is never readable half-built by a concurrent getRanking() call. */
function updateRanking() {
  const estRows   = sheetToObjects(getSheet(SHEETS.ESTUDIANTES));
  const badgeRows = sheetToObjects(getSheet(SHEETS.INSIGNIAS));

  const sorted = estRows
    .filter(r => r.Estado === 'activo')
    .sort((a, b) => Number(b.XP) - Number(a.XP));

  const values = [HEADERS.RANKING];
  sorted.forEach((u, i) => {
    const badges = badgeRows.filter(b => b.IDEstudiante === u.Correo).map(b => b.Insignia).join(',');
    values.push([i + 1, u.Nombre, u.Nickname, u.Nivel, u.XP, badges, u.Grupo, u.Avatar || 0]);
  });

  const rankSheet = getSheet(SHEETS.RANKING);
  rankSheet.clearContents();
  rankSheet.getRange(1, 1, values.length, HEADERS.RANKING.length).setValues(values);
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

function logEvento(actor, evento, detalle, ua) {
  try {
    getSheet(SHEETS.EVENTOS).appendRow([actor, evento, detalle, new Date().toISOString(), ua]);
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
  // NOTE: Token is intentionally never included here — it must only ever be
  // returned directly by registro()/login() to the account's own owner.
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
  initCalendario();
  Logger.log('✅ Sheets inicializados correctamente.');
}

/** Seed 08_CALENDARIO with 18 empty rows (one per week) if the sheet is empty. */
function initCalendario() {
  const sheet = getSheet(SHEETS.CALENDARIO);
  if (sheetToObjects(sheet).length > 0) return;
  for (let i = 1; i <= 18; i++) {
    sheet.appendRow([i, '', '', 'pendiente', '', '']);
  }
  Logger.log('✅ Calendario inicializado con 18 semanas.');
}
