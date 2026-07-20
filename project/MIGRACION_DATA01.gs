/**
 * DATA-01: Migración Inteligente y Consolidación de Estudiantes (v2 — Hardened)
 *
 * Ejecutar manualmente desde el editor de Apps Script:
 *   seleccionar "migracionEstudiantes" en el menú → Run.
 *
 * IDEMPOTENTE: si no existen duplicados, solo valida y genera informe sin
 *   modificar ningún dato.
 *
 * Mejoras DATA-01B (hardening):
 *   - LockService: previene ejecuciones concurrentes
 *   - PropertiesService: detecta migraciones incompletas previas
 *   - Protección RANKING/ANALITICA: copia temporal antes de reconstruir
 *   - Normalización de Actor en 05_EVENTOS al correo canónico
 *   - Validación real previa a la escritura (_migPreValidate)
 *   - Verificación final post-reconstrucción (_migFinalVerify)
 *   - Informe técnico ampliado con duración, conteos y advertencias
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

const _MIG_DATE     = '2026-07-20';
const _MIG_LOCK_FLAG = 'MIGRATION_RUNNING';

// ─────────────────────────────────────────────────────────────────────────────
// FUNCIÓN PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

function migracionEstudiantes() {
  var startTime = new Date().getTime();
  var ss    = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var props = PropertiesService.getScriptProperties();

  var stats = {
    startTime:             startTime,
    duration:              0,
    estudiantesAntes:      0,
    estudiantesDespues:    0,
    correoUnicos:          0,
    duplicadosEncontrados: 0,
    perfilesConsolidados:  0,
    backupsCreados:        0,
    filasActualizadas:     0,
    eliminados:            { estudiantes: 0, progreso: 0, insignias: 0, eventos: 0 },
    xpDetails:             [],
    xpTotal:               0,
    desafiosRecuperados:   0,
    microretosRecuperados: 0,
    insigniasRecuperadas:  0,
    eventosRecuperados:    0,
    rankingGenerado:       false,
    analiticaGenerada:     false,
    inconsistencias:       [],
    warnings:              [],
    validaciones:          [],
    integridadConfirmada:  false,
  };

  // ── Detectar migración previa incompleta ───────────────────────────────────
  if (props.getProperty(_MIG_LOCK_FLAG) === 'true') {
    var flagMsg = 'Se detectó una migración anterior incompleta (flag MIGRATION_RUNNING activo). ' +
      'Revise el estado del spreadsheet antes de ejecutar nuevamente. ' +
      'Si está seguro de que no hay datos en estado intermedio, elimine la propiedad con: ' +
      'PropertiesService.getScriptProperties().deleteProperty("MIGRATION_RUNNING")';
    stats.inconsistencias.push('ERROR: ' + flagMsg);
    _migReport(ss, stats);
    throw new Error(flagMsg);
  }

  try {

    // ═══════════════════════════════════════════════════════════════════════════
    // PASO 1 — RESPALDO (idempotente: omite hojas ya respaldadas)
    // ═══════════════════════════════════════════════════════════════════════════
    stats.backupsCreados = _migBackup(ss);

    // ═══════════════════════════════════════════════════════════════════════════
    // PASO 2 — CARGAR Y ANALIZAR
    // ═══════════════════════════════════════════════════════════════════════════
    var estSheet  = _migSheet(ss, SHEETS.ESTUDIANTES);
    var progSheet = _migSheet(ss, SHEETS.PROGRESO);
    var insSheet  = _migSheet(ss, SHEETS.INSIGNIAS);
    var evtSheet  = _migSheet(ss, SHEETS.EVENTOS);

    var est  = _migLoad(estSheet);
    var prog = _migLoad(progSheet);
    var ins  = _migLoad(insSheet);
    var evt  = _migLoad(evtSheet);

    stats.estudiantesAntes = est.rows.length;

    var nrm = function(e) { return (e || '').toString().trim().toLowerCase(); };

    // Agrupar por correo normalizado
    var grupos = {};
    est.rows.forEach(function(r) {
      var k = nrm(r.Correo);
      if (!k) return;
      if (!grupos[k]) grupos[k] = [];
      grupos[k].push(r);
    });

    stats.correoUnicos = Object.keys(grupos).length;
    var dups = Object.entries(grupos).filter(function(entry) { return entry[1].length > 1; });
    stats.duplicadosEncontrados = dups.length;

    if (!dups.length) {
      stats.estudiantesDespues = stats.estudiantesAntes;
      stats.validaciones.push('Sin duplicados detectados. Datos ya consolidados.');
      _migPostValidate(est, prog, ins, stats);
      stats.duration = new Date().getTime() - startTime;
      _migReport(ss, stats);
      Logger.log('DATA-01: Sin duplicados. No se realizaron cambios.');
      return;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PASO 3 — CONSOLIDAR (en memoria; sin escrituras aún)
    // ═══════════════════════════════════════════════════════════════════════════
    var estDel  = new Set();
    var progDel = new Set();
    var insDel  = new Set();
    var evtDel  = new Set();
    var pendingUpdates = [];   // { sheet, row, col, val }

    var evtColActor = evt.hdrMap['Actor'] !== undefined ? evt.hdrMap['Actor'] + 1 : null;

    dups.forEach(function(entry) {
      var canonical = entry[0];
      var dupRows   = entry[1];

      // Primario = acceso más reciente (contiene el token más nuevo)
      var sorted = dupRows.slice().sort(function(a, b) {
        return new Date(b.UltimoAcceso || 0) - new Date(a.UltimoAcceso || 0);
      });
      var primary = sorted[0];
      sorted.slice(1).forEach(function(r) { estDel.add(r._row); });

      // ── PROGRESO: mejor XP por (Semana, Microreto) ─────────────────────────
      var miProg = prog.rows.filter(function(r) { return nrm(r.IDEstudiante) === canonical; });
      var mejor  = {};
      miProg.forEach(function(r) {
        var k  = r.Semana + '|' + r.Microreto;
        var rx = Number(r.XP) || 0;
        if (!mejor[k]) {
          mejor[k] = r;
        } else {
          var bx    = Number(mejor[k].XP) || 0;
          var newer = new Date(r.Fecha) > new Date(mejor[k].Fecha);
          if (rx > bx || (rx === bx && newer)) {
            progDel.add(mejor[k]._row);
            mejor[k] = r;
          } else {
            progDel.add(r._row);
          }
        }
      });
      var survProg = Object.values(mejor);

      // ── XP: recalcular desde progreso consolidado; fallback = máximo ────────
      var xpRecalc = survProg.reduce(function(s, r) { return s + (Number(r.XP) || 0); }, 0);
      var xpMax    = Math.max.apply(null, [0].concat(dupRows.map(function(r) { return Number(r.XP) || 0; })));
      var xpFinal  = xpRecalc > 0 ? xpRecalc : xpMax;
      var lvlFinal = calcLevel(xpFinal);

      stats.xpDetails.push({ correo: canonical, xpMax: xpMax, xpRecalc: xpRecalc, xpFinal: xpFinal });
      stats.microretosRecuperados += survProg.length;
      var semanasUnicas = new Set(survProg.map(function(r) { return r.Semana; }));
      stats.desafiosRecuperados += semanasUnicas.size;

      // ── INSIGNIAS: una por tipo, la más antigua ─────────────────────────────
      var miIns  = ins.rows.filter(function(r) { return nrm(r.IDEstudiante) === canonical; });
      var insMap = {};
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

      // ── EVENTOS: conservar historial, deduplicar exactos, normalizar Actor ──
      var miEvt = evt.rows.filter(function(r) { return nrm(r.Actor) === canonical; });
      var seen  = new Set();
      var evtCount = 0;
      miEvt.forEach(function(r) {
        var k = [canonical, r.Evento, r.Detalle, r.Fecha].join('\x00');
        if (seen.has(k)) {
          evtDel.add(r._row);
        } else {
          seen.add(k);
          evtCount++;
          // Normalizar Actor al correo canónico si difiere
          if (evtColActor !== null && (r.Actor || '').toString() !== canonical) {
            pendingUpdates.push({ sheet: evtSheet, row: r._row, col: evtColActor, val: canonical });
          }
        }
      });
      stats.eventosRecuperados += evtCount;

      // ── Actualizar fila primaria de ESTUDIANTES ──────────────────────────────
      var regMin = dupRows.reduce(function(min, r) {
        return (!min || new Date(r.FechaRegistro || 0) < new Date(min || 0))
          ? (r.FechaRegistro || min) : min;
      }, null);
      var estado = dupRows.some(function(r) { return (r.Estado || '') === 'activo'; })
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
    _migPreValidate(dups, est, pendingUpdates, stats);
    if (stats.inconsistencias.length > 0) {
      throw new Error('Inconsistencias detectadas antes de escribir:\n' + stats.inconsistencias.join('\n'));
    }
    stats.validaciones.push('Pre-escritura: ' + stats.perfilesConsolidados +
      ' perfiles listos, sin inconsistencias críticas.');
    stats.filasActualizadas = pendingUpdates.length;

    // ──────────────────────────────────────────────────────────────────────────
    // Adquirir lock antes de cualquier escritura en el spreadsheet
    // ──────────────────────────────────────────────────────────────────────────
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(30000);
    } catch (lockErr) {
      throw new Error('No se pudo obtener el lock de script. Puede haber otra ejecución en curso. ' +
        'Intente nuevamente en 30 segundos.');
    }

    // Marcar migración como en progreso antes de la primera escritura
    props.setProperty(_MIG_LOCK_FLAG, 'true');

    try {

      // ═════════════════════════════════════════════════════════════════════════
      // PASO 5 — APLICAR ACTUALIZACIONES
      // ═════════════════════════════════════════════════════════════════════════
      pendingUpdates.forEach(function(u) { u.sheet.getRange(u.row, u.col).setValue(u.val); });
      SpreadsheetApp.flush();

      // ═════════════════════════════════════════════════════════════════════════
      // PASO 6 — ELIMINAR FILAS DUPLICADAS (de abajo hacia arriba)
      // ═════════════════════════════════════════════════════════════════════════
      _migDelRows(estSheet,  estDel);
      _migDelRows(progSheet, progDel);
      _migDelRows(insSheet,  insDel);
      _migDelRows(evtSheet,  evtDel);

      stats.eliminados.estudiantes = estDel.size;
      stats.eliminados.progreso    = progDel.size;
      stats.eliminados.insignias   = insDel.size;
      stats.eliminados.eventos     = evtDel.size;
      stats.estudiantesDespues     = stats.estudiantesAntes - estDel.size;

      // ═════════════════════════════════════════════════════════════════════════
      // PASO 7 — RECONSTRUIR RANKING Y ANALÍTICA (con protección por copia temporal)
      // ═════════════════════════════════════════════════════════════════════════
      _migSafeReconstruct(ss, stats);

    } finally {
      lock.releaseLock();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PASO 8 — VERIFICAR POST-MIGRACIÓN (re-lee hojas; valida conteos y huérfanos)
    // ═══════════════════════════════════════════════════════════════════════════
    _migFinalVerify(ss, stats);

    // Migración completada correctamente: limpiar flag de estado
    props.deleteProperty(_MIG_LOCK_FLAG);

  } catch (e) {
    stats.inconsistencias.push('ERROR FATAL: ' + e.message);
    Logger.log('DATA-01 ERROR: ' + e.message + '\n' + (e.stack || ''));
    // MIGRATION_RUNNING no se elimina en caso de error — intencional.
    // Fuerza revisión manual antes de reintentar.
    stats.duration = new Date().getTime() - startTime;
    _migReport(ss, stats);
    throw e;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PASO 9 — GENERAR INFORME
  // ═══════════════════════════════════════════════════════════════════════════
  stats.duration = new Date().getTime() - startTime;
  _migReport(ss, stats);
  Logger.log('DATA-01 completado en ' + stats.duration + 'ms. Integridad: ' +
    (stats.integridadConfirmada ? 'CONFIRMADA' : 'CON ADVERTENCIAS'));
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS INTERNOS (prefijo _mig para evitar colisiones con Code.gs)
// ─────────────────────────────────────────────────────────────────────────────

/** Crea respaldos de las 7 hojas. Omite si ya existen. Devuelve el número creado. */
function _migBackup(ss) {
  var targets = [
    [SHEETS.ESTUDIANTES, '01'], [SHEETS.PROGRESO,   '02'],
    [SHEETS.INSIGNIAS,   '03'], [SHEETS.RANKING,    '04'],
    [SHEETS.EVENTOS,     '05'], [SHEETS.ANALITICA,  '06'],
    [SHEETS.CALENDARIO,  '08'],
  ];
  var created = 0;
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
      created++;
    } catch (e) {
      throw new Error('No se pudo crear respaldo de "' + name + '": ' + e.message);
    }
  });
  return created;
}

