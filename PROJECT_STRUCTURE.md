# Estructura del Proyecto

Árbol completo del repositorio con descripción de cada archivo y carpeta.

```
banco-maestro-retos/
│
├── .gitignore                          # Archivos y carpetas ignorados por Git
├── .env.example                        # Plantilla de variables de entorno (sin valores reales)
├── vercel.json                         # Configuración de Vercel: root dir, rewrites, headers de seguridad
│
├── LICENSE                             # MIT License
├── README.md                           # Descripción general, arquitectura, tecnologías, instalación
├── CHANGELOG.md                        # Historial de versiones (Keep a Changelog)
├── SECURITY.md                         # Política de seguridad y reporte de vulnerabilidades
├── CONTRIBUTING.md                     # Guía de contribución (arquitectura congelada, flujo de contenido)
├── CODE_OF_CONDUCT.md                  # Código de conducta del equipo
│
├── DEPLOY.md                           # Guía de despliegue completo (GitHub → Vercel → Apps Script)
├── APPS_SCRIPT_SETUP.md                # Paso a paso: desplegar Code.gs como Web App
├── VERCEL_SETUP.md                     # Paso a paso: configurar el frontend en Vercel
├── GITHUB_SETUP.md                     # Paso a paso: primer commit, tag, release, ramas
├── TEST_CHECKLIST.md                   # Checklist completo de pruebas pre-piloto
├── PROJECT_STRUCTURE.md                # Este archivo — árbol del proyecto
│
└── project/                            # ← RAÍZ DEL SITIO DESPLEGADO EN VERCEL
    │
    ├── DESAFIO.dc.html                 # Aplicación principal — plataforma de estudiantes
    │                                   #   Pantallas: bienvenida, registro, semanas, challenge-active,
    │                                   #   resultados, perfil, ranking, panel-docente
    │
    ├── AuthorStudio.dc.html            # Editor visual de contenido del Banco Maestro
    │                                   #   Acceso: credenciales admin
    │                                   #   Funciones: editar microretos, gestionar variantes, subir al backend
    │
    ├── AdminPanel.dc.html              # Panel de administración docente
    │                                   #   Acceso: credenciales admin
    │                                   #   Tabs: Estudiantes, Progreso, Ranking, Analytics
    │
    ├── ComponentLibrary.dc.html        # Librería interactiva de los 16 componentes
    │                                   #   Uso: referencia de desarrollo y QA
    │
    ├── support.js                      # Runtime de Claude Design (NO EDITAR)
    │                                   #   Carga: React 18.3.1, ReactDOM 18.3.1, Babel Standalone 7.29.0
    │                                   #   Transpila <script type="text/x-dc"> en runtime
    │                                   #   ~1768 líneas, generado automáticamente
    │
    ├── api-client.js                   # Cliente HTTP para el backend de Apps Script
    │                                   #   Métodos: login, registro, guardarProgreso, guardarXP,
    │                                   #   guardarInsignia, guardarEvento, getPerfil, getAdminData, subirBanco
    │                                   #   Idempotencia: cada request lleva requestId UUID
    │
    ├── challenge-engine.js             # Motor de desafíos — orquestador central
    │                                   #   Plugin-based: delega a modules/ según el tipo de componente
    │                                   #   Maneja: inicio, respuesta, abandono, tiempo, intentos
    │
    ├── event-bus.js                    # Sistema pub/sub para comunicación entre componentes
    │                                   #   Eventos principales: xp:earned, badge:unlocked,
    │                                   #   challenge:complete, challenge:abandon, user:registered
    │
    ├── Code.gs                         # Backend completo — Google Apps Script
    │                                   #   Web App endpoint (doGet/doPost)
    │                                   #   Funciones: registro, login, guardarXP, guardarInsignia,
    │                                   #   guardarEvento, getPerfil, getAdminData, subirBanco,
    │                                   #   updateRanking, initSheets
    │                                   #   Seguridad: LockService, idempotencia, token auth, audit log
    │
    ├── modules/
    │   ├── memory.js                   # Módulo de componentes de memoria
    │   │                               #   Tipos: memory_sequence, memory_recognition, stroop,
    │   │                               #   n_back, spatial_rotation, memory_grid (6 tipos)
    │   │
    │   └── multiple_choice.js          # Módulo de opción múltiple y derivados
    │                                   #   Tipos: multiple_choice, analogies, classification,
    │                                   #   ordering, case_card, series_completion, causal_relation,
    │                                   #   speed_identification, protocol_review, drag_drop (10 tipos)
    │
    ├── challenge-bank/                 # Banco Maestro de Retos — contenido semanal
    │   ├── week01.json                 # Semana 1: 3 microretos (con contenido de ejemplo)
    │   ├── week02.json                 # Semana 2: estructura vacía lista para contenido
    │   ├── week03.json                 # Semana 3: estructura vacía lista para contenido
    │   ├── ...                         # (semanas 4–17 siguen el mismo patrón)
    │   └── week18.json                 # Semana 18: estructura vacía lista para contenido
    │                                   #
    │                                   #   Cada weekNN.json:
    │                                   #   { week: N, microretos: [ {id, title, component, ...}, ... ] }
    │
    └── content/                        # Content SDK e infraestructura de contenido
        │
        ├── README.md                   # Índice de la carpeta content/
        │
        ├── sdk/
        │   ├── validate.js             # Validador de JSON — sin dependencias externas
        │   │                           #   Uso: node content/sdk/validate.js [ruta|directorio]
        │   │                           #   Valida: tipos, dificultad, tiempos, XP, opciones bilingüe,
        │   │                           #   correctEs/En, variantes, referencias a media
        │   │                           #   Salida: código 0 (OK/warnings), 1 (errores)
        │   │
        │   └── generate.js             # Generador de microretos desde plantillas
        │                               #   Uso: node content/sdk/generate.js --component TIPO --week N --microreto N
        │                               #   Flags: --out RUTA, --force, --list, --help
        │
        ├── plantillas/
        │   ├── README.md               # Instrucciones de uso de plantillas
        │   ├── analogies.template.json
        │   ├── case_card.template.json
        │   ├── drag_drop.template.json
        │   ├── escape_room.template.json
        │   ├── instrument_selector.template.json
        │   ├── matrix.template.json
        │   ├── observation.template.json
        │   ├── protocol_review.template.json
        │   ├── speed_challenge.template.json
        │   ├── timeline.template.json
        │   ├── verbal_fluency.template.json
        │   ├── visual_memory.template.json
        │   └── visual_search.template.json
        │                               #   13 plantillas — una por tipo de componente
        │                               #   Cada una tiene _templateInfo, componentConfig, questions[]
        │
        ├── examples/
        │   ├── README.md               # Descripción de los 3 niveles de ejemplos
        │   ├── analogies/{minimo,intermedio,avanzado}.json
        │   ├── case_card/{minimo,intermedio,avanzado}.json
        │   ├── drag_drop/{minimo,intermedio,avanzado}.json
        │   ├── escape_room/{minimo,intermedio,avanzado}.json
        │   ├── instrument_selector/{minimo,intermedio,avanzado}.json
        │   ├── matrix/{minimo,intermedio,avanzado}.json
        │   ├── observation/{minimo,intermedio,avanzado}.json
        │   ├── protocol_review/{minimo,intermedio,avanzado}.json
        │   ├── speed_challenge/{minimo,intermedio,avanzado}.json
        │   ├── timeline/{minimo,intermedio,avanzado}.json
        │   ├── verbal_fluency/{minimo,intermedio,avanzado}.json
        │   ├── visual_memory/{minimo,intermedio,avanzado}.json
        │   └── visual_search/{minimo,intermedio,avanzado}.json
        │                               #   39 archivos de ejemplo (13 componentes × 3 niveles)
        │                               #   Contenido ficticio — solo para ilustrar la estructura JSON
        │                               #   Todos validados sin errores por validate.js
        │
        ├── docs/
        │   └── CONTENT_GUIDE.md        # Guía completa de creación de contenido
        │                               #   9 secciones: campos obligatorios, tipos de componente,
        │                               #   sistema de dificultad, tiempos, XP, SVG/imágenes,
        │                               #   convención de nombres, variantes, workflow completo
        │
        ├── competencias/
        │   └── README.md               # Instrucciones para crear índices por habilidad
        │                               #   (vacío por diseño — el equipo de contenido lo llena)
        │
        └── media/
            ├── README.md               # Índice de carpetas de media
            ├── svg/
            │   └── README.md           # SVGs reutilizables: figuras Matrix, iconos, patrones
            └── icons/
                └── README.md           # Iconos rasterizados: instrumentos, herramientas, categorías
```

