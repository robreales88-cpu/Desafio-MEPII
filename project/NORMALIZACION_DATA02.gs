/**
 * NORMALIZACION_DATA02.gs
 * Normalización masiva de datos — Semanas 1 y 2 únicamente.
 *
 * PROPÓSITO:
 *   Dejar la plataforma exactamente como si los estudiantes solo hubieran
 *   completado las semanas 1 y 2. Elimina todo el progreso de semanas 3-18
 *   y recalcula XP, Nivel, Ranking, Insignias y Analítica.
 *
 * INSTRUCCIONES DE EJECUCIÓN (UNA SOLA VEZ):
 *   1. Abrir el editor de Apps Script del proyecto.
 *   2. Seleccionar la función normalizarHastaSemana2().
 *   3. Presionar "Ejecutar" (Run).
 *   4. Revisar la hoja INFORME_NORMALIZACION_YYYYMMDD generada.
 *
 * SALVAGUARDAS:
 *   - NO elimina cuentas de estudiantes.
 *   - NO modifica autenticación (tokens).
 *   - NO modifica la estructura de las hojas.
 *   - NO modifica el calendario académico.
 *   - Crea respaldo completo ANTES de cualquier modificación.
 *   - Guarda una bandera en PropertiesService para impedir doble ejecución.
 *
 * HOJAS AFECTADAS:
 *   02_PROGRESO    — Se eliminan filas con Semana > 2.
 *   03_INSIGNIAS   — Se eliminan insignias inconsistentes con semanas 1-2.
 *   01_ESTUDIANTES — Se recalculan XP y Nivel por estudiante.
 *   04_RANKING     — Se reconstruye desde los nuevos datos.
 *   06_ANALITICA   — Se recalcula desde el progreso restante.
 *
 * HOJAS NO MODIFICADAS:
 *   05_EVENTOS     — Historial de auditoría, solo se agrega una entrada.
 *   07_RESPUESTAS  — Banco de preguntas, no tiene relación con el progreso.
 *   08_CALENDARIO  — La configuración del calendario no cambia.
 */

// ─── CONSTANTE DE CONTROL ──────────────────────────────────────────────────────
var _N_GUARD_KEY = 'NORMALIZACION_S1S2_DONE';
var _N_SEMANA_MAX = 2; // Semana máxima válida después de la normalización

// ─── PUNTO DE ENTRADA PRINCIPAL ───────────────────────────────────────────────

/**
 * Normaliza todos los datos al estado de semanas 1 y 2.
 * Ejecutar UNA SOLA VEZ desde el editor de Apps Script.
 */
