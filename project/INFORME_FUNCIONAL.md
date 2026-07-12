# Informe Funcional de Pruebas — DESAFÍO MEPII
**Fecha:** 2026-07-12  
**Versión:** 1.0 Sprint Final  
**Componentes cubiertos:** 15 áreas funcionales

---

## 1. Registro y Onboarding

| # | Caso de prueba | Resultado esperado | Estado |
|---|----------------|--------------------|--------|
| 1.1 | Registro con nombre, correo, grupo y sección válidos | Crea perfil local, llama `desafioAPI.registro()`, guarda token en localStorage | ✅ Implementado |
| 1.2 | Registro sin nombre | Muestra error de validación en rojo | ✅ Implementado |
| 1.3 | Registro sin `@` en correo | Muestra error de validación | ✅ Implementado |
| 1.4 | Registro con correo ya registrado (token correcto) | Backend responde `action: login`; frontend guarda token actualizado | ✅ Implementado |
| 1.5 | Registro con correo ya registrado (token incorrecto) | Backend responde `CUENTA_EXISTENTE`; frontend no sobreescribe datos | ✅ Implementado |
| 1.6 | Registro con email en `CONFIG.ADMIN_EMAILS` | Backend responde `role: docente`; frontend redirige a Panel Docente | ✅ Implementado (Sprint Final) |

---

## 2. Login y Gestión de Sesión

| # | Caso de prueba | Resultado esperado | Estado |
|---|----------------|--------------------|--------|
| 2.1 | Usuario con sesión guardada en localStorage vuelve a abrir la app | `loadUser()` restaura perfil → pantalla `dashboard` | ✅ Implementado |
| 2.2 | Docente con sesión guardada vuelve a abrir la app | `loadUser()` detecta `role: docente` → pantalla `teacher`, `teacherAuthed: true` | ✅ Implementado (Sprint Final) |
| 2.3 | Sin sesión guardada | Pantalla `landing` | ✅ Implementado |
| 2.4 | Login fallido (token incorrecto) | Backend responde `No autorizado`; no se almacena nada | ✅ Implementado |
| 2.5 | Cuenta inactiva | Backend responde `Cuenta desactivada` | ✅ Implementado |
| 2.6 | Reconciliación con servidor (XP mayor en backend) | `_reconcileWithServer()` actualiza XP local sin bajarlo | ✅ Implementado |

---

## 3. Sistema de Roles

| # | Caso de prueba | Resultado esperado | Estado |
|---|----------------|--------------------|--------|
| 3.1 | Email en `CONFIG.ADMIN_EMAILS` → registro/login | Backend devuelve `role: docente` | ✅ Implementado (Sprint Final) |
| 3.2 | Email no en lista → registro/login | Backend devuelve `role: estudiante` | ✅ Implementado (Sprint Final) |
| 3.3 | Docente recargando la página | `user.role === 'docente'` en localStorage → auto-redirect a `teacher` | ✅ Implementado (Sprint Final) |
| 3.4 | Estudiante intenta llamar `getTeacherPanel` con su token | Backend responde `No autorizado` (email no en ADMIN_EMAILS) | ✅ Implementado (Sprint Final) |
| 3.5 | Docente llama `getTeacherPanel` con su token | Backend valida token + ADMIN_EMAILS → devuelve datos completos | ✅ Implementado (Sprint Final) |
| 3.6 | Panel Docente con gate manual (botón "Docente") | Sigue funcionando con email + ADMIN_TOKEN para compatibilidad | ✅ Preservado |

---

## 4. Desafíos y Flujo de Retos

| # | Caso de prueba | Resultado esperado | Estado |
|---|----------------|--------------------|--------|
| 4.1 | Semana 1 siempre disponible | `isActive = true` para índice 0 | ✅ Implementado |
| 4.2 | Semana N bloqueada si N-1 no completada (sin schedule) | `isLocked = true` con opacidad 0.4 y cursor `not-allowed` | ✅ Implementado |
| 4.3 | Semana con `estado: activo` en schedule | `isActive = true` independientemente de completado previo | ✅ Implementado (Sprint Final) |
| 4.4 | Semana con `estado: cerrado` o `expirado` | `isLocked = true` con label "Cerrado" en amarillo | ✅ Implementado (Sprint Final) |
| 4.5 | Semana con `estado: futuro` y fechaInicio futura | `isLocked = true` con label "Disponible: YYYY-MM-DD" | ✅ Implementado (Sprint Final) |
| 4.6 | Fechas: ahora está entre fechaInicio y fechaFin | `isActive = true` automáticamente | ✅ Implementado (Sprint Final) |
| 4.7 | fechaFin pasada | `isLocked = true` con label "Cerrado" | ✅ Implementado (Sprint Final) |
| 4.8 | Sin entrada de schedule (pendiente) | Fallback al desbloqueo lineal original | ✅ Implementado (Sprint Final) |

