# Banco Maestro de Retos

Plataforma de evaluación psicológica gamificada para estudiantes universitarios. Desarrollada para el piloto semestral 2025-I de la Universidad Psicológica de El Salvador (UPES).

---

## Descripción

El Banco Maestro de Retos es una plataforma web que entrena habilidades diagnósticas y clínicas a través de microretos interactivos organizados en 18 semanas. Los estudiantes completan 3 microretos por semana (54 en total) usando 16 tipos de componentes interactivos distintos, acumulando XP, desbloqueando insignias y compitiendo en un ranking en tiempo real.

Los docentes administran el contenido desde el **Author Studio** y monitorean el progreso en el **Admin Panel**. El contenido se crea con el **Content SDK** — herramientas de línea de comandos sin dependencias que validan y generan JSONs de microretos.

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────┐
│                    Vercel (estático)                     │
│                                                          │
│  DESAFIO.dc.html      ← Aplicación principal            │
│  AuthorStudio.dc.html ← Editor de contenido (admin)     │
│  AdminPanel.dc.html   ← Panel docente (admin)           │
│  ComponentLibrary.dc.html ← Librería de referencia      │
│                                                          │
│  support.js           ← Runtime Claude Design           │
│  challenge-engine.js  ← Motor de desafíos               │
│  event-bus.js         ← Pub/sub entre componentes       │
│  api-client.js        ← Cliente HTTP al backend         │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTPS (doPost/doGet)
┌───────────────────────▼─────────────────────────────────┐
│             Google Apps Script (serverless)              │
│                                                          │
│  Code.gs — endpoints: registro, login, XP, insignias,   │
│  progreso, admin, subirBanco, ranking, analítica         │
│                                                          │
│  LockService → escritura atómica de XP                  │
│  Idempotencia → previene replay de XP (TTL 6h)          │
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────┐
│                  Google Sheets                           │
│                                                          │
│  01_ESTUDIANTES  02_PROGRESO   03_INSIGNIAS              │
│  04_RANKING      05_EVENTOS    06_ANALITICA              │
│  07_RESPUESTAS                                           │
└─────────────────────────────────────────────────────────┘
```

**No hay servidor Node.js, no hay base de datos SQL, no hay build step.** El frontend es HTML/CSS/JS puro servido como archivos estáticos. El backend es un script alojado en Google.

---

## Tecnologías

| Capa | Tecnología | Notas |
|---|---|---|
| Runtime UI | Claude Design (`support.js`) | React 18.3.1 + Babel 7.29.0 desde CDN |
| Frontend | HTML/CSS/JS (`.dc.html`) | Sin framework build, sin npm en producción |
| Despliegue | Vercel | 100% estático |
| Backend | Google Apps Script | Serverless, alojado en Google |
| Base de datos | Google Sheets | 7 hojas nombradas |
| Content SDK | Node.js ≥ 18 | Sin dependencias npm |

---

## Estructura de carpetas

```
banco-maestro-retos/
├── project/                    ← Raíz desplegada en Vercel
│   ├── DESAFIO.dc.html         ← App principal
│   ├── AuthorStudio.dc.html    ← Editor de contenido
│   ├── AdminPanel.dc.html      ← Panel docente
│   ├── ComponentLibrary.dc.html
│   ├── support.js              ← Runtime (no editar)
│   ├── api-client.js           ← Cliente HTTP
│   ├── challenge-engine.js     ← Motor de desafíos
│   ├── event-bus.js
│   ├── Code.gs                 ← Backend Apps Script
│   ├── modules/
│   │   ├── memory.js           ← 6 tipos de memoria
│   │   └── multiple_choice.js  ← 10 tipos MC y derivados
│   ├── challenge-bank/
│   │   └── week01–18.json      ← Contenido semanal
│   └── content/
│       ├── sdk/                ← validate.js, generate.js
│       ├── plantillas/         ← 13 plantillas JSON
│       ├── examples/           ← 39 ejemplos de referencia
│       ├── docs/               ← CONTENT_GUIDE.md
│       ├── competencias/       ← Índices por habilidad
│       └── media/              ← svg/, icons/
├── vercel.json
├── DEPLOY.md
└── ...
```

Ver `PROJECT_STRUCTURE.md` para el árbol completo con descripción de cada archivo.

---

## Instalación y desarrollo local

El proyecto no requiere instalación para el frontend — abre los `.dc.html` directamente en un servidor local.

```bash
# Clonar el repositorio
git clone https://github.com/USUARIO/banco-maestro-retos.git
cd banco-maestro-retos

# Servir localmente (cualquier servidor HTTP estático)
# Opción 1: Python
python3 -m http.server 8080 --directory project

# Opción 2: Node.js (sin npm install)
npx serve project

# Opción 3: VS Code Live Server
# Instalar extensión "Live Server", click derecho en DESAFIO.dc.html → "Open with Live Server"
```

Abre `http://localhost:8080` en el navegador.

> **Nota:** Sin el backend de Apps Script configurado, el registro y guardado de datos fallará. Para desarrollo local del contenido usa el Content SDK — no necesita backend.

---

## Content SDK

Para crear y validar contenido del Banco Maestro sin necesidad de backend:

```bash
# Listar tipos de componente disponibles
node content/sdk/generate.js --list

# Generar un microreto nuevo desde plantilla
node content/sdk/generate.js --component matrix --week 5 --microreto 1

# Validar un archivo JSON
node content/sdk/validate.js content/challenge-bank/week05.json

# Validar toda una carpeta
node content/sdk/validate.js content/examples/
```

Ver `content/docs/CONTENT_GUIDE.md` para la guía completa de creación de contenido.

---

## Despliegue

El despliegue completo involucra tres pasos independientes:

1. **Google Sheets** — crear la hoja y anotar el ID
2. **Google Apps Script** — pegar `Code.gs`, configurar secrets, desplegar Web App
3. **Vercel** — importar el repositorio, configurar root directory como `project/`

Ver la guía detallada:
- `DEPLOY.md` — guía unificada de despliegue
- `APPS_SCRIPT_SETUP.md` — paso a paso de Apps Script
- `VERCEL_SETUP.md` — paso a paso de Vercel
- `GITHUB_SETUP.md` — primer commit, tag, release

---

## Backend (Google Apps Script)

El archivo `project/Code.gs` contiene el backend completo. **No se despliega desde Vercel** — se copia manualmente al editor de Apps Script en [script.google.com](https://script.google.com).

Secretos configurados como Script Properties (nunca en el código):

| Propiedad | Descripción |
|---|---|
| `SPREADSHEET_ID` | ID de la Google Sheet del piloto |
| `ADMIN_TOKEN` | Token de acceso al panel docente y Author Studio |
| `ADMIN_EMAILS` | Emails autorizados como administradores |

---

## Seguridad

- `ADMIN_TOKEN` y `SPREADSHEET_ID` **nunca** se almacenan en el repositorio
- Ver `.env.example` para las variables requeridas
- Ver `SECURITY.md` para la política completa y cómo reportar vulnerabilidades

---

## Contribuir

La arquitectura de la plataforma está congelada en v1.0-rc. Las contribuciones aceptadas son de contenido (JSONs del Banco Maestro), documentación y assets de media.

Ver `CONTRIBUTING.md` para el flujo de trabajo y las convenciones.

---

## Checklist pre-piloto

Antes de abrir la plataforma a los estudiantes, completar todos los items en `TEST_CHECKLIST.md`.

---

## Licencia

MIT — ver `LICENSE`.

---

## Contacto

**Responsable técnico:** roberto.reales@upes.edu.sv  
**Universidad:** Universidad Psicológica de El Salvador (UPES)