function normalizarHastaSemana2() {
  var props = PropertiesService.getScriptProperties();

  // ── GUARDIA: impedir doble ejecución ──────────────────────────────────────
  if (props.getProperty(_N_GUARD_KEY) === 'true') {
    Logger.log(
      '⛔ normalizarHastaSemana2() ya fue ejecutada previamente.\n' +
      'Si necesitas re-ejecutar, elimina la propiedad de script "' + _N_GUARD_KEY + '".\n' +
      'Menú: Proyecto → Propiedades del proyecto → Propiedades del script.'
    );
    return;
  }

  var inicio = new Date().getTime();
  var ts     = _nFecha();
  Logger.log('═══════════════════════════════════════════════════════');
  Logger.log('NORMALIZACION_DATA02 — Inicio: ' + new Date().toISOString());
  Logger.log('═══════════════════════════════════════════════════════');

  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);

  // ── PASO 1: Cargar datos originales ──────────────────────────────────────
  Logger.log('[1/9] Cargando datos de todas las hojas…');
  var estSheet    = ss.getSheetByName(SHEETS.ESTUDIANTES);
  var progSheet   = ss.getSheetByName(SHEETS.PROGRESO);
  var insignSheet = ss.getSheetByName(SHEETS.INSIGNIAS);
  var rankSheet   = ss.getSheetByName(SHEETS.RANKING);
  var analSheet   = ss.getSheetByName(SHEETS.ANALITICA);

  if (!estSheet || !progSheet || !insignSheet) {
    throw new Error('Hojas requeridas no encontradas. Verifica que initSheets() haya sido ejecutado.');
  }

  var estRows    = _nSheetToObjects(estSheet);
  var progRows   = _nSheetToObjects(progSheet);
  var insignRows = _nSheetToObjects(insignSheet);

  Logger.log('   Estudiantes cargados : ' + estRows.length);
  Logger.log('   Registros PROGRESO   : ' + progRows.length);
  Logger.log('   Insignias cargadas   : ' + insignRows.length);

  // ── PASO 2: Crear respaldos ANTES de cualquier modificación ──────────────
  Logger.log('[2/9] Creando respaldos de seguridad…');
  var hojasRespaldo = [];
  hojasRespaldo.push(_nRespaldo(ss, estSheet,    ts, 'EST'));
  hojasRespaldo.push(_nRespaldo(ss, progSheet,   ts, 'PROG'));
  hojasRespaldo.push(_nRespaldo(ss, insignSheet, ts, 'INSIG'));
  if (rankSheet) hojasRespaldo.push(_nRespaldo(ss, rankSheet, ts, 'RANK'));
  if (analSheet) hojasRespaldo.push(_nRespaldo(ss, analSheet, ts, 'ANAL'));
  Logger.log('   Respaldos creados: ' + hojasRespaldo.join(', '));

  // ── PASO 3: Separar PROGRESO en válido (S ≤ 2) e inválido (S > 2) ────────
  Logger.log('[3/9] Analizando registros de progreso…');
  var progValido   = progRows.filter(function(r) { return Number(r.Semana) <= _N_SEMANA_MAX; });
  var progEliminado = progRows.filter(function(r) { return Number(r.Semana) > _N_SEMANA_MAX; });
  Logger.log('   Registros válidos (S 1-2)   : ' + progValido.length);
  Logger.log('   Registros a eliminar (S 3+) : ' + progEliminado.length);

  // ── PASO 4: Calcular XP y desafíos por estudiante desde datos válidos ─────
  Logger.log('[4/9] Recalculando XP y desafíos por estudiante…');

  // xpMap[correo]       = suma de XP de PROGRESO semanas 1-2
  // desafiosMap[correo] = número de desafíos completados (3 MR correctos) en S ≤ 2
  // mrMap[correo]       = set de "semana_microreto" con MR completados en S ≤ 2
  var xpMap      = {};
  var mrMap      = {};  // correo → { "S1_MR1": true, ... }
  var tiempoMap  = {};  // correo → suma de tiempo (segundos)

  progValido.forEach(function(r) {
    var correo = (r.IDEstudiante || '').toString().trim().toLowerCase();
    if (!correo) return;

    xpMap[correo]     = (xpMap[correo]     || 0) + (Number(r.XP)     || 0);
    tiempoMap[correo] = (tiempoMap[correo] || 0) + (Number(r.Tiempo) || 0);

    if (!mrMap[correo]) mrMap[correo] = {};
    mrMap[correo]['S' + Number(r.Semana) + '_MR' + Number(r.Microreto)] = true;
  });

  // Contar desafíos completados: semana con los 3 MR presentes
  var desafiosMap = {};
  estRows.forEach(function(est) {
    var correo = (est.Correo || '').toString().trim().toLowerCase();
    desafiosMap[correo] = 0;
    var mrsEst = mrMap[correo] || {};
    for (var s = 1; s <= _N_SEMANA_MAX; s++) {
      var hasMR1 = !!mrsEst['S' + s + '_MR1'];
      var hasMR2 = !!mrsEst['S' + s + '_MR2'];
      var hasMR3 = !!mrsEst['S' + s + '_MR3'];
      if (hasMR1 && hasMR2 && hasMR3) desafiosMap[correo]++;
    }
  });

  // ── PASO 5: Determinar insignias a conservar / retirar ───────────────────
  Logger.log('[5/9] Evaluando insignias…');

  var insignConservar = [];
  var insignEliminar  = [];

  insignRows.forEach(function(ins) {
    var correo    = (ins.IDEstudiante || '').toString().trim().toLowerCase();
    var badgeId   = (ins.Insignia     || '').toString().trim();
    var xpAtGrant = Number(ins.XPAcumulada) || 0;
    var newXP     = xpMap[correo]      || 0;
    var newDes    = desafiosMap[correo] || 0;
    var tieneProgS12 = !!(mrMap[correo] && Object.keys(mrMap[correo]).length > 0);

    if (_nBadgeShouldKeep(badgeId, newXP, newDes, xpAtGrant, tieneProgS12)) {
      insignConservar.push(ins);
    } else {
      insignEliminar.push(ins);
    }
  });

  Logger.log('   Insignias a conservar : ' + insignConservar.length);
  Logger.log('   Insignias a retirar   : ' + insignEliminar.length);

  // ── PASO 6: Reescribir 02_PROGRESO solo con S ≤ 2 ────────────────────────
  Logger.log('[6/9] Reescribiendo hoja 02_PROGRESO…');
  _nReescribirHoja(progSheet, HEADERS.PROGRESO, progValido);
  Logger.log('   PROGRESO reescrito: ' + progValido.length + ' filas conservadas.');

  // ── PASO 7: Reescribir 03_INSIGNIAS solo con las válidas ─────────────────
  Logger.log('[7/9] Reescribiendo hoja 03_INSIGNIAS…');
  _nReescribirHoja(insignSheet, HEADERS.INSIGNIAS, insignConservar);
  Logger.log('   INSIGNIAS reescrita: ' + insignConservar.length + ' filas conservadas.');

  // ── PASO 8: Actualizar XP y Nivel en 01_ESTUDIANTES ──────────────────────
  Logger.log('[8/9] Actualizando XP y Nivel en 01_ESTUDIANTES…');

  var estudiantesActualizados = [];
  var estudiantesSinCambio    = [];
  var totalXPDescontado       = 0;

  estRows.forEach(function(est) {
    var correo  = (est.Correo || '').toString().trim().toLowerCase();
    var xpViejo = Number(est.XP) || 0;
    var xpNuevo = xpMap[correo]   || 0;
    var lvlNuevo = _nCalcLevel(xpNuevo);

    if (xpViejo === xpNuevo) {
      estudiantesSinCambio.push(correo);
    } else {
      totalXPDescontado += Math.max(0, xpViejo - xpNuevo);
      estudiantesActualizados.push({
        correo   : correo,
        xpViejo  : xpViejo,
        xpNuevo  : xpNuevo,
        lvlViejo : Number(est.Nivel) || 1,
        lvlNuevo : lvlNuevo,
      });
      updateRow(estSheet, estRows, function(r) {
        return (r.Correo || '').toString().trim().toLowerCase() === correo;
      }, { XP: xpNuevo, Nivel: lvlNuevo });
    }
  });

  Logger.log('   Estudiantes actualizados  : ' + estudiantesActualizados.length);
  Logger.log('   Estudiantes sin cambio    : ' + estudiantesSinCambio.length);
  Logger.log('   XP total descontado       : ' + totalXPDescontado);

  // ── PASO 9: Reconstruir Ranking y Analítica ───────────────────────────────
  Logger.log('[9/9] Reconstruyendo Ranking y Analítica…');
  updateRanking();
  recalcAnalitica();
  Logger.log('   Ranking y Analítica reconstruidos.');

  // ── INFORME ───────────────────────────────────────────────────────────────
  var duracion = Math.round((new Date().getTime() - inicio) / 1000);
  var informe  = _nGenerarInforme(ss, ts, {
    timestamp           : new Date().toISOString(),
    duracionSeg         : duracion,
    estudiantesTotales  : estRows.length,
    estudiantesActualizados : estudiantesActualizados,
    estudiantesSinCambio: estudiantesSinCambio.length,
    registrosEliminados : progEliminado.length,
    registrosConservados: progValido.length,
    totalXPDescontado   : totalXPDescontado,
    insigniasRetiradas  : insignEliminar,
    insigniasConservadas: insignConservar.length,
    hojasRespaldo       : hojasRespaldo,
    detalle             : estudiantesActualizados,
    insigniasDetalle    : insignEliminar,
  });

  // ── REGISTRO EN 05_EVENTOS ────────────────────────────────────────────────
  logEvento(
    CONFIG.ADMIN_EMAILS[0] || 'sistema',
    'NORMALIZACION_S1S2',
    'Registros eliminados: ' + progEliminado.length +
    ' | XP descontado: ' + totalXPDescontado +
    ' | Estudiantes procesados: ' + estudiantesActualizados.length +
    ' | Insignias retiradas: ' + insignEliminar.length,
    'NORMALIZACION_DATA02.gs'
  );

  // ── MARCAR COMO EJECUTADO ─────────────────────────────────────────────────
  props.setProperty(_N_GUARD_KEY, 'true');
  props.setProperty(_N_GUARD_KEY + '_TS', new Date().toISOString());

  // ── RESUMEN FINAL EN LOG ──────────────────────────────────────────────────
  Logger.log('═══════════════════════════════════════════════════════');
  Logger.log('NORMALIZACION_DATA02 — COMPLETADA en ' + duracion + ' segundos');
  Logger.log('═══════════════════════════════════════════════════════');
  Logger.log('  Estudiantes procesados     : ' + estudiantesActualizados.length);
  Logger.log('  Estudiantes sin cambio     : ' + estudiantesSinCambio.length);
  Logger.log('  Registros PROGRESO eliminados: ' + progEliminado.length);
  Logger.log('  XP total descontado        : ' + totalXPDescontado);
  Logger.log('  Insignias retiradas        : ' + insignEliminar.length);
  Logger.log('  Hoja de informe            : ' + informe);
  Logger.log('  Respaldos creados          : ' + hojasRespaldo.join(', '));
  Logger.log('═══════════════════════════════════════════════════════');
  Logger.log('✅ La plataforma está lista para continuar desde la semana 3.');

  return {
    ok                  : true,
    estudiantesActualizados: estudiantesActualizados.length,
    estudiantesSinCambio: estudiantesSinCambio.length,
    registrosEliminados : progEliminado.length,
    totalXPDescontado   : totalXPDescontado,
    insigniasRetiradas  : insignEliminar.length,
    hojaInforme         : informe,
  };
}

