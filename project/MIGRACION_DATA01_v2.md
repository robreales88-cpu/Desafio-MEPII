# DATA-01B — Endurecimiento Final de la Migración

**Sprint:** DATA-01B  
**Fecha de planificación:** 2026-07-20  
**Script:** `MIGRACION_DATA01.gs` (v2 Hardened)  
**Basado en:** Auditoría de seguridad DATA-01A (8 riesgos identificados)

---

## Objetivo

Endurecer `MIGRACION_DATA01.gs` sin modificar el comportamiento funcional.  
Cada mejora apunta a un riesgo identificado en la auditoría DATA-01A.

---

## Mejoras implementadas

### 1. LockService (R1 — CRÍTICO)

`LockService.getScriptLock()` protege los pasos 5, 6 y 7 (escritura, eliminación y reconstrucción).  
Si una segunda ejecución intenta adquirir el lock mientras la primera sigue activa, falla con mensaje claro.  
El lock se libera siempre en `finally`, incluso si hay error.

```
Adquirir lock (waitLock 30s)
└─ PASO 5: escrituras
└─ PASO 6: eliminaciones
└─ PASO 7: reconstrucción
Liberar lock (finally)
```

### 2. Estado de migración con PropertiesService (R1 — CRÍTICO)

`PropertiesService.getScriptProperties()` guarda la clave `MIGRATION_RUNNING=true` justo antes del PASO 5.  
Solo se elimina si la migración completa con éxito.

| Momento | Acción |
|---|---|
| Inicio | Leer; si `true` → error con instrucciones de recovery |
| Antes de PASO 5 | `setProperty('MIGRATION_RUNNING', 'true')` |
| Éxito (post PASO 8) | `deleteProperty('MIGRATION_RUNNING')` |
| Error | No eliminar — obliga revisión manual antes de reintentar |

**Recovery manual si la flag quedó activa:**
```javascript
PropertiesService.getScriptProperties().deleteProperty("MIGRATION_RUNNING")
```

### 3. Protección de RANKING y ANALÍTICA (R3 — MODERADO)

La función `_migSafeReconstruct(ss, stats)` reemplaza el `clearContents()` directo:

1. Copiar RANKING → `TEMP_RANKING_MIG`
2. Copiar ANALITICA → `TEMP_ANALITICA_MIG`
3. Llamar `updateRanking()` y `recalcAnalitica()`
4. Si ambas tienen éxito → eliminar hojas temporales
5. Si cualquiera falla → restaurar desde temporales y relanzar el error

Esto garantiza que RANKING y ANALITICA nunca queden vacías, incluso si el proceso es interrumpido por el timeout de 6 minutos de Apps Script.

### 4. Normalización del Actor en EVENTOS (R6 — MODERADO)

Durante el PASO 3, para cada evento superviviente (no marcado para eliminar), se verifica si el valor raw del campo `Actor` difiere del correo canónico (ej. mayúsculas, espacios). Si difiere, se agrega a `pendingUpdates` para normalizarlo en el PASO 5.

Esto asegura que, tras la migración, todos los eventos de un estudiante usen exactamente la misma forma de su correo.

### 5. Validación real previa a la escritura: `_migPreValidate` (R2 — MODERADO)

Ejecutada al final del PASO 4, antes de adquirir el lock. Verifica:

1. Todos los correos canónicos son no vacíos y tienen formato válido (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`)
2. Cada grupo de duplicados tiene una fila primaria con `_row ≥ 2`
3. Ninguna entrada en `pendingUpdates` tiene `col` inválido (undefined, NaN, < 1)
4. Las columnas críticas de `01_ESTUDIANTES` (`Correo`, `XP`, `Nivel`, `FechaRegistro`, `Estado`) existen en el encabezado cargado

Si se detecta cualquier inconsistencia, el proceso se detiene antes de tocar el spreadsheet.

### 6. Verificación final post-migración: `_migFinalVerify` (R8 — MENOR)

Reemplaza la llamada directa a `_migPostValidate`. Re-lee todas las hojas afectadas desde el spreadsheet y ejecuta:

- Calcula `xpTotal` sumando el XP de todos los estudiantes consolidados
- Verifica que `04_RANKING` no está vacío
- Verifica que `04_RANKING` no tiene entradas huérfanas (correos sin registro en `01_ESTUDIANTES`)
- Verifica que `06_ANALITICA` fue reconstruida (advierte si está vacía, no falla)
- Ejecuta las 5 validaciones estándar de `_migPostValidate`

### 7. Informe técnico ampliado

El informe `DATA01_REPORTE_2026-07-20` incluye ahora:

| Campo nuevo | Descripción |
|---|---|
| Duración (ms) | Tiempo total de ejecución |
| Respaldos creados | Cuántos nuevos backups se generaron |
| Filas actualizadas | Total de `setValue()` ejecutados |
| XP total acumulado | Suma de XP de todos los estudiantes tras la migración |
| RANKING generado | Sí / No |
| ANALÍTICA generada | Sí / No |
| ADVERTENCIAS | Sección separada de warnings no críticos |

### 8. Revisión de código

Durante la implementación se corrigieron estos detalles menores:

- `_migBackup` ahora devuelve el número de respaldos creados (antes: `void`)
- La clave de deduplicación de EVENTOS usa `canonical` directamente en lugar de `nrm(r.Actor)` (equivalentes, pero más explícito)
- El path de "sin duplicados" ahora establece `stats.estudiantesDespues = stats.estudiantesAntes`
- Se usan `var` en lugar de `const/let` en el scope de funciones helper para máxima compatibilidad con el runtime V8 de Apps Script

---

## Riesgos abordados

| ID | Severidad | Riesgo original | Mitigación |
|---|---|---|---|
| R1 | CRÍTICO | Sin protección contra ejecuciones concurrentes o interrumpidas | LockService + PropertiesService flag |
| R2 | MODERADO | Validación pre-escritura vacía (`inconsistencias` nunca se poblaba) | `_migPreValidate` real |
| R3 | MODERADO | RANKING/ANALITICA pueden quedar vacías si falla la reconstrucción | `_migSafeReconstruct` con copia temporal |
| R6 | MODERADO | Actor en EVENTOS puede quedar con forma no canónica | Normalización en PASO 3 + pendingUpdates |
| R8 | MENOR | Post-verificación no incluía RANKING ni ANALITICA | `_migFinalVerify` completa |

---

## Comportamiento funcional — sin cambios

Las siguientes reglas de consolidación son idénticas a v1:

- **XP:** recalcular desde historial de progreso; fallback al máximo entre duplicados. Nunca sumar.
- **PROGRESO:** mayor XP por `(Semana, Microreto)`; empate → más reciente.
- **INSIGNIAS:** una por tipo, la más antigua.
- **EVENTOS:** conservar todo; eliminar solo duplicados exactos (5 campos idénticos).
- **Perfil primario:** fila con `UltimoAcceso` más reciente.
- **FechaRegistro:** la más antigua entre duplicados.
- **Estado:** `activo` si alguna fila era activa.

---

## Idempotencia

La migración v2 mantiene todas las garantías de idempotencia de v1:

- Respaldos omitidos si ya existen
- Sin duplicados → informe de validación sin modificar datos
- Segunda ejecución exitosa produce el mismo estado que la primera

Adicionalmente, si la primera ejecución falló y dejó `MIGRATION_RUNNING=true`, la segunda ejecución se detiene con instrucciones claras en lugar de ejecutarse sobre datos potencialmente en estado intermedio.

---

## Ejecución

```
migracionEstudiantes()
```

Desde el editor de Apps Script: seleccionar la función en el menú y presionar Run.

Resultado esperado en `DATA01_REPORTE_2026-07-20`.