---

## 5. Cronómetros y Fases del Microreto

| # | Caso de prueba | Resultado esperado | Estado |
|---|----------------|--------------------|--------|
| 5.1 | Fase de memorización: timer cuenta regresiva | `memTimeLeft` decrece, barra visual se reduce | ✅ Implementado |
| 5.2 | Timer de memorización expira | `engine.transitionToAnswer()` se llama automáticamente | ✅ Implementado |
| 5.3 | Fase de respuestas: timer cuenta regresiva | `ansTimeLeft` decrece, color cambia a rojo en ≤5s | ✅ Implementado |
| 5.4 | Timer de respuestas expira | `engine.submitAnswer('__timeout__')` automático | ✅ Implementado |
| 5.5 | Cambio de pestaña durante reto activo | `engine.registerTabSwitch()` → consume intento vía `abandonChallenge()` | ✅ Implementado |
| 5.6 | Nav durante reto activo | `_registerAbandon()` consume intento antes de navegar | ✅ Implementado |

---

## 6. Sistema de XP

| # | Caso de prueba | Resultado esperado | Estado |
|---|----------------|--------------------|--------|
| 6.1 | XP base + bonus velocidad | `base + Math.round((timeLeft/maxTime) * speedMax)` | ✅ Implementado |
| 6.2 | Bonus perfecto (todas correctas) | XP += `perfectBonus` del JSON | ✅ Implementado |
| 6.3 | Bonus de completar los 3 microretos | XP += 100 (challengeComplete) | ✅ Implementado |
| 6.4 | Microreto ya completado se repite | No vuelve a otorgar XP | ✅ Implementado |
| 6.5 | Validación server-side del XP | `guardarXP` recomputa desde `07_RESPUESTAS`; cap en `MAX_XP_PER_EVENT` | ✅ Implementado |
| 6.6 | Requestid idempotente | Segunda llamada con mismo requestId devuelve resultado cacheado (sin doblar XP) | ✅ Implementado |

---

## 7. Ranking

| # | Caso de prueba | Resultado esperado | Estado |
|---|----------------|--------------------|--------|
| 7.1 | `getRanking()` → retorna top 50 | Lista ordenada por XP descendente | ✅ Implementado |
| 7.2 | El estudiante actual aparece en su posición | `getRankedList()` mezcla ranking remoto con XP local | ✅ Implementado |
| 7.3 | Ranking sin backend → solo el usuario propio | `remoteRanking: []`, solo se ve a sí mismo | ✅ Implementado |
| 7.4 | Concurrent XP update → ranking correcto | `LockService` + write atómico en `updateRanking()` | ✅ Implementado |

---

## 8. Insignias

| # | Caso de prueba | Resultado esperado | Estado |
|---|----------------|--------------------|--------|
| 8.1 | Primera insignia `observer` al completar un microreto | Se asigna y anima `badgePop` | ✅ Implementado |
| 8.2 | Insignia `mind` al alcanzar 500 XP | Se verifica en `finishMicroreto` | ✅ Implementado |
| 8.3 | Insignia `precision` por puntuación perfecta | `stats.allCorrect === true` | ✅ Implementado |
| 8.4 | Insignia `agility` por velocidad < 30s y 100% precisión | `stats.accuracy === 100 && stats.timeUsed < 30` | ✅ Implementado |
| 8.5 | Insignia ya ganada no se duplica | `!updUser.badges.includes(id)` antes de push | ✅ Implementado |
| 8.6 | Sync de insignia al backend | `guardarInsignia()` con idempotency | ✅ Implementado |

---

## 9. Backend — Apps Script