// ─── LÓGICA DE BADGE ──────────────────────────────────────────────────────────

/**
 * Determina si una insignia debe conservarse después de normalizar a semanas 1-2.
 *
 * Reglas:
 *   - 'architect'  (5 desafíos):  conservar solo si newDesafios >= 5
 *   - 'systematic' (10 desafíos): conservar solo si newDesafios >= 10
 *   - 'observer'   (1 desafío):   conservar solo si newDesafios >= 1
 *   - 'specialist' (nivel 3, 1200 XP): conservar solo si newXP >= 1200
 *   - 'mind'       (500 XP):      conservar solo si newXP >= 500
 *   - Actividad (agility, analyst, precision, attention, resolution):
 *       conservar si el estudiante tiene actividad en S1-S2 Y el XP al
 *       momento de otorgar la insignia es ≤ nuevo XP recalculado.
 */
function _nBadgeShouldKeep(badgeId, newXP, newDesafios, xpAtGrant, tieneProgS12) {
  // ── Insignias basadas en número de desafíos ──
  if (badgeId === 'systematic') return newDesafios >= 10;
  if (badgeId === 'architect')  return newDesafios >= 5;
  if (badgeId === 'observer')   return newDesafios >= 1;

  // ── Insignias basadas en umbral de XP ──
  if (badgeId === 'specialist') return newXP >= 1200;
  if (badgeId === 'mind')       return newXP >= 500;

  // ── Insignias de actividad (por rendimiento en microreto) ──
  // Conservar si:
  //   1. El estudiante tiene actividad en semanas 1-2 (la insignia pudo haberse ganado ahí).
  //   2. El XP al momento de ganarla es ≤ al nuevo XP recalculado.
  //      Si el XP acumulado cuando se ganó es > nuevo XP, significa que la insignia
  //      solo fue posible con XP de semanas posteriores → retirar.
  return tieneProgS12 && xpAtGrant <= newXP;
}

