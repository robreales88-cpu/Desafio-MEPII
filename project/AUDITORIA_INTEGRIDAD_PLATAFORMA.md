# AUDITORIA_INTEGRIDAD_PLATAFORMA — Análisis Completo

**Sprint:** AUDIT-01  
**Fecha:** 2026-07-20  
**Analista:** Revisión técnica previa a migración DATA-01  
**Alcance:** Lógica completa de la plataforma — calendar, acceso, sesiones, progreso, XP

---

## Metodología

Se analizaron los siguientes archivos en su totalidad:

| Archivo | Líneas | Descripción |
|---|---|---|
| `Code.gs` | 809 | Backend Google Apps Script completo |
| `DESAFIO.dc.html` | 2139 | Frontend completo — HTML + JS |
| `challenge-engine.js` | 282 | Motor de desafíos cliente |
| `challenge-bank/week01.json` | 390 | Muestra de estructura de contenido |

El análisis es estático: se revisó el código, no se ejecutó. Para la verificación de datos en vivo, ver `AUDITORIA_DATA01.gs`.

---

## Contexto del calendario académico

Parámetros provistos por la docente antes de la auditoría:

| Estado | Microretos permitidos | Desafíos permitidos |
|---|---|---|
| Hasta la semana anterior | 6 | 4 |
| Esta semana (activa) | 9 | 6 |

---

## Análisis por componente

### 1. Calendario académico (`08_CALENDARIO`)

**Hoja:** `08_CALENDARIO`  
**Headers:** `['Semana','FechaInicio','FechaFin','Estado','ActualizadoPor','UltimaActualizacion']`  
**Estados válidos:** `pendiente`, `futuro`, `activo`, `cerrado`, `expirado`

#### 1.1 `getCalendario()` (Code.gs:544)

```javascript
function getCalendario(params) {
  const rows = sheetToObjects(getSheet(SHEETS.CALENDARIO));
  const schedule = {};
  rows.forEach(r => {
    schedule[Number(r.Semana)] = {
      semana: Number(r.Semana), fechaInicio: r.FechaInicio || '',
      fechaFin: r.FechaFin || '', estado: r.Estado || 'pendiente',
    };
  });
  return { ok: true, schedule };
}
```

- **Sin autenticación:** el calendario es público. Cualquier persona puede ver qué semanas están activas y sus fechas. Diseño intencional para que estudiantes conozcan el calendario.
- Devuelve el estado actual de la hoja, no el histórico. Si una semana fue cerrada, su historial de estado activo no se persiste.

#### 1.2 `adminUpdateCalendario()` (Code.gs:579)

- Valida formato de fechas (`YYYY-MM-DD`) y que `FechaFin >= FechaInicio`.
- Cuando se activa una semana (`estado = 'activo'`), cierra automáticamente todas las otras semanas activas (`closeOthers !== false`). Esto garantiza que solo una semana esté activa al mismo tiempo por defecto.
- Loguea cada cambio en `05_EVENTOS`.

#### 1.3 `parseSVDate()` (DESAFIO.dc.html — frontend)

```javascript
parseSVDate(dateStr, endOfDay) {
  const p = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const y = +p[1], mo = +p[2], d = +p[3];
  return endOfDay
    ? Date.UTC(y, mo - 1, d + 1, 5, 59, 59)   // 23:59:59 SV = UTC+1 day −6h
    : Date.UTC(y, mo - 1, d,     6,  0,  0);   // 00:00:00 SV = UTC 06:00
}
```

- Zona horaria: El Salvador UTC−6, sin DST. Correcto.
- Si `fechaInicio` o `fechaFin` es vacío/inválido, devuelve `null` — el código cliente maneja `null` correctamente (no intentará comparar con `null`).

#### 1.4 HALLAZGO A1 — Doble mecanismo de desbloqueo (MENOR)

El frontend en `renderVals()` (DESAFIO.dc.html:1800) usa DOS condiciones independientes para desbloquear una semana:

```javascript
if (est === 'activo') {
  isActive = true; isLocked = false;                          // (1) por estado
} else if (est === 'cerrado' || est === 'expirado') {
  scheduleLabel = 'Cerrado';                                  // bloqueado
} else if (est === 'futuro' || (start !== null && now < start)) {
  scheduleLabel = 'Disponible: ' + sch.fechaInicio;           // bloqueado
} else if (start !== null && end !== null && now >= start && now <= end) {
  isActive = true; isLocked = false;                          // (2) por fechas
}
```

