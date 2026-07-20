/**
 * DATA-01: Migración Inteligente y Consolidación de Estudiantes
 *
 * Ejecutar manualmente desde el editor de Apps Script:
 *   seleccionar "migracionEstudiantes" en el menú → Run.
 *
 * IDEMPOTENTE: si no existen duplicados, solo valida y genera informe sin
 *   modificar ningún dato.
 *
 * Restricciones respetadas:
 *   - No modifica ninguna función de producción (Code.gs intacto).
 *   - No modifica la estructura de las hojas ni sus encabezados.
 *   - Solo consolida filas duplicadas y reconstruye ranking / analítica.
 *   - Identidad única = email.trim().toLowerCase()  (nunca nombre/nickname).
 *
 * Transacción lógica:
 *   1. Respaldo  2. Análisis  3. Consolidación  4. Validación previa
 *   5. Escritura  6. Eliminación  7. Reconstrucción  8. Validación post
 *   9. Informe
 */

const _MIG_DATE = '2026-07-20';

// ─────────────────────────────────────────────────────────────────────────────
// FUNCIÓN PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

function migracionEstudiantes() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);

  const stats = {
    estudiantesAntes:      0,
    estudiantesDespues:    0,
    correoUnicos:          0,
    duplicadosEncontrados: 0,
    perfilesConsolidados:  0,
    eliminados:            { estudiantes: 0, progreso: 0, insignias: 0, eventos: 0 },
    xpDetails:             [],
    desafiosRecuperados:   0,
    microretosRecuperados: 0,
    insigniasRecuperadas:  0,
    eventosRecuperados:    0,
    inconsistencias:       [],
    validaciones:          [],
    integridadConfirmada:  false,
  };

  try {

    // ═══════════════════════════════════════════════════════════════════════════
    // PASO 1 — RESPALDO (idempotente: omite hojas ya respaldadas)
    // ═══════════════════════════════════════════════════════════════════════════
    _migBackup(ss);

    // ═══════════════════════════════════════════════════════════════════════════
    // PASO 2 — CARGAR Y ANALIZAR
    // ═══════════════════════════════════════════════════════════════════════════
    const estSheet  = _migSheet(ss, SHEETS.ESTUDIANTES);
    const progSheet = _migSheet(ss, SHEETS.PROGRESO);
    const insSheet  = _migSheet(ss, SHEETS.INSIGNIAS);
    const evtSheet  = _migSheet(ss, SHEETS.EVENTOS);

    const est  = _migLoad(estSheet);
    const prog = _migLoad(progSheet);
    const ins  = _migLoad(insSheet);
    const evt  = _migLoad(evtSheet);

    stats.estudiantesAntes = est.rows.length;

    const nrm = function(e) { return (e || '').toString().trim().toLowerCase(); };

    // Agrupar por correo normalizado
    const grupos = {};
    est.rows.forEach(function(r) {
      const k = nrm(r.Correo);
      if (!k) return;
      if (!grupos[k]) grupos[k] = [];
      grupos[k].push(r);
    });

    stats.correoUnicos = Object.keys(grupos).length;
    const dups = Object.entries(grupos).filter(function(entry) { return entry[1].length > 1; });
    stats.duplicadosEncontrados = dups.length;

    if (!dups.length) {
      stats.validaciones.push('Sin duplicados detectados. Datos ya consolidados.');
      _migPostValidate(est, prog, ins, stats);
      _migReport(ss, stats);
      Logger.log('DATA-01: Sin duplicados. No se realizaron cambios.');
      return;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PASO 3 — CONSOLIDAR
    // ═══════════════════════════════════════════════════════════════════════════
    const estDel  = new Set();
    const progDel = new Set();
    const insDel  = new Set();
    const evtDel  = new Set();
    const pendingUpdates = [];   // { sheet, row, col, val }

    dups.forEach(function(entry) {
      const canonical = entry[0];
      const dupRows   = entry[1];

      // Primario = acceso más reciente (contiene el token más nuevo)
      const sorted = dupRows.slice().sort(function(a, b) {
        return new Date(b.UltimoAcceso || 0) - new Date(a.UltimoAcceso || 0);
      });
      const primary     = sorted[0];
      const secundarios = sorted.slice(1);
      secundarios.forEach(function(r) { estDel.add(r._row); });

      // ── PROGRESO: mejor XP por (Semana, Microreto) ─────────────────────────
      const miProg = prog.rows.filter(function(r) { return nrm(r.IDEstudiante) === canonical; });
      const mejor  = {};
      miProg.forEach(function(r) {
        const k  = r.Semana + '|' + r.Microreto;
        const rx = Number(r.XP) || 0;
        if (!mejor[k]) {
          mejor[k] = r;
        } else {
          const bx    = Number(mejor[k].XP) || 0;
          const newer = new Date(r.Fecha) > new Date(mejor[k].Fecha);
          if (rx > bx || (rx === bx && newer)) {
            progDel.add(mejor[k]._row);
            mejor[k] = r;
          } else {
            progDel.add(r._row);
          }
        }
      });
      const survProg = Object.values(mejor);

      // ── XP: recalcular desde progreso consolidado; fallback = máximo ────────
      const xpRecalc = survProg.reduce(function(s, r) { return s + (Number(r.XP) || 0); }, 0);
      const xpMax    = Math.max.apply(null, [0].concat(dupRows.map(function(r) { return Number(r.XP) || 0; })));
      const xpFinal  = xpRecalc > 0 ? xpRecalc : xpMax;
      const lvlFinal = calcLevel(xpFinal);

      stats.xpDetails.push({ correo: canonical, xpMax: xpMax, xpRecalc: xpRecalc, xpFinal: xpFinal });
      stats.microretosRecuperados += survProg.length;
      const semanasUnicas = new Set(survProg.map(function(r) { return r.Semana; }));
      stats.desafiosRecuperados += semanasUnicas.size;

      // ── INSIGNIAS: una por tipo, la más antigua ─────────────────────────────
      const miIns  = ins.rows.filter(function(r) { return nrm(r.IDEstudiante) === canonical; });
      const insMap = {};
      miIns.forEach(function(r) {
        if (!insMap[r.Insignia]) {
          insMap[r.Insignia] = r;
        } else if (new Date(r.Fecha) < new Date(insMap[r.Insignia].Fecha)) {
          insDel.add(insMap[r.Insignia]._row);
          insMap[r.Insignia] = r;
        } else {
          insDel.add(r._row);
        }
      });
      stats.insigniasRecuperadas += Object.keys(insMap).length;

      // ── EVENTOS: conservar historial, eliminar duplicados exactos ───────────
      const miEvt = evt.rows.filter(function(r) { return nrm(r.Actor) === canonical; });
      const seen  = new Set();
      var evtCount = 0;
      miEvt.forEach(function(r) {
        const k = [nrm(r.Actor), r.Evento, r.Detalle, r.Fecha].join('\x00');
        if (seen.has(k)) { evtDel.add(r._row); }
        else             { seen.add(k); evtCount++; }
      });
      stats.eventosRecuperados += evtCount;

      // ── Actualizar fila primaria de ESTUDIANTES ──────────────────────────────
      const regMin = dupRows.reduce(function(min, r) {
        return (!min || new Date(r.FechaRegistro || 0) < new Date(min || 0))
          ? (r.FechaRegistro || min) : min;
      }, null);
      const estado = dupRows.some(function(r) { return (r.Estado || '') === 'activo'; })
        ? 'activo' : primary.Estado;

      var col = est.hdrMap;
      pendingUpdates.push(
        { sheet: estSheet, row: primary._row, col: col['Correo']        + 1, val: canonical },
        { sheet: estSheet, row: primary._row, col: col['XP']            + 1, val: xpFinal   },
        { sheet: estSheet, row: primary._row, col: col['Nivel']         + 1, val: lvlFinal  },
        { sheet: estSheet, row: primary._row, col: col['FechaRegistro'] + 1, val: regMin    },
        { sheet: estSheet, row: primary._row, col: col['Estado']        + 1, val: estado    }
      );

      stats.perfilesConsolidados++;
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // PASO 4 — VALIDAR ANTES DE ESCRIBIR
    // ═══════════════════════════════════════════════════════════════════════════
    if (stats.inconsistencias.length > 0) {
      throw new Error('Inconsistencias detectadas antes de escribir:\n' + stats.inconsistencias.join('\n'));
    }
    stats.validaciones.push('Pre-escritura: ' + stats.perfilesConsolidados + ' perfiles listos, sin inconsistencias críticas.');

    // ═══════════════════════════════════════════════════════════════════════════
    // PASO 5 — APLICAR ACTUALIZACIONES
    // ═══════════════════════════════════════════════════════════════════════════
    pendingUpdates.forEach(function(u) { u.sheet.getRange(u.row, u.col).setValue(u.val); });
    SpreadsheetApp.flush();

    // ═══════════════════════════════════════════════════════════════════════════
    // PASO 6 — ELIMINAR FILAS DUPLICADAS (de abajo hacia arriba)
    // ═══════════════════════════════════════════════════════════════════════════
    _migDelRows(estSheet,  estDel);
    _migDelRows(progSheet, progDel);
    _migDelRows(insSheet,  insDel);
    _migDelRows(evtSheet,  evtDel);

    stats.eliminados.estudiantes = estDel.size;
    stats.eliminados.progreso    = progDel.size;
    stats.eliminados.insignias   = insDel.size;
    stats.eliminados.eventos     = evtDel.size;
    stats.estudiantesDespues     = stats.estudiantesAntes - estDel.size;

    // ═══════════════════════════════════════════════════════════════════════════
    // PASO 7 — RECONSTRUIR RANKING Y ANALÍTICA DESDE DATOS CONSOLIDADOS
    // ═══════════════════════════════════════════════════════════════════════════
    _migSheet(ss, SHEETS.RANKING).clearContents();
    _migSheet(ss, SHEETS.ANALITICA).clearContents();
    updateRanking();
    recalcAnalitica();

    // ═══════════════════════════════════════════════════════════════════════════
    // PASO 8 — VALIDAR POST-MIGRACIÓN
    // ═══════════════════════════════════════════════════════════════════════════
    const estPost  = _migLoad(_migSheet(ss, SHEETS.ESTUDIANTES));
    const progPost = _migLoad(_migSheet(ss, SHEETS.PROGRESO));
    const insPost  = _migLoad(_migSheet(ss, SHEETS.INSIGNIAS));
    _migPostValidate(estPost, progPost, insPost, stats);

  } catch (e) {
    stats.inconsistencias.push('ERROR FATAL: ' + e.message);
    Logger.log('DATA-01 ERROR: ' + e.message + '\n' + (e.stack || ''));
    _migReport(ss, stats);
    throw e;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PASO 9 — GENERAR INFORME
  // ═══════════════════════════════════════════════════════════════════════════
  _migReport(ss, stats);
  Logger.log('DATA-01 completado. Integridad: ' + (stats.integridadConfirmada ? 'CONFIRMADA' : 'CON ADVERTENCIAS'));
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS INTERNOS (prefijo _mig para evitar conflictos con Code.gs)
// ─────────────────────────────────────────────────────────────────────────────

function _migBackup(ss) {
  var targets = [
    [SHEETS.ESTUDIANTES, '01'], [SHEETS.PROGRESO,   '02'],
    [SHEETS.INSIGNIAS,   '03'], [SHEETS.RANKING,    '04'],
    [SHEETS.EVENTOS,     '05'], [SHEETS.ANALITICA,  '06'],
    [SHEETS.CALENDARIO,  '08'],
  ];
  targets.forEach(function(pair) {
    var name       = pair[0];
    var key        = pair[1];
    var backupName = 'BACKUP_' + _MIG_DATE + '_' + key + '_' + name;
    if (ss.getSheetByName(backupName)) {
      Logger.log('Respaldo ya existe, omitido: ' + backupName);
      return;
    }
    var src = ss.getSheetByName(name);
    if (!src) { Logger.log('Hoja no encontrada, omitida del respaldo: ' + name); return; }
    try {
      src.copyTo(ss).setName(backupName);
      Logger.log('Respaldo creado: ' + backupName);
    } catch (e) {
      throw new Error('No se pudo crear respaldo de "' + name + '": ' + e.message);
    }
  });
}

function _migSheet(ss, name) {
  var s = ss.getSheetByName(name);
  if (!s) throw new Error('Hoja requerida no encontrada: ' + name);
  return s;
}

/** Carga una hoja en { rows, headers, hdrMap }. Cada fila incluye _row (1-based). */
function _migLoad(sheet) {
  var data    = sheet.getDataRange().getValues();
  if (data.length < 1) return { rows: [], headers: [], hdrMap: {} };
  var headers = data[0].map(String);
  var hdrMap  = {};
  headers.forEach(function(h, i) { hdrMap[h] = i; });
  var rows = data.length < 2 ? [] : data.slice(1).map(function(row, i) {
    var obj = { _row: i + 2 };
    headers.forEach(function(h, j) { obj[h] = row[j]; });
    return obj;
  });
  return { rows: rows, headers: headers, hdrMap: hdrMap };
}

/** Elimina filas del set de índices, de abajo hacia arriba para no desplazar índices. */
function _migDelRows(sheet, rowIdxSet) {
  if (!rowIdxSet.size) return;
  var sorted = Array.from(rowIdxSet).sort(function(a, b) { return b - a; });
  sorted.forEach(function(idx) { sheet.deleteRow(idx); });
  SpreadsheetApp.flush();
}

/** Valida integridad post-migración. Actualiza stats.validaciones y stats.inconsistencias. */
function _migPostValidate(est, prog, ins, stats) {
  var nrm = function(e) { return (e || '').toString().trim().toLowerCase(); };

  // 1. Cada correo exactamente una vez
  var emailSet = new Set();
  var estDups  = 0;
  est.rows.forEach(function(r) {
    var e = nrm(r.Correo);
    if (emailSet.has(e)) estDups++; else emailSet.add(e);
  });
  if (estDups === 0)
    stats.validaciones.push('✓ Cada correo aparece exactamente una vez en 01_ESTUDIANTES.');
  else
    stats.inconsistencias.push('✗ ' + estDups + ' correos duplicados aún presentes en 01_ESTUDIANTES.');

  // 2. Sin huérfanos en PROGRESO
  var orphProg = prog.rows.filter(function(r) { return !emailSet.has(nrm(r.IDEstudiante)); }).length;
  if (orphProg === 0)
    stats.validaciones.push('✓ Sin registros huérfanos en 02_PROGRESO.');
  else
    stats.inconsistencias.push('✗ ' + orphProg + ' registros huérfanos en 02_PROGRESO.');

  // 3. Sin huérfanos en INSIGNIAS
  var orphIns = ins.rows.filter(function(r) { return !emailSet.has(nrm(r.IDEstudiante)); }).length;
  if (orphIns === 0)
    stats.validaciones.push('✓ Sin registros huérfanos en 03_INSIGNIAS.');
  else
    stats.inconsistencias.push('✗ ' + orphIns + ' registros huérfanos en 03_INSIGNIAS.');

  // 4. Sin (correo, semana, microreto) duplicados en PROGRESO
  var progKeys = new Set();
  var progDups = 0;
  prog.rows.forEach(function(r) {
    var k = nrm(r.IDEstudiante) + '|' + r.Semana + '|' + r.Microreto;
    if (progKeys.has(k)) progDups++; else progKeys.add(k);
  });
  if (progDups === 0)
    stats.validaciones.push('✓ Sin microretos duplicados en 02_PROGRESO.');
  else
    stats.inconsistencias.push('✗ ' + progDups + ' microretos duplicados en 02_PROGRESO.');

  // 5. Sin (correo, insignia) duplicados en INSIGNIAS
  var insKeys = new Set();
  var insDups = 0;
  ins.rows.forEach(function(r) {
    var k = nrm(r.IDEstudiante) + '|' + r.Insignia;
    if (insKeys.has(k)) insDups++; else insKeys.add(k);
  });
  if (insDups === 0)
    stats.validaciones.push('✓ Sin insignias duplicadas en 03_INSIGNIAS.');
  else
    stats.inconsistencias.push('✗ ' + insDups + ' insignias duplicadas en 03_INSIGNIAS.');

  stats.integridadConfirmada = stats.inconsistencias.length === 0;
}

/** Escribe el informe en una hoja del spreadsheet. */
function _migReport(ss, stats) {
  var sheetName = 'DATA01_REPORTE_' + _MIG_DATE;
  var sheet     = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  else sheet.clearContents();

  var rows = [];
  var r    = function() { rows.push(Array.prototype.slice.call(arguments)); };

  r('DATA-01 — Migración y Consolidación de Estudiantes');
  r('Fecha de ejecución:', new Date().toISOString());
  r('');
  r('RESUMEN GENERAL');
  r('Estudiantes antes de la migración:',  stats.estudiantesAntes);
  r('Estudiantes después de la migración:', stats.estudiantesDespues || stats.estudiantesAntes - stats.eliminados.estudiantes);
  r('Correos únicos analizados:',           stats.correoUnicos);
  r('Grupos duplicados encontrados:',       stats.duplicadosEncontrados);
  r('Perfiles consolidados:',               stats.perfilesConsolidados);
  r('');
  r('REGISTROS ELIMINADOS');
  r('01_ESTUDIANTES:',  stats.eliminados.estudiantes);
  r('02_PROGRESO:',     stats.eliminados.progreso);
  r('03_INSIGNIAS:',    stats.eliminados.insignias);
  r('05_EVENTOS:',      stats.eliminados.eventos);
  r('');
  r('INFORMACIÓN ACADÉMICA RECUPERADA');
  r('Desafíos (semanas únicas):',  stats.desafiosRecuperados);
  r('Microretos (intentos best):',  stats.microretosRecuperados);
  r('Insignias únicas:',            stats.insigniasRecuperadas);
  r('Eventos (sin duplicados):',    stats.eventosRecuperados);
  r('');

  if (stats.xpDetails.length) {
    r('DETALLE XP POR PERFIL CONSOLIDADO');
    r('Correo', 'XP Máx (antes)', 'XP Recalculado', 'XP Final', 'Método');
    stats.xpDetails.forEach(function(d) {
      r(d.correo, d.xpMax, d.xpRecalc, d.xpFinal,
        d.xpRecalc > 0 ? 'Recalculado desde progreso' : 'Máximo de duplicados');
    });
    r('');
  }

  r('VALIDACIONES EJECUTADAS');
  (stats.validaciones.length ? stats.validaciones : ['(ninguna)']).forEach(function(v) { r(v); });
  r('');
  r('INCONSISTENCIAS DETECTADAS');
  (stats.inconsistencias.length ? stats.inconsistencias : ['Ninguna']).forEach(function(i) { r(i); });
  r('');
  r('INTEGRIDAD DE DATOS:', stats.integridadConfirmada ? '✓ CONFIRMADA' : '⚠ CON ADVERTENCIAS — revisar inconsistencias');

  var maxCols = Math.max.apply(null, rows.map(function(l) { return l.length; }).concat([1]));
  var padded  = rows.map(function(l) {
    while (l.length < maxCols) l.push('');
    return l;
  });
  sheet.getRange(1, 1, padded.length, maxCols).setValues(padded);
  Logger.log('DATA-01: Informe escrito en hoja "' + sheetName + '".');
}