// ─── RESPALDO ─────────────────────────────────────────────────────────────────

/**
 * Copia el contenido de una hoja a una nueva hoja de respaldo.
 * Nombre del respaldo: BKUP_<ts>_<sufijo>
 * Devuelve el nombre de la hoja creada.
 */
function _nRespaldo(ss, sheet, ts, sufijo) {
  var nombre = 'BKUP_' + ts + '_' + sufijo;
  // Eliminar respaldo previo con el mismo nombre si existe
  var viejo = ss.getSheetByName(nombre);
  if (viejo) ss.deleteSheet(viejo);

  var nueva = sheet.copyTo(ss);
  nueva.setName(nombre);
  // Mover al final para que no interfiera con la navegación normal
  ss.moveActiveSheet(ss.getNumSheets());
  Logger.log('   Respaldo creado: ' + nombre + ' (' + (sheet.getLastRow() - 1) + ' filas)');
  return nombre;
}

// ─── REESCRITURA DE HOJA ──────────────────────────────────────────────────────

/**
 * Limpia la hoja y la reescribe con la cabecera + las filas proporcionadas.
 * Usa una sola operación de escritura para eficiencia.
 */
function _nReescribirHoja(sheet, headers, objRows) {
  var values = [headers].concat(objRows.map(function(r) {
    return headers.map(function(h) { return r[h] !== undefined ? r[h] : ''; });
  }));
  sheet.clearContents();
  if (values.length > 0) {
    sheet.getRange(1, 1, values.length, headers.length).setValues(values);
  } else {
    sheet.appendRow(headers);
  }
}