**Consecuencia:** Una semana con `estado = 'pendiente'` pero con fechas actuales en rango `[fechaInicio, fechaFin]` se desbloqueará automáticamente sin que la docente lo active explícitamente. Esto puede ser intencional (desbloqueo automático por fecha), pero debe tenerse en cuenta: si las fechas se cargan en el calendario antes de que la docente quiera activar la semana, los estudiantes tendrán acceso prematuro.

**No requiere corrección de código** — es diseño. Requiere cuidado operativo al publicar fechas.

---

### 2. Desbloqueo de semanas y acceso a desafíos

#### 2.1 `chList` en `renderVals()` (DESAFIO.dc.html:1776)

```javascript
// Challenges list — calendar is the SOLE authority; linear fallback eliminated.
const chList = Array.from({ length: 18 }, (_, i) => {
  ...
  go: isLocked ? () => {} : () => this.openChallenge(i),
});
```

El comentario "SOLE authority" confirma el diseño intencional: el calendario es la única fuente de verdad para desbloqueo. El guardián lineal (que requería completar la semana N antes de acceder a N+1) fue eliminado en QA-04. Esto es correcto.

Cuando `isLocked = true`, el `go` callback es un noop `() => {}` — no hay llamada al motor.

#### 2.2 `openChallenge()` (DESAFIO.dc.html)

```javascript
openChallenge(idx) {
  const { user } = this.state;
  if (!user) return;
  if (!this.engine) return;
  // No calendar check here — calendar lock is in chList.go above.
  this.setState({ loadingChallenge: true });
  this.engine.loadChallenge(idx + 1).then(data => ...);
}
```

La función no verifica el calendario. La validación ya se hizo en `chList.go`. Si un estudiante llama `this.openChallenge(N)` directamente desde la consola del navegador, accede al contenido aunque `isLocked = true`. Ver HALLAZGO B2.

#### 2.3 HALLAZGO B1 — Sin validación de calendario en el backend (CRÍTICO)

**`guardarProgreso()` (Code.gs:238) y `guardarXP()` (Code.gs:260) NO verifican `08_CALENDARIO`.**

```javascript
function guardarProgreso(data) {
  return withIdempotency(data.requestId, () => {
    const auth = requireStudent(data.email, data.token);
    if (!auth.ok) return auth;
    // ← No hay comprobación de semana activa aquí
    const evalResult = evaluateSubmission(data.semana, data.microreto, ...);
    sheet.appendRow([auth.user.Correo, data.semana, ...]);
    ...
  });
}
```

Un estudiante que envíe una petición HTTP directamente al endpoint de Apps Script puede registrar progreso para cualquier semana (pasada o futura) en cualquier momento, independientemente del estado del calendario.

**Vectores de explotación:**
1. Consola del navegador: `window.desafioAPI.guardarProgreso({semana: 5, microreto: 1, ...})`
2. Petición cURL directa al URL del script de Apps Script
3. Manipular el estado del motor desde la consola: `app.openChallenge(4)`

**Impacto:** Un estudiante técnicamente hábil podría completar semanas futuras antes de que estén habilitadas, obteniendo XP indebidamente.

#### 2.4 HALLAZGO B2 — Engine sin validación de calendario (MODERADO)

`ChallengeEngine.loadChallenge(weekNum)` (challenge-engine.js:59) hace `fetch('./challenge-bank/weekNN.json')` sin ninguna validación de calendario. Es un acceso al sistema de archivos estático del servidor — cualquier usuario con el URL puede leer el JSON de cualquier semana.

**Impacto:** Exposición del contenido de semanas futuras. Los estudiantes con conocimiento técnico pueden leer las preguntas antes de que la semana esté activa.

---

### 3. Motor de desafíos (ChallengeEngine)

- Responsabilidades: cargar JSON, despachar módulos, cronómetro, validar respuestas, calcular XP, emitir eventos.
- **Sin estado de calendario** — correcto por diseño. El engine es un motor de ejecución puro.
- `maxAttempts: 3` por microreto está definido en el JSON (`week01.json` y siguientes).
- La restricción de intentos se rastrea en 02_PROGRESO (`Intentos`) — el frontend lee el conteo desde el servidor en la reconstrucción de sesión.
- **XP por intento:** `base + round(ratio × speedMax)` donde `ratio = timeLeft / maxTime`. Nunca negativo.

---

### 4. Autenticación y sesiones

#### 4.1 `requireStudent()` (Code.gs)

Valida `email + token` contra la fila del estudiante en `01_ESTUDIANTES`. Sin esto, ninguna operación mutante procede.

#### 4.2 Ciclo de vida del token

```
registro() → genera token → almacenado en 01_ESTUDIANTES + localStorage
recuperarSesion(email) → genera nuevo token → invalida el anterior
```