| # | Caso de prueba | Resultado esperado | Estado |
|---|----------------|--------------------|--------|
| 9.1 | `doGet` con acción desconocida | Responde `{ ok: false, error: 'Acción no reconocida' }` | ✅ Implementado |
| 9.2 | `doPost` con body malformado | Try/catch → responde error | ✅ Implementado |
| 9.3 | `requireStudent` con token incorrecto | Responde `No autorizado` | ✅ Implementado |
| 9.4 | `requireAdmin` sin email en ADMIN_EMAILS | Retorna false → endpoint responde `No autorizado` | ✅ Implementado |
| 9.5 | `getCalendario` sin auth | Retorna schedule pública (sin tokens) | ✅ Implementado (Sprint Final) |
| 9.6 | `getTeacherPanel` con token de docente | Valida student token + ADMIN_EMAILS → datos admin | ✅ Implementado (Sprint Final) |
| 9.7 | `docenteAction: calendarioUpdate` | Upsert en `08_CALENDARIO` + log de evento | ✅ Implementado (Sprint Final) |
| 9.8 | `subirBanco` sin token admin | Responde `No autorizado` | ✅ Implementado |
| 9.9 | `evaluateSubmission` con answer key disponible | Recomputa correctas/XP server-side | ✅ Implementado |
| 9.10 | `evaluateSubmission` sin answer key | Usa valores del cliente, cap MAX_XP_PER_EVENT | ✅ Implementado |

---

## 10. Google Sheets

| # | Caso de prueba | Resultado esperado | Estado |
|---|----------------|--------------------|--------|
| 10.1 | `initSheets()` primera ejecución | Crea 8 hojas con headers + seed de 18 filas en 08_CALENDARIO | ✅ Implementado (Sprint Final) |
| 10.2 | `initSheets()` segunda ejecución | No duplica filas (guard `rows.length > 0`) | ✅ Implementado (Sprint Final) |
| 10.3 | `updateRanking()` escritura atómica | `clearContents()` + single `setValues()` → nunca readable a mitad | ✅ Implementado |
| 10.4 | `sheetToObjects()` con hoja vacía | Retorna `[]` | ✅ Implementado |
| 10.5 | `updateRow()` con predicado que no coincide | Retorna `false`; no modifica la hoja | ✅ Implementado |
| 10.6 | Sheet `08_CALENDARIO` upsert (semana existente) | `updateRow()` actualiza campos relevantes | ✅ Implementado (Sprint Final) |
| 10.7 | Sheet `08_CALENDARIO` upsert (semana nueva) | `appendRow()` crea la fila | ✅ Implementado (Sprint Final) |

---

## 11. Panel Docente

| # | Caso de prueba | Resultado esperado | Estado |
|---|----------------|--------------------|--------|
| 11.1 | Gate manual (email + ADMIN_TOKEN) | Muestra panel con datos de estudiantes | ✅ Implementado |
| 11.2 | Docente registrado → auto-acceso sin gate | `teacherAuthed: true` automático, carga `getTeacherPanel` | ✅ Implementado (Sprint Final) |
| 11.3 | Métricas: total estudiantes, XP promedio, tiempo, pendientes | Se calculan desde `teacherData` | ✅ Implementado |
| 11.4 | Tabla de estudiantes con paginación | Columnas: nombre, email, grupo, sección, nivel, XP, completados, tiempo | ✅ Implementado |
| 11.5 | Sección Calendario Académico — toggle | Botón "Calendario Académico" muestra/oculta tabla de 18 semanas | ✅ Implementado (Sprint Final) |
| 11.6 | Calendario: cambiar fechaInicio / fechaFin | Actualización optimista local + POST `docenteAction` al backend | ✅ Implementado (Sprint Final) |
| 11.7 | Calendario: botón "Activar" | Establece `estado: activo` en backend y actualiza vista | ✅ Implementado (Sprint Final) |
| 11.8 | Calendario: botón "Cerrar" | Establece `estado: cerrado` en backend y actualiza vista | ✅ Implementado (Sprint Final) |
| 11.9 | Reversión optimista si falla el backend | Estado previo restaurado en el catch | ✅ Implementado (Sprint Final) |
| 11.10 | Estado del calendario sincroniza con `chList` en pantalla de desafíos | `_sch` en `renderVals()` refleja cambios inmediatamente | ✅ Implementado (Sprint Final) |

---

## 12. Exportaciones

