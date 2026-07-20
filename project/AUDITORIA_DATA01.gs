/**
 * AUDITORIA_DATA01.gs
 * Auditoría de integridad de datos previa a migración DATA-01.
 *
 * Verificaciones:
 *   1. Registros de progreso con Fecha fuera del rango del calendario para esa semana
 *   2. Registros de progreso para semanas sin entrada en 08_CALENDARIO
 *   3. Conteo de microretos y desafíos completados por estudiante vs. límites del calendario
 *   4. Consistencia de XP: 01_ESTUDIANTES vs. recálculo desde 02_PROGRESO
 *   5. Posible doble acreditación de XP (mismo microreto, intervalo corto entre llamadas)
 *
 * Resultado: hoja AUDITORIA_2026-07-20 con el reporte completo.
 *
 * Ejecución: seleccionar auditarIntegridad() en el editor de Apps Script y presionar Run.
 */

var _AUD_DATE = '2026-07-20';
var _AUD_SHEET = 'AUDITORIA_' + _AUD_DATE;

// Límites académicos provistos por la docente:
// Antes de la semana actual: max 6 microretos completados, max 4 desafíos completados.
// Incluyendo la semana actual: max 9 microretos, max 6 desafíos.
var _MAX_MR_PREV  = 6;
var _MAX_CH_PREV  = 4;
var _MAX_MR_NOW   = 9;
var _MAX_CH_NOW   = 6;
// Semana académica actual (la semana que se habilitó hoy). Ajustar si cambia.
var _CURRENT_WEEK = 3;