- Los tokens **no tienen expiración** — válidos indefinidamente hasta el siguiente `recuperarSesion`.
- `recuperarSesion()` solo requiere el correo — sin contraseña, sin factor adicional.

#### 4.3 HALLAZGO D1 — Token sin expiración (MENOR)

Un token comprometido permanece válido hasta que el estudiante (u otro actor) llame `recuperarSesion`. Para una plataforma académica sin datos sensibles esto es aceptable, pero supone un riesgo si el dispositivo de un estudiante es compartido o comprometido.

#### 4.4 HALLAZGO D2 — Recuperación de sesión solo con correo (MENOR)

`recuperarSesion(data.email)` (Code.gs:376) autentica con solo el correo electrónico — sin token previo, sin verificación adicional. Cualquiera que conozca el correo de un estudiante puede invalidar su sesión activa y suplantar su cuenta.

**Diseño intencional** (el propio comentario del código lo indica: "knowledge of the email address is the only credential required, which is intentional — there are no passwords in this system"). Aceptable dado el contexto educativo de baja sensibilidad.

---

### 5. Cambio de dispositivo y recuperación de progreso

#### 5.1 `recuperarSesion()` (Code.gs:376)

```javascript
const progreso = progRows.filter(r => r.IDEstudiante === email);
const insignias = badgeRows.filter(r => r.IDEstudiante === email).map(r => r.Insignia);
return { ok: true, user: sanitizeUser(user), token: newToken, progreso, insignias };
```

Retorna **todo** el historial de progreso e insignias. No hay filtrado por fecha, estado del calendario, o semana activa.

#### 5.2 `_reconstructUserFromServer()` (DESAFIO.dc.html)

```javascript
(progreso || []).forEach(p => {
  const si = Number(p.Semana) - 1;
  const mi = Number(p.Microreto) - 1;
  if (si >= 0 && si < 18 && mi >= 0 && mi < 3) {
    mr.completed = true;
    mr.xp = Math.max(mr.xp, Number(p.XP) || 0);
    mr.attempts = Math.max(mr.attempts, Number(p.Intentos) || 1);
  }
});
```

Solo valida rangos de índice (0–17 para semanas, 0–2 para microretos). **No verifica si la semana estaba activa en el calendario cuando se completó**.

#### 5.3 HALLAZGO E1 — Reconstrucción sin validación temporal (MODERADO)

Si existen registros en 02_PROGRESO de semanas que no debían estar activas (ya sea por el hallazgo B1 o por ajuste manual del calendario), `recuperarSesion` reconstruirá ese progreso y `_reconstructUserFromServer` lo tratará como válido. Los microretos aparecerán como completados aunque su completión fuera irregular.

**No es un vector de ataque adicional** — si el registro llegó al backend es porque superó `requireStudent`. Es una consecuencia del hallazgo B1.

---

### 6. Guardar progreso e XP

#### 6.1 Flujo dual de escritura

El frontend realiza DOS llamadas al completar un microreto:

1. `guardarProgreso()` → appends a fila en `02_PROGRESO`
2. `guardarXP()` → **incrementa** `XP` en `01_ESTUDIANTES`

La separación es intencional: progreso registra el historial de intentos; XP actualiza el acumulado del perfil.

#### 6.2 HALLAZGO F1 — `guardarXP()` es incremental (MODERADO)

```javascript
const newXP = Number(user.XP) + delta;  // Code.gs:280
```

A diferencia de un recálculo desde cero, el XP en `01_ESTUDIANTES` se acumula incrementalmente. Si `guardarXP()` es llamado dos veces para el mismo microreto, el XP se dobla. La protección es:

1. **Frontend:** `wasAlreadyCompleted` previene la segunda llamada si el microreto ya tiene `completed = true`.
2. **Backend:** `withIdempotency` deduplica peticiones con el mismo `requestId` dentro de 6 horas.

Si un estudiante evita el frontend (ver hallazgo B1) o realiza la segunda llamada fuera de la ventana de 6 horas con un `requestId` diferente, el XP se duplicaría. Esta es la consecuencia de tener un modelo incremental sin recálculo.

#### 6.3 HALLAZGO F2 — Sin deduplicación de progreso por (semana, microreto) en el backend (MENOR)

`guardarProgreso()` hace `appendRow()` sin verificar si ya existe un registro para `(email, semana, microreto)`. Múltiples intentos generan múltiples filas (diseño correcto — registra el historial). Sin embargo, si `guardarXP()` se llama varias veces, el historial en PROGRESO no refleja el doble XP.

---

### 7. Cálculo de XP

