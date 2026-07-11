# Changelog

Todos los cambios notables de este proyecto se documentan aquí.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.0.0/).
Este proyecto usa [Semantic Versioning](https://semver.org/lang/es/).

---

## [1.0.0-rc] — 2025-07-11

Primera versión release candidate lista para piloto semestral.

### Agregado

#### Plataforma principal (`DESAFIO.dc.html`)
- Sistema de registro de estudiantes con token de sesión UUID
- Flujo de 18 semanas × 3 microretos cada una (54 desafíos totales)
- Motor de desafíos con soporte para 16 tipos de componentes interactivos
- Sistema de gamificación: XP, niveles 1–5, 10 insignias, ranking en tiempo real
- Ranking sincronizado con backend (reemplaza datos mock)
- Panel docente con login por email + token; datos en tiempo real desde Google Sheets
- Soporte bilingüe español/inglés con toggle en UI
- Detección de pérdida de foco de pestaña (registro de abandono, SEC-8)

#### Motor de desafíos (`challenge-engine.js`)
- Plugin architecture: dispachador central + módulos por tipo
- `modules/memory.js`: secuencias de memoria, reconocimiento, Stroop, N-back, spatial rotation, cuadrícula (6 tipos)
- `modules/multiple_choice.js`: opción múltiple, analogías, clasificación, ordenamiento, caso clínico, completar serie, relación causal, identificación rápida, protocolo (10 tipos)
- Límite de intentos por microreto (`maxAttempts`) leído desde JSON
- Prevención de replay de XP: `wasAlreadyCompleted` verifica historial antes de acreditar

#### Event Bus (`event-bus.js`)
- Sistema pub/sub desacoplado para comunicación entre componentes
- Eventos: `xp:earned`, `badge:unlocked`, `challenge:complete`, `challenge:abandon`, `user:registered`, `screen:nav`

#### API Client (`api-client.js`)
- Cliente HTTP para Google Apps Script Web App
- Idempotencia automática por `requestId` (UUID generado en cliente)
- Métodos: `login`, `registro`, `guardarProgreso`, `guardarXP`, `guardarInsignia`, `guardarEvento`, `getPerfil`, `getAdminData`, `subirBanco`
- Autenticación diferenciada estudiante (email + token) vs admin (email + adminToken)

#### Backend (`Code.gs`)
- Google Apps Script Web App completo, serverless
- 7 hojas de Google Sheets: `01_ESTUDIANTES`, `02_PROGRESO`, `03_INSIGNIAS`, `04_RANKING`, `05_EVENTOS`, `06_ANALITICA`, `07_RESPUESTAS`
- `LockService` para escritura atómica de XP concurrente
- Idempotencia server-side con TTL de 6 horas por `requestId`
- `MAX_XP_PER_EVENT` = 400 (techo anti-explotación)
- Autenticación de admin con token constante (timing-safe compare)
- Log de actor en todas las mutaciones admin (`adminSetEstado`, `adminResetXP`, `adminEditarEstudiante`)
- Función `subirBanco()`: recibe weekJSON desde AuthorStudio y lo persiste en la hoja

#### Author Studio (`AuthorStudio.dc.html`)
- Editor visual de contenido para el Banco Maestro de Retos
- Login gate con autenticación admin antes de mostrar la interfaz
- Gestor de Variantes completo: crear, duplicar, eliminar, reordenar, editar preguntas y opciones por variante
- Exportación de variantes a JSON por semana
- Botón de subida directa al backend (`subirBanco`) desde la UI
- Previsualización en tiempo real del microreto activo

#### Admin Panel (`AdminPanel.dc.html`)
- Login gate con autenticación admin
- 4 pestañas: Estudiantes, Progreso, Ranking, Analytics
- Búsqueda, filtrado y paginación de estudiantes
- Acciones: cambiar estado, resetear XP, editar datos

#### Content SDK (`content/sdk/`)
- `validate.js`: validador de JSON sin dependencias externas
  - Valida tipos de componente, dificultad, tiempos, XP, opciones bilingüe, correctEn/correctEs, variantes, referencias a media
  - Sale con código 1 en errores, 0 en solo-advertencias
- `generate.js`: generador de microretos desde plantillas
  - CLI con `--component`, `--week`, `--microreto`, `--out`, `--force`, `--list`

#### Banco Maestro de Retos (`challenge-bank/`)
- Estructura semana 1–18 (week01.json a week18.json)
- Semana 1 con contenido de ejemplo validado

#### Plantillas de componentes (`content/plantillas/`)
- 13 plantillas JSON: matrix, visual_memory, drag_drop, timeline, case_card, observation, analogies, escape_room, instrument_selector, protocol_review, speed_challenge, verbal_fluency, visual_search

#### Ejemplos de contenido (`content/examples/`)
- 3 niveles × 13 componentes = 39 archivos de ejemplo
- Contenido ficticio (herramientas, frutas, figuras, jardín encantado)
- Todos validados con `validate.js` sin errores

#### Documentación de contenido
- `content/docs/CONTENT_GUIDE.md`: guía completa de creación de contenido (9 secciones)
- `content/competencias/`: estructura lista para indexación por habilidad

### Seguridad (sprint de estabilización)

- SEC-1: Token de sesión generado en servidor al registro y validado en cada request
- SEC-2: `ADMIN_TOKEN` como Script Property, nunca en código fuente
- SEC-3: `withIdempotency()` previene replay de XP con TTL 6h
- SEC-4: `MAX_XP_PER_EVENT` = 400 como techo server-side
- SEC-5: Auditoría de actor en mutaciones admin
- SEC-6: `tokensMatch()` con comparación de longitud constante
- SEC-7: Mitigado — backend aplica techo de XP y re-evalúa cuando tiene clave de respuestas
- SEC-8: Registro de abandono al perder foco de pestaña

### Correcciones

- FE-1: Ranking usa datos reales del backend (no mock de estudiantes)
- FE-2: `nav()` registra abandono antes de navegar desde `challenge-active`
- ENG-7: `maxAttempts` leído desde JSON del microreto; XP no acreditable si ya fue completado
- BE-1: `updateRanking()` usa escritura atómica de rango en lugar de actualizaciones por celda
- BE-2: `guardarXP()` protegido con `LockService`

### Tecnologías

- **Runtime frontend**: Claude Design (`support.js`) con React 18.3.1 + Babel Standalone 7.29.0
- **Despliegue frontend**: Vercel (sitio estático, sin servidor)
- **Backend**: Google Apps Script Web App
- **Base de datos**: Google Sheets (7 hojas)
- **Content SDK**: Node.js (sin dependencias npm)
