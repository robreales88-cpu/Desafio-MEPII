# Configuración de Vercel

Guía paso a paso para desplegar el frontend como sitio estático en Vercel.

---

## Requisitos previos

- Repositorio subido a GitHub (ver `GITHUB_SETUP.md`)
- `project/api-client.js` con la `SCRIPT_URL` real ya reemplazada (ver `APPS_SCRIPT_SETUP.md` paso 6)

---

## 1. Crear cuenta en Vercel

Si aún no tienes cuenta:

1. Ve a [vercel.com](https://vercel.com)
2. Haz clic en **"Sign Up"**
3. Selecciona **"Continue with GitHub"** — esto vincula tu cuenta de GitHub automáticamente

---

## 2. Importar el repositorio

1. En el dashboard de Vercel, haz clic en **"Add New..."** → **"Project"**
2. Bajo "Import Git Repository", busca el repositorio del proyecto
3. Haz clic en **"Import"**

---

## 3. Configurar el proyecto

En la pantalla de configuración del proyecto:

### Framework Preset
Selecciona **"Other"** (no es Next.js, Vite ni ningún framework conocido — es HTML estático puro)

### Root Directory
Haz clic en **"Edit"** y escribe:
```
project
```
Esto le dice a Vercel que sirva la carpeta `project/` como la raíz del sitio, no la raíz del repositorio.

### Build and Output Settings
Deja **todo vacío**:
- Build Command: (vacío)
- Output Directory: (vacío)
- Install Command: (vacío)

No hay build step — es HTML/JS/CSS puro.

### Environment Variables
No son necesarias si `SCRIPT_URL` ya está hardcodeado en `api-client.js`. Sin embargo, si quieres usar variables de entorno por entorno (staging vs producción):

| Name | Value | Environment |
|---|---|---|
| (ninguna requerida) | | |

---

## 4. Desplegar

Haz clic en **"Deploy"**.

Vercel clona el repositorio, detecta que `project/` es el root directory, y sirve todos los archivos estáticos. El despliegue tarda aproximadamente 30-60 segundos.

---

## 5. Verificar el despliegue

1. Al terminar, Vercel muestra una URL en formato `https://tu-proyecto-HASH.vercel.app`
2. Abre esa URL — deberías ver la pantalla de registro/bienvenida del Banco Maestro
3. La URL raíz `/` redirige a `/DESAFIO.dc.html` (configurado en `vercel.json`)

---

## 6. Configurar dominio personalizado (opcional)

Si quieres usar `app.upes.edu.sv` o similar:

1. En el proyecto de Vercel, ve a **"Settings"** → **"Domains"**
2. Escribe tu dominio personalizado y haz clic en **"Add"**
3. Vercel mostrará los registros DNS que debes agregar en tu proveedor de dominio:
   - Tipo `CNAME`: apunta al dominio `.vercel.app` que te asignaron
   - O tipo `A` si es un apex domain (dominio raíz sin subdominio)
4. Espera la propagación DNS (puede tardar hasta 24h)

---

## 7. Redesplegar automáticamente

Cada vez que hagas `git push` a la rama `main`, Vercel detecta el cambio y redespliega automáticamente. No necesitas hacer nada manualmente.

Para ramas distintas a `main`, Vercel crea **Preview Deployments** — URLs temporales para revisar cambios antes de mergear.

---

## Páginas disponibles después del despliegue

| Ruta | Descripción |
|---|---|
| `/` | Plataforma principal (DESAFIO.dc.html) |
| `/DESAFIO.dc.html` | Plataforma principal (acceso directo) |
| `/AuthorStudio.dc.html` | Author Studio (requiere auth admin) |
| `/AdminPanel.dc.html` | Panel de administración (requiere auth admin) |
| `/ComponentLibrary.dc.html` | Librería de componentes interactivos |

---

## El archivo `vercel.json`

El repositorio incluye `vercel.json` en la raíz con:

```json
{
  "outputDirectory": "project",
  "rewrites": [{ "source": "/", "destination": "/DESAFIO.dc.html" }],
  "headers": [...]
}
```

Esto:
- Define `project/` como directorio de salida
- Redirige `/` a `DESAFIO.dc.html`
- Agrega headers de seguridad (X-Frame-Options, X-Content-Type-Options, etc.)
- Configura cache para `support.js` (1 día) y challenge-bank (5 minutos)

---

## Solución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| La URL raíz muestra listado de archivos | Root Directory no configurado como `project` | Settings > General > Root Directory → `project` |
| Pantalla en blanco | Error de JS en consola | Abrir DevTools > Console > revisar el error |
| `CORS` al llamar a Apps Script | SCRIPT_URL incorrecto o Web App no pública | Verificar URL y configuración de acceso en Apps Script |
| Deploy falla | No aplica (no hay build) — revisar si hay archivos con rutas inválidas | Revisar logs de Vercel |
| Assets no cargan (404) | Ruta incorrecta en el HTML | Usar rutas relativas, no absolutas |
