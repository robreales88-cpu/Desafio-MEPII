# REPORTE_CORRECCIONES — Hallazgos y Correcciones Propuestas

**Sprint:** AUDIT-01  
**Fecha:** 2026-07-20  
**Basado en:** AUDITORIA_INTEGRIDAD_PLATAFORMA.md  
**Estado:** Correcciones de código propuestas — verificación de datos pendiente de ejecutar `AUDITORIA_DATA01.gs`

---

## Sección 1 — Correcciones de código

### C1 — Agregar validación de calendario en `guardarProgreso()` y `guardarXP()` (CRÍTICO)

**Hallazgo:** B1 / F1  
**Archivo:** `Code.gs` — funciones `guardarProgreso()` (línea 238) y `guardarXP()` (línea 260)  
**Causa:** El backend acepta registros de progreso y actualizaciones de XP para cualquier semana, independientemente de si esa semana está activa en `08_CALENDARIO`.

**Corrección propuesta:**

Agregar al inicio de ambas funciones (después de `requireStudent`), antes de cualquier escritura:

```javascript
// Validar que la semana enviada esté activa en el calendario
var calRows = sheetToObjects(getSheet(SHEETS.CALENDARIO));
var calEntry = calRows.find(function(r) { return Number(r.Semana) === Number(data.semana); });
if (!calEntry) {
  return { ok: false, error: 'La semana ' + data.semana + ' no está configurada en el calendario.' };
}
var now = new Date().getTime();
var isActive = calEntry.Estado === 'activo';
if (!isActive && calEntry.FechaInicio && calEntry.FechaFin) {
  // Aceptar también si las fechas están en rango (coherente con frontend)
  var inicioMs = _parseSVDateGAS(calEntry.FechaInicio, false);
  var finMs    = _parseSVDateGAS(calEntry.FechaFin, true);
  isActive = (inicioMs && finMs && now >= inicioMs && now <= finMs);
}
if (!isActive) {
  return { ok: false, error: 'La semana ' + data.semana + ' no está activa actualmente.' };
}
```

Con la función auxiliar:

```javascript
function _parseSVDateGAS(dateStr, endOfDay) {
  if (!dateStr) return null;
  var p = dateStr.toString().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!p) return null;
  var y = parseInt(p[1], 10), mo = parseInt(p[2], 10), d = parseInt(p[3], 10);
  return endOfDay
    ? Date.UTC(y, mo - 1, d + 1, 5, 59, 59, 999)
    : Date.UTC(y, mo - 1, d,     6,  0,  0,   0);
}
```

**Impacto de la corrección:** Cierra el único vector que permite saltarse el calendario desde fuera del frontend. Tiene el mismo costo que `requireStudent` (una lectura de hoja, ya cacheada por Apps Script en la misma ejecución).

**Precaución:** Implementar después de verificar los datos actuales con `AUDITORIA_DATA01.gs`. Si hay registros legítimos de semanas que ya fueron cerradas (estudiantes que terminaron en el último día), la corrección no afectaría datos históricos — solo aplicaría hacia adelante.

---

### C2 — Separar lógica de acceso en `openChallenge()` del frontend (MODERADO, OPCIONAL)

**Hallazgo:** B2  
**Archivo:** `DESAFIO.dc.html` — función `openChallenge()`  
**Causa:** `openChallenge()` no verifica `isLocked` antes de cargar el motor. El lock visual en `chList.go` es la única barrera, y puede bypassearse desde consola.

**Corrección propuesta (defensiva):**

```javascript
openChallenge(idx) {
  const { user, schedule, calendarLoaded } = this.state;
  if (!user || !this.engine) return;

  // Verificar que el desafío no esté bloqueado según el calendario actual
  if (calendarLoaded) {
    const sch = schedule[idx + 1] || {};
    const est = sch.estado || 'pendiente';
    const now = Date.now();
    const start = this.parseSVDate(sch.fechaInicio, false);
    const end   = this.parseSVDate(sch.fechaFin, true);
    const isActive = est === 'activo' || (start && end && now >= start && now <= end);
    const isDone   = !!this.state.user?.challenges?.[idx]?.completed;
    if (!isActive && !isDone) {
      console.warn('[App] Intento de abrir desafío bloqueado:', idx + 1);
      return;
    }
  }

  this.setState({ loadingChallenge: true });
  this.engine.loadChallenge(idx + 1).then(data => ...);
}
```