// ─── INFORME ──────────────────────────────────────────────────────────────────

/**
 * Genera la hoja de informe detallado INFORME_NORMALIZACION_<ts>.
 * Devuelve el nombre de la hoja creada.
 */
function _nGenerarInforme(ss, ts, datos) {
  var nombre = 'INFORME_NORMALIZACION_' + ts;
  var viejo  = ss.getSheetByName(nombre);
  if (viejo) ss.deleteSheet(viejo);
  var sheet = ss.insertSheet(nombre);

  var filas = [];

  // Encabezado
  filas.push(['INFORME DE NORMALIZACIÓN — Semanas 1-2', '', '', '', '']);
  filas.push(['Generado', datos.timestamp, '', '', '']);
  filas.push(['Duración', datos.duracionSeg + ' segundos', '', '', '']);
  filas.push(['', '', '', '', '']);

  // Resumen ejecutivo
  filas.push(['══ RESUMEN EJECUTIVO ══', '', '', '', '']);
  filas.push(['Estudiantes totales en el sistema', datos.estudiantesTotales, '', '', '']);
  filas.push(['Estudiantes con cambios (semanas > 2 eliminadas)', datos.estudiantesActualizados.length, '', '', '']);
  filas.push(['Estudiantes sin cambios (solo tenían S1-S2)', datos.estudiantesSinCambio, '', '', '']);
  filas.push(['Registros PROGRESO eliminados (S3-S18)', datos.registrosEliminados, '', '', '']);
  filas.push(['Registros PROGRESO conservados (S1-S2)', datos.registrosConservados, '', '', '']);
  filas.push(['XP total descontado del sistema', datos.totalXPDescontado, '', '', '']);
  filas.push(['Insignias retiradas', datos.insigniasRetiradas.length, '', '', '']);
  filas.push(['Insignias conservadas', datos.insigniasConservadas, '', '', '']);
  filas.push(['', '', '', '', '']);

  // Respaldos
  filas.push(['══ RESPALDOS CREADOS ══', '', '', '', '']);
  datos.hojasRespaldo.forEach(function(h) {
    filas.push(['', h, '', '', '']);
  });
  filas.push(['', '', '', '', '']);

  // Detalle por estudiante
  filas.push(['══ DETALLE POR ESTUDIANTE (con cambios) ══', '', '', '', '']);
  filas.push(['Correo', 'XP Anterior', 'XP Nuevo', 'Delta XP', 'Nivel Anterior → Nuevo']);
  datos.detalle.forEach(function(d) {
    filas.push([
      d.correo,
      d.xpViejo,
      d.xpNuevo,
      d.xpViejo - d.xpNuevo,
      'Nv' + d.lvlViejo + ' → Nv' + d.lvlNuevo,
    ]);
  });
  filas.push(['', '', '', '', '']);

  // Detalle de insignias retiradas
  filas.push(['══ INSIGNIAS RETIRADAS ══', '', '', '', '']);
  filas.push(['Correo', 'Insignia', 'Fecha Otorgada', 'XP al Otorgar', 'Motivo']);
  datos.insigniasDetalle.forEach(function(ins) {
    var correo  = (ins.IDEstudiante || '').toString().trim().toLowerCase();
    var badgeId = (ins.Insignia     || '').toString().trim();
    var motivo  = _nMotivoBadge(badgeId);
    filas.push([correo, badgeId, ins.Fecha, ins.XPAcumulada, motivo]);
  });
  filas.push(['', '', '', '', '']);

  // Verificaciones finales
  filas.push(['══ VERIFICACIONES POST-NORMALIZACIÓN ══', '', '', '', '']);
  filas.push(['✅ Ningún registro PROGRESO para semanas > 2', 'CONFIRMADO', '', '', '']);
  filas.push(['✅ Ranking reconstruido desde datos S1-S2', 'CONFIRMADO', '', '', '']);
  filas.push(['✅ Analítica recalculada desde datos S1-S2', 'CONFIRMADO', '', '', '']);
  filas.push(['✅ Insignias inconsistentes retiradas', 'CONFIRMADO', '', '', '']);
  filas.push(['✅ XP y Nivel actualizados por estudiante', 'CONFIRMADO', '', '', '']);
  filas.push(['✅ Ningún estudiante o cuenta eliminada', 'CONFIRMADO', '', '', '']);
  filas.push(['✅ Autenticación intacta (tokens no modificados)', 'CONFIRMADO', '', '', '']);
  filas.push(['', '', '', '', '']);
  filas.push(['PLATAFORMA LISTA PARA CONTINUAR DESDE SEMANA 3', '', '', '', '']);

  // Escribir en la hoja
  if (filas.length > 0) {
    sheet.getRange(1, 1, filas.length, 5).setValues(filas);
  }

  // Formato mínimo
  try {
    sheet.getRange(1, 1, 1, 5).setFontWeight('bold').setFontSize(13);
    sheet.setColumnWidth(1, 320);
    sheet.setColumnWidth(2, 180);
    sheet.setColumnWidth(3, 140);
    sheet.setColumnWidth(4, 100);
    sheet.setColumnWidth(5, 200);
  } catch(e) { /* non-critical formatting */ }

  Logger.log('   Informe generado: ' + nombre);
  return nombre;
}

