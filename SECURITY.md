# Security Policy

## Versiones soportadas

| Versión | Soporte de seguridad |
|---------|---------------------|
| 1.0.x   | ✅ Activo            |
| < 1.0   | ❌ Sin soporte       |

## Reportar una vulnerabilidad

Si descubres una vulnerabilidad de seguridad, **no abras un issue público**.

Envía un reporte privado a: **roberto.reales@upes.edu.sv**

Incluye:
- Descripción clara de la vulnerabilidad
- Pasos para reproducirla
- Impacto potencial estimado
- Sugerencia de mitigación (opcional)

Recibirás respuesta en un máximo de **5 días hábiles**. Si la vulnerabilidad se confirma, se publicará un parche y se te acreditará en el CHANGELOG (salvo que prefieras anonimato).

## Modelo de seguridad

Este proyecto usa un stack estático + serverless:

### Frontend (Vercel, estático)
- Sin Node.js en runtime — no hay servidor que comprometer
- Sin cookies de sesión — autenticación por token efímero en `localStorage`
- Sin dependencias npm en producción — todas las librerías cargadas desde CDN en `support.js`
- Política de Content Security Policy recomendada en `vercel.json`

### Backend (Google Apps Script)
- El `SPREADSHEET_ID` y `ADMIN_TOKEN` son secretos de entorno — nunca se almacenan en el repositorio
- El script autentica cada petición admin y cada petición de estudiante con token de sesión
- `LockService` protege la escritura concurrente de XP
- Idempotencia por `requestId` previene el doble-envío de XP
- `MAX_XP_PER_EVENT` = 400 limita el impacto de cualquier manipulación del cliente

### Datos de estudiantes
- El sistema almacena únicamente: nombre, email institucional, XP acumulado, insignias obtenidas y respuestas por microreto
- No se almacenan contraseñas ni datos médicos/clínicos
- Los datos residen exclusivamente en la Google Sheet de la institución, bajo control del administrador

## Variables que NUNCA deben comprometerse

```
SPREADSHEET_ID   — ID de la hoja de Google Sheets
ADMIN_TOKEN      — Token compartido del panel docente
ADMIN_EMAILS     — Lista de emails de administradores
SCRIPT_URL       — URL del Web App de Google Apps Script
```

Estas variables se configuran en los Scripts Properties de Apps Script (backend) y en las Vercel Environment Variables (frontend). Ver `DEPLOY.md` para instrucciones detalladas.