**Nota:** Esta es una protección de defensa en profundidad. Sin C1 (validación backend), esta protección es insuficiente por sí sola. Con C1, esta corrección es opcional pero aumenta la robustez. La arquitectura del proyecto está congelada; esta modificación requiere aprobación antes de implementar.

---

## Sección 2 — Correcciones de datos

**Estado: PENDIENTE hasta ejecutar AUDITORIA_DATA01.gs**

### Procedimiento para verificar y corregir datos

1. **Ejecutar el script de auditoría:**
   - Abrir el editor de Apps Script del proyecto
   - Seleccionar `auditarIntegridad()` y presionar Run
   - Revisar la hoja `AUDITORIA_2026-07-20` generada

2. **Interpretar los tipos de alerta:**

   | Tipo de alerta | Qué significa | Acción sugerida |
   |---|---|---|
   | `SEMANA_SIN_CALENDARIO` | Progreso para una semana que no está en el calendario | Verificar si la semana fue omitida al configurar el calendario. Si el progreso es legítimo, agregar la semana al calendario. |
   | `FUERA_DE_VENTANA` | La fecha del registro cae antes de FechaInicio o después de FechaFin | Revisar si las fechas del calendario fueron modificadas después de que los estudiantes registraron progreso. Si las fechas son correctas, el progreso es sospechoso. |
   | `EXCEDE_LIMITE_MICRORETOS` | Más de 9 microretos completados | Revisar qué semanas completó el estudiante. Si hay semanas no habilitadas, fue por el hallazgo B1. |
   | `EXCEDE_LIMITE_DESAFIOS` | Más de 6 desafíos completados | Mismo análisis que el anterior. |
   | `XP_SUPERIOR_ESPERADO` | XP en el perfil supera el XP recalculado por >10% | Posible doble acreditación. Comparar con los registros de EVENTOS para confirmar. |
   | `XP_INFERIOR_ESPERADO` | XP en el perfil es menor al esperado | Puede indicar que un guardarXP() no se completó (error de red). Verificar si el estudiante reportó pérdida de XP. |
   | `REGISTROS_RAPIDOS` | Dos registros del mismo microreto en <30 min | Probable reintento legítimo (el sistema lo permite). Solo investigar si coincide con otro tipo de alerta. |

3. **Si se encuentran inconsistencias reales:**

   **Antes de cualquier corrección:**
   - Verificar que `MIGRACION_DATA01.gs` no se haya ejecutado aún
   - Confirmar el hallazgo revisando `05_EVENTOS` para ese estudiante (log de API calls)
   - Generar un respaldo manual de las hojas afectadas

   **Para registros de progreso de semanas no habilitadas:**
   - **NO eliminar automáticamente** — documentar primero
   - Evaluar si el contenido era accesible aunque no activo (el JSON estático siempre fue descargable)
   - Decidir si el progreso se acepta como válido o se anula el XP correspondiente

   **Para XP inconsistente:**
   - Calcular el delta de corrección: `delta = xpActual - xpEsperado`
   - Si `delta > 0` (XP inflado): considerar reducir XP con `adminResetXP()` y recalcular manualmente
   - Si `delta < 0` (XP perdido): revisar si el estudiante reportó el problema y compensar si corresponde

---

## Sección 3 — Prioridad de implementación

| # | Corrección | Severidad | Cuándo implementar |
|---|---|---|---|
| C1 | Backend calendar gate (`guardarProgreso`, `guardarXP`) | CRÍTICO | Después de ejecutar la auditoría de datos y confirmar que no hay efectos secundarios en datos históricos |
| C-data | Corrección de registros irregulares (si los hay) | Variable | Solo si AUDITORIA_DATA01.gs reporta alertas confirmadas |
| C2 | Validación frontend en `openChallenge()` | MODERADO, OPCIONAL | Sprint siguiente, requiere aprobación de cambio en arquitectura frontend |

---

## Sección 4 — Notas sobre idempotencia de correcciones

- La corrección C1 en backend es idempotente: no modifica datos existentes, solo rechaza nuevas escrituras inválidas.
- Si se decide corregir datos, cada corrección debe documentarse en `05_EVENTOS` con el campo `Evento = 'CORRECCION_AUDITORIA'` para mantener trazabilidad.
- Ninguna corrección de datos debe ejecutarse mientras `MIGRATION_RUNNING = true` esté activo en PropertiesService.