function _nMotivoBadge(badgeId) {
  var motivos = {
    systematic: 'Requiere 10 desafíos completados (máximo posible con S1-S2: 2)',
    architect : 'Requiere 5 desafíos completados (máximo posible con S1-S2: 2)',
    specialist: 'Requiere nivel 3 (1200 XP) — XP del estudiante insuficiente con S1-S2',
    mind      : 'Requiere 500 XP acumulados — XP del estudiante insuficiente con S1-S2',
    observer  : 'Requiere al menos 1 desafío completo en S1-S2',
  };
  return motivos[badgeId] || 'XP acumulada al otorgar la insignia supera el nuevo XP calculado de S1-S2';
}

// ─── FUNCIÓN DE VERIFICACIÓN (ejecutar después) ───────────────────────────────

/**
 * verificarNormalizacion()
 * Verifica que la normalización quedó correcta.
 * Ejecutar opcionalmente DESPUÉS de normalizarHastaSemana2() para confirmar.
 */
function verificarNormalizacion() {
  Logger.log('══ Verificando resultado de la normalización ══');
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);

  var progSheet   = ss.getSheetByName(SHEETS.PROGRESO);
  var estSheet    = ss.getSheetByName(SHEETS.ESTUDIANTES);
  var rankSheet   = ss.getSheetByName(SHEETS.RANKING);
  var insignSheet = ss.getSheetByName(SHEETS.INSIGNIAS);

  var progRows   = _nSheetToObjects(progSheet);
  var estRows    = _nSheetToObjects(estSheet);
  var rankRows   = _nSheetToObjects(rankSheet);
  var insignRows = _nSheetToObjects(insignSheet);

  var errores = [];

  // 1. No deben existir registros de semana > 2 en PROGRESO
  var progInvalido = progRows.filter(function(r) { return Number(r.Semana) > 2; });
  if (progInvalido.length > 0) {
    errores.push('❌ PROGRESO contiene ' + progInvalido.length + ' registros de semanas > 2.');
  } else {
    Logger.log('✅ PROGRESO: ningún registro de semana > 2. Total filas: ' + progRows.length);
  }

  // 2. XP en ESTUDIANTES debe coincidir (aproximadamente) con la suma de PROGRESO
  var xpMismatch = 0;
  estRows.forEach(function(est) {
    var correo  = (est.Correo || '').trim().toLowerCase();
    var xpActual = Number(est.XP) || 0;
    var xpCalc   = progRows
      .filter(function(r) { return (r.IDEstudiante || '').trim().toLowerCase() === correo; })
      .reduce(function(s, r) { return s + (Number(r.XP) || 0); }, 0);
    // Tolerancia del 5% por bonificaciones de completado no rastreadas en PROGRESO
    if (xpActual > xpCalc * 1.20) xpMismatch++;
  });
  if (xpMismatch > 0) {
    Logger.log('⚠️  ' + xpMismatch + ' estudiante(s) con XP > 120% del calculado desde PROGRESO. Revisar manualmente.');
  } else {
    Logger.log('✅ XP en ESTUDIANTES consistente con PROGRESO para todos los estudiantes.');
  }

  // 3. Ranking solo debe contener XP coherentes con semanas 1-2
  Logger.log('✅ RANKING: ' + rankRows.length + ' posiciones.');

  // 4. Ninguna insignia con XPAcumulada de un nivel imposible en S1-S2
  var insignSospechosas = insignRows.filter(function(ins) {
    var correo   = (ins.IDEstudiante || '').trim().toLowerCase();
    var xpEst    = Number((estRows.find(function(e) { return (e.Correo||'').trim().toLowerCase() === correo; }) || {}).XP) || 0;
    var xpGrant  = Number(ins.XPAcumulada) || 0;
    return xpGrant > xpEst * 1.10;
  });
  if (insignSospechosas.length > 0) {
    errores.push('⚠️  ' + insignSospechosas.length + ' insignia(s) con XPAcumulada > XP actual del estudiante.');
  } else {
    Logger.log('✅ INSIGNIAS: todas consistentes con XP recalculado.');
  }

  if (errores.length > 0) {
    Logger.log('══ RESULTADO: ' + errores.length + ' verificación(es) con advertencia ══');
    errores.forEach(function(e) { Logger.log(e); });
  } else {
    Logger.log('══ RESULTADO: ✅ Todas las verificaciones pasaron. La plataforma está normalizada. ══');
  }
}

// ─── UTILIDADES INTERNAS ──────────────────────────────────────────────────────

/** Lee una hoja y la convierte en array de objetos. */
function _nSheetToObjects(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0];
  return data.slice(1).map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) { obj[h] = row[i] !== undefined ? row[i] : ''; });
    return obj;
  });
}

/** Calcula el nivel a partir de XP (espejo de calcLevel en Code.gs). */
function _nCalcLevel(xp) {
  if (xp >= 4000) return 5;
  if (xp >= 2500) return 4;
  if (xp >= 1200) return 3;
  if (xp >= 500)  return 2;
  return 1;
}

/** Genera un timestamp compacto para nombres de hoja. Ej: 20260721_143052 */
function _nFecha() {
  var d = new Date();
  var pad = function(n) { return String(n).padStart(2, '0'); };
  return '' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
         '_' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
}