| # | Caso de prueba | Resultado esperado | Estado |
|---|----------------|--------------------|--------|
| 12.1 | Botón CSV en Panel Docente | Descarga `desafio_estudiantes.csv` con datos tabulados | ✅ Implementado |
| 12.2 | Botón Excel en Panel Docente | Descarga `.xls` con estructura TSV (compatible con Excel) | ✅ Implementado |
| 12.3 | Exportación sin datos de estudiantes | Descarga archivo con solo headers | ✅ Implementado |

---

## 13. Responsive y Layout

| # | Caso de prueba | Resultado esperado | Estado |
|---|----------------|--------------------|--------|
| 13.1 | Pantalla > 640px | Muestra nav desktop (`dt-nav`), oculta nav mobile | ✅ Implementado |
| 13.2 | Pantalla ≤ 640px | Muestra nav mobile (`mob-nav`), oculta nav desktop; `padding-bottom: 68px` | ✅ Implementado |
| 13.3 | Tabla de desafíos en mobile | Cards en columna, texto truncado con `text-overflow: ellipsis` | ✅ Implementado |
| 13.4 | Tabla del Panel Docente en mobile | Grid collapsa o hace scroll horizontal | ⚠️ Verificación manual recomendada |
| 13.5 | Calendario Académico en mobile | Grid de 6 columnas puede ser estrecho — recomendado scroll horizontal | ⚠️ Revisar en dispositivos reales |

---

## 14. Compatibilidad de Navegadores

| Navegador | Versión mínima | Estado |
|-----------|---------------|--------|
| Chrome / Chromium | 90+ | ✅ Compatible |
| Firefox | 88+ | ✅ Compatible |
| Safari | 14+ | ✅ Compatible (sin Web Crypto en HTTP) |
| Edge (Chromium) | 90+ | ✅ Compatible |
| Mobile Safari (iOS 14+) | — | ✅ Compatible |
| Android Chrome | 90+ | ✅ Compatible |

**Nota:** `dc-runtime` (support.js) no usa APIs experimentales. `localStorage`, `fetch`, `EventTarget`, `AudioContext` son ampliamente compatibles en las versiones listadas.

---

## 15. Seguridad

| # | Área | Verificación | Estado |
|---|------|-------------|--------|
| 15.1 | Token de estudiante nunca expuesto en `sanitizeUser` | Campo `Token` excluido explícitamente | ✅ |
| 15.2 | ADMIN_TOKEN no expuesto en respuestas al cliente | Solo se usa internamente en `getTeacherPanel()` | ✅ |
| 15.3 | `requireAdmin` requiere AMBOS: email en lista Y token correcto | Validación de doble factor | ✅ |
| 15.4 | `docenteAction` valida token de estudiante primero | Usa `requireStudent` + check ADMIN_EMAILS | ✅ |
| 15.5 | Idempotencia anti-doble-XP | `withIdempotency(requestId, fn)` con TTL 6h | ✅ |
| 15.6 | `getCalendario` es pública (sin auth) | Datos de schedule no son secretos | ✅ Diseño intencional |
| 15.7 | XP del cliente no se confía ciegamente | `evaluateSubmission()` recalcula server-side cuando hay answer key | ✅ |

---

## Resumen Ejecutivo

| Área | Items totales | Implementados | Pendiente / Manual |
|------|--------------|---------------|--------------------|
| Registro/Login | 6 | 6 | 0 |
| Sistema de Roles | 6 | 6 | 0 |
| Desafíos + Schedule | 8 | 8 | 0 |
| Cronómetros | 6 | 6 | 0 |
| XP | 6 | 6 | 0 |
| Ranking | 4 | 4 | 0 |
| Insignias | 6 | 6 | 0 |
| Backend Apps Script | 10 | 10 | 0 |
| Google Sheets | 7 | 7 | 0 |
| Panel Docente | 10 | 10 | 0 |
| Exportaciones | 3 | 3 | 0 |
| Responsive | 5 | 3 | 2 (verificación manual) |
| Compatibilidad | 6 | 6 | 0 |
| Seguridad | 7 | 7 | 0 |
| **Total** | **90** | **88** | **2** |

**Cobertura: 97.8%**

Los 2 items pendientes (13.4 y 13.5) requieren prueba en dispositivos físicos o emuladores — el layout del Calendario Académico usa 6 columnas y puede necesitar scroll horizontal en pantallas muy estrechas.