function auditarIntegridad() {
  var ss    = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var inicio = new Date().getTime();

  // ── Cargar datos ──────────────────────────────────────────────────

  var estSheet  = ss.getSheetByName('01_ESTUDIANTES');
  var progSheet = ss.getSheetByName('02_PROGRESO');
  var calSheet  = ss.getSheetByName('08_CALENDARIO');

  if (!estSheet || !progSheet || !calSheet) {
    throw new Error('No se encontraron las hojas requeridas: 01_ESTUDIANTES, 02_PROGRESO, 08_CALENDARIO');
  }

  var est  = _audSheetToObjects(estSheet);
  var prog = _audSheetToObjects(progSheet);
  var cal  = _audSheetToObjects(calSheet);

  // ── Construir mapa de calendario ──────────────────────────────────

  // calMap[semana] = { inicio_ms, fin_ms, estado, fechaInicio, fechaFin }
  var calMap = {};
  cal.forEach(function(r) {
    var semana = Number(r.Semana);
    if (!semana) return;
    calMap[semana] = {
      semana      : semana,
      fechaInicio : (r.FechaInicio || '').toString().trim(),
      fechaFin    : (r.FechaFin    || '').toString().trim(),
      estado      : (r.Estado      || 'pendiente').toString().trim(),
      inicio_ms   : _audParseSVDate(r.FechaInicio, false),
      fin_ms      : _audParseSVDate(r.FechaFin, true),
    };
  });

  // ── Construir mapa de estudiantes ─────────────────────────────────

  var estMap = {};
  est.forEach(function(r) {
    var correo = (r.Correo || '').toString().trim().toLowerCase();
    if (!correo) return;
    estMap[correo] = { nombre: r.Nombre, xpActual: Number(r.XP) || 0 };
  });

  // ── Agrupar progreso por estudiante ───────────────────────────────

  // progresoMap[correo][semana][microreto] = [ {xp, intentos, fecha_ms}, ... ]
  var progresoMap = {};
  prog.forEach(function(r) {
    var correo    = (r.IDEstudiante || '').toString().trim().toLowerCase();
    var semana    = Number(r.Semana);
    var microreto = Number(r.Microreto);
    var xp        = Number(r.XP) || 0;
    var intentos  = Number(r.Intentos) || 1;
    var fechaStr  = (r.Fecha || '').toString().trim();
    var fecha_ms  = fechaStr ? new Date(fechaStr).getTime() : 0;

    if (!correo || !semana || isNaN(microreto)) return;
    if (!progresoMap[correo]) progresoMap[correo] = {};
    if (!progresoMap[correo][semana]) progresoMap[correo][semana] = {};
    if (!progresoMap[correo][semana][microreto]) progresoMap[correo][semana][microreto] = [];
    progresoMap[correo][semana][microreto].push({ xp: xp, intentos: intentos, fecha_ms: fecha_ms, fechaStr: fechaStr });
  });

  // ── Ejecutar verificaciones ───────────────────────────────────────

  var alertas    = [];  // hallazgos que requieren atención
  var advertencias = []; // hallazgos informativos
  var resumen    = {};  // estadísticas generales

  var totalEstudiantes  = 0;
  var totalConAlertas   = 0;
  var totalRegistros    = prog.length;
  var totalFueraVentana = 0;
  var totalSinCalendario = 0;

  Object.keys(progresoMap).forEach(function(correo) {
    totalEstudiantes++;
    var estudianteAlertas = 0;
    var semanas = progresoMap[correo];

    // ── Verificación 1 & 2: registros fuera de ventana / sin calendario ──

    Object.keys(semanas).forEach(function(semanaKey) {
      var semana = Number(semanaKey);
      var calEntry = calMap[semana];
      var mrsEnSemana = semanas[semanaKey];

      if (!calEntry) {
        // Verificación 2: semana sin entrada en calendario
        Object.keys(mrsEnSemana).forEach(function(mrKey) {
          mrsEnSemana[mrKey].forEach(function(rec) {
            totalSinCalendario++;
            estudianteAlertas++;
            alertas.push({
              tipo       : 'SEMANA_SIN_CALENDARIO',
              correo     : correo,
              semana     : semana,
              microreto  : mrKey,
              fechaReg   : rec.fechaStr,
              xp         : rec.xp,
              detalle    : 'La semana ' + semana + ' no tiene entrada en 08_CALENDARIO',
            });
          });
        });
        return;
      }

      // Verificación 1: fecha de registro fuera del rango del calendario
      var inicio_ms = calEntry.inicio_ms;
      var fin_ms    = calEntry.fin_ms;

      Object.keys(mrsEnSemana).forEach(function(mrKey) {
        mrsEnSemana[mrKey].forEach(function(rec) {
          if (!rec.fecha_ms || !inicio_ms || !fin_ms) return; // sin fechas para comparar

          var fueraDeInicio = rec.fecha_ms < inicio_ms;
          var fuera_deFin   = rec.fecha_ms > fin_ms;

          if (fueraDeInicio || fuera_deFin) {
            totalFueraVentana++;
            estudianteAlertas++;
            alertas.push({
              tipo      : 'FUERA_DE_VENTANA',
              correo    : correo,
              semana    : semana,
              microreto : mrKey,
              fechaReg  : rec.fechaStr,
              xp        : rec.xp,
              detalle   : fueraDeInicio
                ? 'Registro anterior a FechaInicio (' + calEntry.fechaInicio + ') de la semana ' + semana
                : 'Registro posterior a FechaFin (' + calEntry.fechaFin + ') de la semana ' + semana,
            });
          }
        });
      });
    });

    // ── Verificación 3: conteos máximos por estudiante ──

    // Contar microretos únicos completados y desafíos completados
    // Un microreto se cuenta como "completado" si tiene al menos 1 registro.
    var mrCompletados = 0;
    var desafiosCompletados = 0;

    Object.keys(semanas).forEach(function(semanaKey) {
      var mrsEnSemana = semanas[semanaKey];
      var mrCountEnSemana = Object.keys(mrsEnSemana).length;
      mrCompletados += mrCountEnSemana;
      // Un desafío = 3 microretos de la misma semana
      if (mrCountEnSemana >= 3) desafiosCompletados++;
    });

    if (mrCompletados > _MAX_MR_NOW) {
      estudianteAlertas++;
      alertas.push({
        tipo     : 'EXCEDE_LIMITE_MICRORETOS',
        correo   : correo,
        semana   : '-',
        microreto: '-',
        fechaReg : '',
        xp       : '',
        detalle  : 'Tiene ' + mrCompletados + ' microretos completados. Límite actual: ' + _MAX_MR_NOW,
      });
    }

    if (desafiosCompletados > _MAX_CH_NOW) {
      estudianteAlertas++;
      alertas.push({
        tipo     : 'EXCEDE_LIMITE_DESAFIOS',
        correo   : correo,
        semana   : '-',
        microreto: '-',
        fechaReg : '',
        xp       : '',
        detalle  : 'Tiene ' + desafiosCompletados + ' desafíos completados. Límite actual: ' + _MAX_CH_NOW,
      });
    }

    // ── Verificación 4: consistencia de XP ──

    // XP esperado = suma de max(xp) por (semana, microreto) + bonus por desafíos completados
    // Nota: el bonus de desafío (100 XP) se incluye solo para desafíos con los 3 microretos.
    var xpEsperado = 0;
    Object.keys(semanas).forEach(function(semanaKey) {
      var mrsEnSemana = semanas[semanaKey];
      var mrCountEnSemana = Object.keys(mrsEnSemana).length;

      Object.keys(mrsEnSemana).forEach(function(mrKey) {
        var maxXPMR = 0;
        mrsEnSemana[mrKey].forEach(function(rec) {
          if (rec.xp > maxXPMR) maxXPMR = rec.xp;
        });
        xpEsperado += maxXPMR;
      });

      // Bonus por desafío completo (100 XP — solo si los 3 microretos existen)
      if (mrCountEnSemana >= 3) xpEsperado += 100;
    });

    var estData   = estMap[correo];
    var xpActual  = estData ? estData.xpActual : 0;
    var diferencia = xpActual - xpEsperado;

    // Tolerancia: 10% o 50 XP para absorber diferencias de bonuses no modelados
    var tolerancia = Math.max(50, Math.round(xpEsperado * 0.1));
    if (Math.abs(diferencia) > tolerancia) {
      var tipoXP = diferencia > 0 ? 'XP_SUPERIOR_ESPERADO' : 'XP_INFERIOR_ESPERADO';
      estudianteAlertas++;
      alertas.push({
        tipo     : tipoXP,
        correo   : correo,
        semana   : '-',
        microreto: '-',
        fechaReg : '',
        xp       : xpActual,
        detalle  : 'XP en 01_ESTUDIANTES: ' + xpActual + ' | XP recalculado: ' + xpEsperado + ' | Diferencia: ' + diferencia,
      });
    }

    // ── Verificación 5: posible doble acreditación ──
    // Dos registros del mismo (correo, semana, microreto) dentro de 30 min

    Object.keys(semanas).forEach(function(semanaKey) {
      Object.keys(semanas[semanaKey]).forEach(function(mrKey) {
        var registros = semanas[semanaKey][mrKey];
        if (registros.length < 2) return;

        var sorted = registros.slice().sort(function(a, b) { return a.fecha_ms - b.fecha_ms; });
        for (var i = 1; i < sorted.length; i++) {
          var diff = sorted[i].fecha_ms - sorted[i-1].fecha_ms;
          if (diff > 0 && diff < 1800000) { // menos de 30 min
            advertencias.push({
              tipo     : 'REGISTROS_RAPIDOS',
              correo   : correo,
              semana   : semanaKey,
              microreto: mrKey,
              fechaReg : sorted[i].fechaStr,
              xp       : sorted[i].xp,
              detalle  : 'Dos registros del mismo microreto en ' + Math.round(diff / 60000) + ' min. Puede ser reintento legítimo.',
            });
          }
        }
      });
    });

    if (estudianteAlertas > 0) totalConAlertas++;
  });

  var duracion = new Date().getTime() - inicio;

  // ── Escribir reporte ──────────────────────────────────────────────

  _audWriteReport(ss, alertas, advertencias, {
    totalEstudiantes  : totalEstudiantes,
    totalConAlertas   : totalConAlertas,
    totalRegistros    : totalRegistros,
    totalFueraVentana : totalFueraVentana,
    totalSinCalendario: totalSinCalendario,
    totalAlertas      : alertas.length,
    totalAdvertencias : advertencias.length,
    duracion          : duracion,
  });

  Logger.log('Auditoría completada. Alertas: ' + alertas.length + ' | Advertencias: ' + advertencias.length
    + ' | Estudiantes con alertas: ' + totalConAlertas + '/' + totalEstudiantes);
}