function _migSheet(ss, name) {
  var s = ss.getSheetByName(name);
  if (!s) throw new Error('Hoja requerida no encontrada: ' + name);
  return s;
}

/** Carga una hoja en { rows, headers, hdrMap }. Cada fila incluye _row (1-based). */
function _migLoad(sheet) {
  var data = sheet.getDataRange().getValues();
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

/**
 * Valida invariantes antes de cualquier escritura.
 * Puebla stats.inconsistencias si detecta errores críticos.
 */
function _migPreValidate(dups, est, pendingUpdates, stats) {
  var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // 1. Correos canónicos no vacíos y con formato válido
  dups.forEach(function(entry) {
    var canonical = entry[0];
    if (!canonical) {
      stats.inconsistencias.push('Error: correo canónico vacío en grupo de duplicados.');
    } else if (!emailRe.test(canonical)) {
      stats.inconsistencias.push('Error: correo canónico con formato inválido: "' + canonical + '"');
    }
  });

  // 2. Cada grupo tiene una fila primaria con _row válido (≥2)
  dups.forEach(function(entry) {
    var canonical = entry[0];
    var dupRows   = entry[1];
    var sorted = dupRows.slice().sort(function(a, b) {
      return new Date(b.UltimoAcceso || 0) - new Date(a.UltimoAcceso || 0);
    });
    var primary = sorted[0];
    if (!primary || !primary._row || primary._row < 2) {
      stats.inconsistencias.push('Error: fila primaria inválida para correo "' + canonical + '".');
    }
  });

  // 3. Ninguna actualización pendiente referencia una columna inválida
  var badCols = pendingUpdates.filter(function(u) {
    return u.col === undefined || isNaN(u.col) || u.col < 1;
  });
  if (badCols.length > 0) {
    stats.inconsistencias.push('Error: ' + badCols.length + ' actualización(es) con índice de columna inválido. ' +
      'El encabezado de 01_ESTUDIANTES puede no coincidir con el esquema esperado.');
  }

  // 4. Las columnas críticas de ESTUDIANTES existen en el encabezado cargado
  var required = ['Correo', 'XP', 'Nivel', 'FechaRegistro', 'Estado'];
  required.forEach(function(h) {
    if (est.hdrMap[h] === undefined) {
      stats.inconsistencias.push('Error: columna requerida "' + h + '" no encontrada en 01_ESTUDIANTES.');
    }
  });
}

/**
 * Reconstruye RANKING y ANALITICA usando copias temporales como red de seguridad.
 * Si updateRanking() o recalcAnalitica() fallan, restaura desde la copia temporal.
 */
function _migSafeReconstruct(ss, stats) {
  var TEMP_R = 'TEMP_RANKING_MIG';
  var TEMP_A = 'TEMP_ANALITICA_MIG';

  // Eliminar copias temporales previas (restos de una ejecución fallida)
  [TEMP_R, TEMP_A].forEach(function(n) {
    var s = ss.getSheetByName(n);
    if (s) ss.deleteSheet(s);
  });

  // Crear copia temporal del estado actual antes de modificar
  _migSheet(ss, SHEETS.RANKING).copyTo(ss).setName(TEMP_R);
  _migSheet(ss, SHEETS.ANALITICA).copyTo(ss).setName(TEMP_A);

  try {
    updateRanking();
    recalcAnalitica();

    // Éxito: eliminar hojas temporales
    var tempR = ss.getSheetByName(TEMP_R);
    var tempA = ss.getSheetByName(TEMP_A);
    if (tempR) ss.deleteSheet(tempR);
    if (tempA) ss.deleteSheet(tempA);

  } catch (e) {
    // Fallo: restaurar RANKING y ANALITICA desde las copias temporales
    stats.warnings.push('Fallo al reconstruir RANKING/ANALITICA (' + e.message + '). ' +
      'Restaurando copia de seguridad temporal.');
    _migRestoreFromTemp(ss, SHEETS.RANKING,   TEMP_R);
    _migRestoreFromTemp(ss, SHEETS.ANALITICA, TEMP_A);
    throw e;
  }
}

function _migRestoreFromTemp(ss, sheetName, tempName) {
  var target = ss.getSheetByName(sheetName);
  var temp   = ss.getSheetByName(tempName);
  if (!temp) {
    Logger.log('Advertencia: hoja temporal no encontrada para restaurar: ' + tempName);
    return;
  }
  if (target) {
    target.clearContents();
    var d = temp.getDataRange().getValues();
    if (d.length) target.getRange(1, 1, d.length, d[0].length).setValues(d);
  }
  ss.deleteSheet(temp);
}

/**
 * Verificación final post-migración.
 * Re-lee todas las hojas afectadas, valida conteos, huérfanos y reconstrucción.
 */
function _migFinalVerify(ss, stats) {
  var nrm = function(e) { return (e || '').toString().trim().toLowerCase(); };

  var estPost  = _migLoad(_migSheet(ss, SHEETS.ESTUDIANTES));
  var progPost = _migLoad(_migSheet(ss, SHEETS.PROGRESO));
  var insPost  = _migLoad(_migSheet(ss, SHEETS.INSIGNIAS));
  var rankPost = _migLoad(_migSheet(ss, SHEETS.RANKING));
  var analPost = _migLoad(_migSheet(ss, SHEETS.ANALITICA));

  // XP total desde ESTUDIANTES consolidado
  stats.xpTotal = estPost.rows.reduce(function(sum, r) { return sum + (Number(r.XP) || 0); }, 0);

  // Verificar RANKING no vacío
  if (rankPost.rows.length > 0) {
    stats.rankingGenerado = true;
    stats.validaciones.push('✓ RANKING reconstruido (' + rankPost.rows.length + ' entradas).');
  } else {
    stats.inconsistencias.push('✗ RANKING está vacío tras la reconstrucción.');
  }

  // Verificar ANALITICA (puede ser vacía si no hay progreso registrado)
  if (analPost.rows.length > 0) {
    stats.analiticaGenerada = true;
    stats.validaciones.push('✓ ANALÍTICA reconstruida (' + analPost.rows.length + ' entradas).');
  } else {
    stats.warnings.push('ANALÍTICA vacía tras la reconstrucción ' +
      '(normal si no hay registros de progreso).');
  }

  // Verificar que RANKING no tiene entradas huérfanas
  var estEmails = new Set(estPost.rows.map(function(r) { return nrm(r.Correo); }));
  var orphRank  = rankPost.rows.filter(function(r) { return !estEmails.has(nrm(r.Correo)); }).length;
  if (orphRank > 0) {
    stats.inconsistencias.push('✗ ' + orphRank + ' entradas huérfanas en 04_RANKING.');
  } else if (rankPost.rows.length > 0) {
    stats.validaciones.push('✓ Sin entradas huérfanas en 04_RANKING.');
  }

  // Validaciones estándar (correos únicos, huérfanos en PROGRESO/INSIGNIAS, dedup)
  _migPostValidate(estPost, progPost, insPost, stats);
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

/** Escribe el informe técnico en una hoja del spreadsheet. */
function _migReport(ss, stats) {
  var sheetName = 'DATA01_REPORTE_' + _MIG_DATE;
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  else sheet.clearContents();

  var rows = [];
  var r = function() { rows.push(Array.prototype.slice.call(arguments)); };

  r('DATA-01 — Migración y Consolidación de Estudiantes (v2 Hardened)');
  r('Fecha de ejecución:', new Date().toISOString());
  r('Duración (ms):', stats.duration || 0);
  r('');
  r('RESUMEN GENERAL');
  r('Estudiantes antes de la migración:',  stats.estudiantesAntes);
  r('Estudiantes después de la migración:', stats.estudiantesDespues);
  r('Correos únicos analizados:',           stats.correoUnicos);
  r('Grupos duplicados encontrados:',       stats.duplicadosEncontrados);
  r('Perfiles consolidados:',               stats.perfilesConsolidados);
  r('Respaldos creados:',                   stats.backupsCreados);
  r('Filas actualizadas (pendingUpdates):', stats.filasActualizadas);
  r('');
  r('REGISTROS ELIMINADOS');
  r('01_ESTUDIANTES:',  stats.eliminados.estudiantes);
  r('02_PROGRESO:',     stats.eliminados.progreso);
  r('03_INSIGNIAS:',    stats.eliminados.insignias);
  r('05_EVENTOS:',      stats.eliminados.eventos);
  r('');
  r('INFORMACIÓN ACADÉMICA RECUPERADA');
  r('Desafíos (semanas únicas):',  stats.desafiosRecuperados);
  r('Microretos (mejor intento):', stats.microretosRecuperados);
  r('Insignias únicas:',           stats.insigniasRecuperadas);
  r('Eventos (sin duplicados):',   stats.eventosRecuperados);
  r('');
  r('TOTALES POST-MIGRACIÓN');
  r('XP total acumulado (todos los estudiantes):', stats.xpTotal);
  r('RANKING generado:', stats.rankingGenerado  ? 'Sí' : 'No');
  r('ANALÍTICA generada:', stats.analiticaGenerada ? 'Sí' : 'No');
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

  if (stats.warnings.length) {
    r('ADVERTENCIAS');
    stats.warnings.forEach(function(w) { r(w); });
    r('');
  }

  r('INCONSISTENCIAS DETECTADAS');
  (stats.inconsistencias.length ? stats.inconsistencias : ['Ninguna']).forEach(function(i) { r(i); });
  r('');
  r('INTEGRIDAD DE DATOS:', stats.integridadConfirmada
    ? '✓ CONFIRMADA'
    : '⚠ CON ADVERTENCIAS — revisar inconsistencias');

  var maxCols = Math.max.apply(null, rows.map(function(l) { return l.length; }).concat([1]));
  var padded  = rows.map(function(l) {
    while (l.length < maxCols) l.push('');
    return l;
  });
  sheet.getRange(1, 1, padded.length, maxCols).setValues(padded);
  Logger.log('DATA-01: Informe escrito en hoja "' + sheetName + '".');
}