| Componente | Fórmula | Protección |
|---|---|---|
| XP base microreto | `base` (50 por defecto) | Constante desde JSON |
| XP velocidad | `round(timeLeft/maxTime × speedMax)` | 0 si tiempo = 0 |
| XP perfecto | +50 si todas las preguntas correctas | Calculado en engine |
| Bonus desafío | +100 al completar los 3 microretos | `wasChallengeCompleted` check |
| Techo por evento | `MAX_XP_PER_EVENT = 400` | `Math.min(..., 400)` en backend |
| Clamp delta en guardarXP | `Math.max(0, Math.min(evalResult.xp + bonus, 400))` | Siempre no-negativo |

El techo de 400 XP por evento previene inflación masiva. El delta calculado en backend a partir de `07_RESPUESTAS` reemplaza el valor del cliente si la clave de respuestas existe; si no, usa el valor del cliente clampado a 400.

---

### 8. Idempotencia

- `withIdempotency(requestId, fn)`: deduplicación via `CacheService` con TTL de 6 horas (21600 s).
- `guardarInsignia()`: protegida por query explícita (`if existing return { ok: true, duplicate: true }`).
- `guardarXP()` y `guardarProgreso()`: protegidos solo por `withIdempotency` — si el mismo estudiante intenta de nuevo después de 6 horas con un requestId diferente, la acción se re-ejecutará.

---

## Tabla de hallazgos

| ID | Componente | Severidad | Hallazgo | Archivo | Línea aprox. |
|---|---|---|---|---|---|
| **B1** | Backend — progreso | **CRÍTICO** | `guardarProgreso()` y `guardarXP()` no validan que la semana esté activa en `08_CALENDARIO` | Code.gs | 238, 260 |
| **F1** | Backend — XP | **MODERADO** | XP incremental: doble llamada sin protección frontend/idempotencia → XP duplicado | Code.gs | 280 |
| **B2** | Engine / Frontend | **MODERADO** | `openChallenge()` y `ChallengeEngine` no validan calendario — fácilmente invocables desde consola | DESAFIO.dc.html | ~1200 |
| **E1** | Recuperación sesión | **MODERADO** | `_reconstructUserFromServer()` acepta todo el historial sin validación temporal | DESAFIO.dc.html | ~1390 |
| **A1** | Calendario | **MENOR** | Desbloqueo automático por fechas puede ocurrir sin acción explícita de la docente | DESAFIO.dc.html | 1800 |
| **D2** | Autenticación | **MENOR** | `recuperarSesion()` solo requiere correo — quien conozca el correo puede invalidar la sesión activa | Code.gs | 376 |
| **D1** | Tokens | **MENOR** | Tokens sin expiración temporal | Code.gs | — |
| **F2** | Progreso | **INFO** | `appendRow()` sin dedup por (semana, microreto) — múltiples intentos generan múltiples filas (diseño correcto) | Code.gs | 248 |
| **A2** | Calendario | **INFO** | `getCalendario()` no requiere autenticación — calendario es público (diseño intencional) | Code.gs | 544 |

---

## Verificación de datos

La verificación de los registros actuales en el spreadsheet requiere ejecutar el script `AUDITORIA_DATA01.gs` desde el editor de Apps Script.

### Qué verifica el script:

1. **Registros fuera de ventana de calendario:** filas en `02_PROGRESO` con `Fecha` anterior a `FechaInicio` o posterior a `FechaFin` de su semana.
2. **Semanas sin entrada en calendario:** progreso para semanas no configuradas en `08_CALENDARIO`.
3. **Conteos máximos por estudiante:** microretos y desafíos completados vs. límites del calendario actual.
4. **Consistencia de XP:** XP en `01_ESTUDIANTES` vs. XP recalculado desde `02_PROGRESO`.
5. **Entradas duplicadas de XP:** registros sospechosos que sugieran doble-acreditación.

### Resultado:

El script escribe sus hallazgos en una hoja `AUDITORIA_2026-07-20` en el mismo spreadsheet.

```
auditarIntegridad()
```

Desde el editor de Apps Script: seleccionar la función y presionar Run.

---

## Comportamiento correcto confirmado

Los siguientes mecanismos funcionan correctamente y no requieren cambios:

- Parseo de fechas en zona UTC−6 (El Salvador)
- Auto-cierre de semanas al activar una nueva (`adminUpdateCalendario`)
- Protección `wasAlreadyCompleted` para XP de replay
- Techo `MAX_XP_PER_EVENT = 400` aplicado en backend
- Deduplicación de insignias (query explícita antes de insertar)
- Reconstrucción de sesión desde PROGRESO (índices validados)
- LockService en `guardarXP()` para concurrencia
- Validación de token email+token en todas las rutas mutantes