// ── Helpers de auditoría ──────────────────────────────────────────────

function _audParseSVDate(dateStr, endOfDay) {
  if (!dateStr) return null;
  var s = dateStr.toString().trim();
  var p = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!p) return null;
  var y = parseInt(p[1], 10), mo = parseInt(p[2], 10), d = parseInt(p[3], 10);
  return endOfDay
    ? Date.UTC(y, mo - 1, d + 1, 5, 59, 59, 999)
    : Date.UTC(y, mo - 1, d,     6,  0,  0,   0);
}

function _audSheetToObjects(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0].map(function(h) { return h.toString().trim(); });
  var result = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (row.every(function(cell) { return cell === '' || cell === null || cell === undefined; })) continue;
    var obj = {};
    headers.forEach(function(h, j) { obj[h] = row[j]; });
    result.push(obj);
  }
  return result;
}

function _audWriteReport(ss, alertas, advertencias, stats) {
  // Eliminar hoja anterior si existe
  var existing = ss.getSheetByName(_AUD_SHEET);
  if (existing) ss.deleteSheet(existing);

  var sheet = ss.insertSheet(_AUD_SHEET);

  var rows = [];

  // Encabezado
  rows.push(['AUDITORÍA DE INTEGRIDAD — ' + _AUD_DATE, '', '', '', '', '', '']);
  rows.push(['']);

  // Resumen general
  rows.push(['RESUMEN', '', '', '', '', '', '']);
  rows.push(['Fecha ejecución', new Date().toISOString()]);
  rows.push(['Estudiantes analizados', stats.totalEstudiantes]);
  rows.push(['Registros de progreso', stats.totalRegistros]);
  rows.push(['Estudiantes con alertas', stats.totalConAlertas]);
  rows.push(['Total alertas', stats.totalAlertas]);
  rows.push(['Total advertencias', stats.totalAdvertencias]);
  rows.push(['Registros fuera de ventana', stats.totalFueraVentana]);
  rows.push(['Registros sin calendario', stats.totalSinCalendario]);
  rows.push(['Duración (ms)', stats.duracion]);
  rows.push(['Límite microretos (actual)', _MAX_MR_NOW]);
  rows.push(['Límite desafíos (actual)', _MAX_CH_NOW]);
  rows.push(['']);

  // Alertas
  rows.push(['ALERTAS (' + alertas.length + ')', '', '', '', '', '', '']);
  rows.push(['Tipo', 'Correo', 'Semana', 'Microreto', 'Fecha Registro', 'XP', 'Detalle']);
  alertas.forEach(function(a) {
    rows.push([a.tipo, a.correo, a.semana, a.microreto, a.fechaReg, a.xp, a.detalle]);
  });
  rows.push(['']);

  // Advertencias
  rows.push(['ADVERTENCIAS (' + advertencias.length + ')', '', '', '', '', '', '']);
  rows.push(['Tipo', 'Correo', 'Semana', 'Microreto', 'Fecha Registro', 'XP', 'Detalle']);
  advertencias.forEach(function(a) {
    rows.push([a.tipo, a.correo, a.semana, a.microreto, a.fechaReg, a.xp, a.detalle]);
  });

  if (rows.length > 0) {
    var maxCols = rows.reduce(function(m, r) { return Math.max(m, r.length); }, 0);
    var normalized = rows.map(function(r) {
      while (r.length < maxCols) r.push('');
      return r;
    });
    sheet.getRange(1, 1, normalized.length, maxCols).setValues(normalized);
  }

  // Formato básico de encabezados
  sheet.getRange('A1').setFontWeight('bold').setFontSize(12);
  sheet.getRange('A3').setFontWeight('bold');
  sheet.autoResizeColumns(1, 7);

  Logger.log('Reporte escrito en hoja: ' + _AUD_SHEET);
}
