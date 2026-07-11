# Checklist de Pruebas Pre-Piloto

Verificación completa antes de abrir la plataforma a los estudiantes del piloto semestral.

**Estado**: `[ ]` = pendiente · `[x]` = verificado · `[!]` = falla / requiere atención

---

## Bloque 1 — Infraestructura

### 1.1 Google Sheets
- [ ] La Google Sheet existe y tiene los permisos correctos (solo el dueño y los emails admin)
- [ ] Existen exactamente 7 hojas: `01_ESTUDIANTES`, `02_PROGRESO`, `03_INSIGNIAS`, `04_RANKING`, `05_EVENTOS`, `06_ANALITICA`, `07_RESPUESTAS`
- [ ] Los encabezados de cada hoja coinciden con los definidos en `Code.gs` constante `HEADERS`
- [ ] La hoja `01_ESTUDIANTES` está vacía (sin estudiantes de prueba)

### 1.2 Google Apps Script
- [ ] El proyecto de Apps Script existe y tiene el código de `Code.gs` actualizado
- [ ] Script Properties configuradas: `SPREADSHEET_ID`, `ADMIN_TOKEN`, `ADMIN_EMAILS`
- [ ] El Web App está desplegado como versión activa con acceso "Cualquier usuario"
- [ ] Ejecutar `initSheets()` manualmente retorna sin errores
- [ ] La URL del Web App responde con `{ ok: true, version: "1.0-rc" }` al visitarla en el navegador

### 1.3 Vercel
- [ ] El proyecto está desplegado desde la rama `main`
- [ ] Root Directory está configurado como `project`
- [ ] La URL raíz (/) redirige a DESAFIO.dc.html
- [ ] El despliegue usa el commit del tag `v1.0-rc`
- [ ] Headers de seguridad presentes (inspeccionar con DevTools > Network > Response Headers)

### 1.4 Repositorio GitHub
- [ ] Tag `v1.0-rc` creado y pusheado
- [ ] Release creado en GitHub con changelog
- [ ] Rama `main` protegida (no se puede hacer push directo)
- [ ] `.env` y archivos con secretos NO están en el historial de git

---

## Bloque 2 — Registro y autenticación de estudiantes

- [ ] Pantalla de bienvenida carga correctamente en el navegador
- [ ] Formulario de registro acepta nombre + email institucional (@upes.edu.sv o el dominio configurado)
- [ ] Al registrarse exitosamente: aparece un token de sesión y se crea la fila en `01_ESTUDIANTES`
- [ ] El token generado se guarda en `localStorage` y persiste al recargar la página
- [ ] Un email ya registrado no permite crear cuenta duplicada (backend retorna error apropiado)
- [ ] Al cerrar y reabrir el navegador, la sesión se restaura automáticamente
- [ ] "Cerrar sesión" limpia `localStorage` y regresa a la pantalla de registro

---

## Bloque 3 — Navegación y semanas

- [ ] La pantalla de semanas muestra las 18 semanas
- [ ] Semana 1 aparece desbloqueada (estado "disponible")
- [ ] Las semanas 2–18 aparecen bloqueadas para un estudiante nuevo
- [ ] Al completar semana 1, semana 2 se desbloquea
- [ ] El progreso de cada semana persiste al recargar (lee de `localStorage`)
- [ ] El XP acumulado se muestra correctamente en el encabezado
- [ ] El nivel del estudiante sube al alcanzar los umbrales de XP (nivel 1→2, 2→3, etc.)

---

## Bloque 4 — Challenge Engine

### 4.1 Flujo básico
- [ ] Al abrir un microreto, carga el JSON de `challenge-bank/`
- [ ] El temporizador inicia al comenzar el desafío
- [ ] Las preguntas se muestran en el orden del JSON
- [ ] El botón "Siguiente" solo avanza al responder
- [ ] Al responder la última pregunta, muestra la pantalla de resultados

### 4.2 Tipos de componentes (probar al menos uno de cada módulo)
- [ ] `memory` — secuencia de memoria: muestra y oculta, el estudiante reproduce
- [ ] `multiple_choice` — opciones múltiples: solo una opción seleccionable a la vez
- [ ] Al seleccionar respuesta correcta: animación de éxito visible
- [ ] Al seleccionar respuesta incorrecta: muestra la respuesta correcta (si configurado)

### 4.3 Límite de intentos
- [ ] Si `maxAttempts > 1` en el JSON, el estudiante puede reintentar
- [ ] Si `maxAttempts` es 1 (o se agotan los intentos), el microreto no permite nuevo inicio
- [ ] El XP no se acredita dos veces si el microreto ya fue completado (verificar en Sheet)

### 4.4 Abandono
- [ ] Cambiar de pestaña durante un desafío activo registra el evento de abandono en `05_EVENTOS`
- [ ] Navegar a otra pantalla desde `challenge-active` también registra abandono

---

## Bloque 5 — Gamificación

