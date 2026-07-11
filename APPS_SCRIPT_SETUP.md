# Configuración de Google Apps Script

Guía paso a paso para desplegar el backend (`Code.gs`) como Web App.

---

## 1. Crear el proyecto de Apps Script

1. Ve a [script.google.com](https://script.google.com)
2. Haz clic en **"Nuevo proyecto"**
3. Cambia el nombre del proyecto: haz clic en "Proyecto sin título" arriba a la izquierda → escribe **"Banco Maestro de Retos — Backend"**

---

## 2. Pegar el código

1. En el editor, borra el contenido del archivo `Code.gs` por defecto
2. Abre el archivo `project/Code.gs` de este repositorio
3. Copia todo el contenido y pégalo en el editor de Apps Script
4. Guarda con **Ctrl+S** (o ⌘+S en Mac)

---

## 3. Configurar Script Properties (secretos)

Las credenciales sensibles NO van en el código — van en las propiedades del script.

1. En el menú lateral izquierdo, haz clic en el ícono de engranaje ⚙️ (**"Configuración del proyecto"**)
2. Baja hasta la sección **"Propiedades de secuencia de comandos"**
3. Haz clic en **"Agregar propiedad"** y agrega estas tres:

   | Propiedad | Valor |
   |---|---|
   | `SPREADSHEET_ID` | El ID de tu Google Sheet (ver Paso 1 en `DEPLOY.md`) |
   | `ADMIN_TOKEN` | Una cadena secreta aleatoria (mín. 32 caracteres). Genera con: `openssl rand -hex 32` |
   | `ADMIN_EMAILS` | Emails admin separados por coma: `docente@upes.edu.sv,admin@upes.edu.sv` |

4. Haz clic en **"Guardar propiedades de secuencia de comandos"**

---

## 4. Inicializar las hojas de Google Sheets

1. En el editor de Apps Script, en el menú desplegable de funciones (junto al botón "Ejecutar"), selecciona **`initSheets`**
2. Haz clic en **"Ejecutar"**
3. La primera vez pedirá permisos — acepta todos los permisos de Google Sheets
4. Verifica en tu Google Sheet que se crearon 7 hojas:
   - `01_ESTUDIANTES`
   - `02_PROGRESO`
   - `03_INSIGNIAS`
   - `04_RANKING`
   - `05_EVENTOS`
   - `06_ANALITICA`
   - `07_RESPUESTAS`

---

## 5. Desplegar como Web App

1. Haz clic en **"Implementar"** (botón azul arriba a la derecha) → **"Nueva implementación"**
2. Haz clic en el ícono ⚙️ junto a "Seleccionar tipo" → selecciona **"Aplicación web"**
3. Configura:
   - **Descripción**: `v1.0-rc Piloto 2025`
   - **Ejecutar como**: `Yo (tu-email@gmail.com)`
   - **Quién tiene acceso**: **`Cualquier usuario`** (necesario para que el frontend pueda llamar al endpoint)
4. Haz clic en **"Implementar"**
5. La primera vez pedirá permisos adicionales — acepta
6. **Copia la URL** que aparece en el formato:
   ```
   https://script.google.com/macros/s/AKfycb[...]/exec
   ```

---

## 6. Pegar la URL en el frontend

Abre `project/api-client.js` y reemplaza la línea 19:

```javascript
// ANTES:
const SCRIPT_URL = 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec';

// DESPUÉS (ejemplo):
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbTuURLRealAqui/exec';
```

Guarda el archivo y haz commit + push.

---

## 7. Probar el endpoint

Abre la URL del Web App directamente en el navegador. Debes ver:
```json
{"ok":true,"version":"1.0-rc","message":"Banco Maestro de Retos API"}
```

Si ves un error, revisa:
- Que las Script Properties estén configuradas correctamente
- Que el `SPREADSHEET_ID` apunte a una sheet que el script tiene acceso

---

## 8. Re-desplegar cuando haya cambios

Si en el futuro modificas `Code.gs`:

1. **"Implementar"** → **"Administrar implementaciones"**
2. Haz clic en el ícono de edición (lápiz) de la implementación activa
3. En **"Versión"** selecciona **"Nueva versión"**
4. Agrega descripción del cambio y haz clic en **"Implementar"**

> **Importante:** La URL del Web App NO cambia al crear nueva versión. No necesitas actualizar `api-client.js` con cada re-deploy.

---

## Permisos requeridos

El script necesita acceso a:
- **Google Sheets** — lectura/escritura en la hoja del piloto
- **Google Drive** — solo si se usa la función de exportar backups (opcional)

Estos permisos se otorgan automáticamente al ejecutar `initSheets` la primera vez.

---

## Solución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| `"No autorizado"` al hacer registro | ADMIN_TOKEN o ADMIN_EMAILS vacíos | Verificar Script Properties |
| `"Hoja no encontrada"` | initSheets no ejecutado | Ejecutar initSheets manualmente |
| `CORS error` en el navegador | Web App no configurada como "Cualquier usuario" | Re-desplegar con el acceso correcto |
| `503 Service Unavailable` | Cuota de ejecución de Apps Script agotada | Esperar 1 minuto y reintentar |
| Datos no se guardan | SPREADSHEET_ID incorrecto | Verificar que el ID apunta a la Sheet correcta |