---

## Resumen de tecnologías

| Capa | Tecnología | Versión | Notas |
|---|---|---|---|
| Runtime frontend | Claude Design (`support.js`) | — | No editar |
| UI library | React + ReactDOM | 18.3.1 | Cargada desde CDN en runtime |
| Transpiler | Babel Standalone | 7.29.0 | Cargado desde CDN en runtime |
| Despliegue | Vercel | — | Sitio 100% estático, sin build |
| Backend | Google Apps Script | — | Serverless, alojado en Google |
| Base de datos | Google Sheets | — | 7 hojas |
| Content SDK | Node.js | ≥ 18 | Sin dependencias npm |

---

## Archivos que NO se editan

| Archivo | Razón |
|---|---|
| `support.js` | Generado por Claude Design — regenerar desde la herramienta |
| `challenge-engine.js` | Arquitectura congelada en v1.0-rc |
| `event-bus.js` | Arquitectura congelada en v1.0-rc |
| `modules/memory.js` | Arquitectura congelada en v1.0-rc |
| `modules/multiple_choice.js` | Arquitectura congelada en v1.0-rc |

---

## Archivos que el equipo de contenido edita frecuentemente

| Archivo | Propósito |
|---|---|
| `challenge-bank/weekNN.json` | Contenido de la semana N |
| `content/competencias/` | Índices por habilidad |
| `content/media/svg/` | Nuevos SVGs para microretos |
| `content/media/icons/` | Nuevos iconos de instrumentos |