### 5.1 XP
- [ ] Completar un microreto acredita XP en `localStorage` y en `02_PROGRESO`
- [ ] El XP de la Sheet coincide con el XP del `localStorage` (reconciliación)
- [ ] No se puede acreditar más de 400 XP en un solo evento (verificar `MAX_XP_PER_EVENT`)
- [ ] Completar el mismo microreto dos veces no duplica el XP

### 5.2 Insignias
- [ ] Al desbloquear una insignia, aparece la animación de notificación
- [ ] La insignia se registra en `03_INSIGNIAS` en la Sheet
- [ ] No se duplica la misma insignia si ya fue desbloqueada
- [ ] Las 10 insignias están definidas y tienen condición de desbloqueo verificable

### 5.3 Ranking
- [ ] La pestaña de ranking muestra estudiantes ordenados por XP descendente
- [ ] El ranking se obtiene del backend (no datos mock)
- [ ] Al ganar XP, el ranking se actualiza al visitar la pestaña

---

## Bloque 6 — Panel Docente

- [ ] La pestaña "Panel Docente" en DESAFIO.dc.html muestra formulario de login
- [ ] Ingresar email NO-admin + token cualquiera → error visible
- [ ] Ingresar email admin correcto + ADMIN_TOKEN correcto → accede al panel
- [ ] El panel muestra la tabla de estudiantes registrados con XP y nivel
- [ ] Los datos son en tiempo real (no hardcodeados)

---

## Bloque 7 — Admin Panel (AdminPanel.dc.html)

- [ ] `https://tu-dominio.vercel.app/AdminPanel.dc.html` carga correctamente
- [ ] Sin credenciales → muestra solo el formulario de login
- [ ] Con credenciales incorrectas → mensaje de error
- [ ] Con credenciales correctas → muestra las 4 pestañas
- [ ] Pestaña Estudiantes: lista paginada, búsqueda funciona
- [ ] Acción "Cambiar estado" → refleja cambio en la Sheet
- [ ] Acción "Resetear XP" → XP vuelve a 0 en la Sheet (confirmar antes de ejecutar)

---

## Bloque 8 — Author Studio (AuthorStudio.dc.html)

- [ ] `https://tu-dominio.vercel.app/AuthorStudio.dc.html` carga correctamente
- [ ] Sin credenciales → solo formulario de login
- [ ] Con credenciales admin → accede al editor completo
- [ ] Cargar semana 1 desde el selector → muestra los microretos
- [ ] Editar un campo de texto → el cambio se refleja en el panel de previsualización
- [ ] Botón "Guardar + Subir" → guarda el JSON y sube a la Sheet (verificar en `07_RESPUESTAS` o el mecanismo correspondiente)
- [ ] Gestor de Variantes: agregar variante, editar pregunta, eliminar → JSON actualizado

---

## Bloque 9 — Content SDK

- [ ] `node content/sdk/validate.js content/challenge-bank/week01.json` → sale con código 0
- [ ] `node content/sdk/validate.js content/examples/` → sale con código 0 (sin errores)
- [ ] `node content/sdk/generate.js --list` → muestra 13 componentes disponibles
- [ ] `node content/sdk/generate.js --component matrix --week 5 --microreto 1` → genera archivo JSON válido
- [ ] El archivo generado pasa la validación sin errores

---

## Bloque 10 — Compatibilidad de navegadores

- [ ] Chrome (última versión) — escritorio
- [ ] Firefox (última versión) — escritorio
- [ ] Safari (última versión) — escritorio
- [ ] Chrome — móvil Android
- [ ] Safari — móvil iOS

Verificar en cada uno:
- [ ] La pantalla de registro funciona
- [ ] Los componentes interactivos responden al touch/click
- [ ] El layout no se rompe en pantallas pequeñas (< 768px)

---

## Bloque 11 — Seguridad básica

- [ ] `localStorage` NO contiene el ADMIN_TOKEN
- [ ] El ADMIN_TOKEN NO aparece en los archivos del repositorio (revisar con `grep -r "ADMIN_TOKEN" project/`)
- [ ] La URL del Web App de Apps Script está en `api-client.js` pero no en el repositorio público
- [ ] Las respuestas correctas NO están expuestas en el Network tab de forma directa (verificar para `memory` type al menos)
- [ ] Headers de seguridad presentes en la respuesta HTTP de Vercel

---

## Bloque 12 — Preparación para el piloto

- [ ] Comunicación enviada a los estudiantes con la URL de la plataforma
- [ ] Email del administrador configurado en ADMIN_EMAILS
- [ ] ADMIN_TOKEN compartido solo con los docentes autorizados (no por email — preferir canal seguro)
- [ ] Backup de la Google Sheet configurado (Google Drive > versiones)
- [ ] Documento de bienvenida/guía para estudiantes preparado
- [ ] Mecanismo de soporte técnico definido (quién atiende problemas de acceso)

---

## Firma de verificación

| Revisor | Fecha | Bloques revisados | Firma |
|---|---|---|---|
| | | | |
| | | | |

**El piloto puede iniciar cuando todos los items críticos (Bloques 1–5) estén marcados como verificados.**
