# Guía de Despliegue Completo

**Plataforma:** Banco Maestro de Retos — v1.0-rc  
**Stack:** Vercel (frontend estático) + Google Apps Script (backend) + Google Sheets (base de datos)

---

## Requisitos previos

- Cuenta de GitHub (repositorio creado)
- Cuenta de Vercel (conectada a GitHub)
- Cuenta de Google con acceso a Google Drive y Apps Script
- Node.js ≥ 18 instalado localmente (solo para el Content SDK — no se usa en producción)
- Git instalado localmente

---

## Paso 1 — Configurar Google Sheets

1. Ve a [Google Sheets](https://sheets.google.com) y crea una hoja nueva.
2. Asígnale el nombre: **Banco Maestro de Retos — Piloto 2025**
3. Anota el **ID de la hoja** desde la URL:
   ```
   https://docs.google.com/spreadsheets/d/[ESTE_ES_EL_ID]/edit
   ```
4. No es necesario crear las hojas manualmente — `Code.gs` las crea automáticamente al primer request con la función `initSheets()`.

---

## Paso 2 — Configurar Google Apps Script

Ver `APPS_SCRIPT_SETUP.md` para instrucciones detalladas. Resumen:

1. Ir a [script.google.com](https://script.google.com) > Nuevo proyecto
2. Pegar el contenido de `project/Code.gs`
3. Configurar Script Properties (SPREADSHEET_ID, ADMIN_TOKEN, ADMIN_EMAILS)
4. Ejecutar `initSheets()` manualmente para crear las 7 hojas
5. Desplegar como Web App > "Cualquier persona" > Copiar URL

---

## Paso 3 — Configurar el repositorio en GitHub

Ver `GITHUB_SETUP.md` para instrucciones detalladas. Resumen:

1. Crear repositorio en GitHub (privado recomendado)
2. Hacer push del código:
   ```bash
   git remote add origin https://github.com/USUARIO/REPO.git
   git push -u origin main
   ```
3. Crear tag de release:
   ```bash
   git tag v1.0-rc
   git push origin v1.0-rc
   ```

---

## Paso 4 — Conectar SCRIPT_URL al frontend

El archivo `project/api-client.js` línea 19 contiene:
```js
const SCRIPT_URL = 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec'; // ← replace
```

**Reemplaza este valor** con la URL real de tu Web App de Apps Script antes de hacer push. Esta URL no es un secreto (es pública — el secreto es el ADMIN_TOKEN que valida quién puede escribir).

---

## Paso 5 — Desplegar en Vercel

Ver `VERCEL_SETUP.md` para instrucciones detalladas. Resumen:

1. Ir a [vercel.com](https://vercel.com) > Nuevo proyecto > Importar desde GitHub
2. **Root Directory**: `project`
3. **Build Command**: vacío (sitio estático, sin build)
4. **Output Directory**: vacío (Vercel sirve `project/` directamente)
5. Variables de entorno: no son estrictamente necesarias si `SCRIPT_URL` ya está hardcodeado en `api-client.js`
6. Deploy

---

## Paso 6 — Verificar la comunicación frontend ↔ backend

Después del despliegue:

1. Abre la URL de Vercel en un navegador
2. Intenta registrarse con un email institucional
3. Abre DevTools > Network > filtra por `script.google.com`
4. Verifica que la llamada a `registro` retorna `{ ok: true, token: "..." }`
5. Navega a la semana 1, microreto 1 — completa el desafío
6. Verifica en la Google Sheet que apareció la fila en `02_PROGRESO` y `07_RESPUESTAS`

---

## Paso 7 — Verificar el panel docente

1. Navega a la pestaña "Panel Docente" en la plataforma
2. Ingresa el email admin y el ADMIN_TOKEN configurado
3. Verifica que aparece la tabla de estudiantes

---

## Paso 8 — Verificar Author Studio

1. Abre `https://tu-dominio.vercel.app/AuthorStudio.dc.html`
2. Ingresa credenciales admin
3. Carga `challenge-bank/week01.json` desde el selector de semana
4. Edita un campo y usa "Guardar + Subir" — verifica en la Sheet que el banco se actualiza

---

## Variables de entorno

| Variable | Dónde configurar | Ejemplo |
|---|---|---|
| `SCRIPT_URL` | `api-client.js` línea 19 (hardcodeado) | `https://script.google.com/macros/s/.../exec` |
| `SPREADSHEET_ID` | Apps Script > Script Properties | `1aBcDe...` |
| `ADMIN_TOKEN` | Apps Script > Script Properties | cadena hex de 32+ caracteres |
| `ADMIN_EMAILS` | Apps Script > Script Properties | `a@upes.edu.sv,b@upes.edu.sv` |

---

## Dominios y URLs del proyecto

| Servicio | URL |
|---|---|
| Frontend (Vercel) | `https://banco-maestro-retos.vercel.app` (o tu dominio personalizado) |
| Backend (Apps Script) | `https://script.google.com/macros/s/[ID]/exec` |
| Google Sheet | `https://docs.google.com/spreadsheets/d/[SPREADSHEET_ID]/edit` |
| Author Studio | `https://tu-dominio.vercel.app/AuthorStudio.dc.html` |
| Admin Panel | `https://tu-dominio.vercel.app/AdminPanel.dc.html` |
| Component Library | `https://tu-dominio.vercel.app/ComponentLibrary.dc.html` |

---

## Checklist de verificación post-despliegue

Ver `TEST_CHECKLIST.md` para el checklist completo antes del piloto.
