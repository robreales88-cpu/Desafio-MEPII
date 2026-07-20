# DATA-01 — Migración Inteligente y Consolidación de Estudiantes

**Sprint:** DATA-01  
**Fecha de planificación:** 2026-07-20  
**Script:** `MIGRACION_DATA01.gs` (ejecutar desde el editor de Apps Script)

---

## Contexto

La plataforma se encuentra en producción con aproximadamente 40 estudiantes reales.
Durante las primeras semanas algunos estudiantes ingresaron desde diferentes dispositivos
con el mismo correo electrónico, generando filas duplicadas en `01_ESTUDIANTES`.

---

## Identidad única

| Identificador | ¿Usado? | Motivo |
|---|---|---|
| `email.trim().toLowerCase()` | **Sí** | Permanente, único por persona |
| Nombre | No | Dos estudiantes pueden llamarse igual |
| Nickname | No | Puede cambiar o repetirse |
| Token | No | Representa sesión, no identidad |

---

## Proceso (transacción lógica)

| Paso | Descripción |
|---|---|
| 1 | Crear respaldos `BACKUP_YYYY-MM-DD_XX_nombre` (idempotente) |
| 2 | Cargar y agrupar ESTUDIANTES por correo normalizado |
| 3 | Consolidar: PROGRESO, INSIGNIAS, EVENTOS, XP |
| 4 | Validar antes de escribir |
| 5 | Aplicar actualizaciones a fila primaria |
| 6 | Eliminar filas duplicadas (de abajo hacia arriba) |
| 7 | Reconstruir RANKING y ANALÍTICA |
| 8 | Validar post-migración |
| 9 | Generar informe en hoja `DATA01_REPORTE_YYYY-MM-DD` |

Si cualquier paso detecta inconsistencias que puedan provocar pérdida de datos,
la migración se detiene y no modifica ningún dato.

---

## Reglas de consolidación

### XP
1. Recalcular desde el historial consolidado de microretos (suma de XP por microreto, tomando siempre el mejor intento).
2. Si no hay historial de progreso, conservar el mayor XP entre duplicados.
3. **Nunca sumar** XP de registros distintos del mismo estudiante.

### PROGRESO (02_PROGRESO)
- Por cada par `(Semana, Microreto)`: conservar el intento con **mayor XP**.
- Empate en XP: conservar el más **reciente** (por campo `Fecha`).
- No se pierde ningún desafío completado.

### INSIGNIAS (03_INSIGNIAS)
- Por cada `(estudiante, insignia)`: conservar la **más antigua** (primera vez otorgada).
- No se pierde ninguna insignia válida.

### EVENTOS (05_EVENTOS)
- Conservar **todo el historial**.
- Eliminar únicamente eventos con los cinco campos idénticos.

### Token
- Se conserva el token de la fila con **UltimoAcceso más reciente** (fila primaria).
- Todas las demás filas se eliminan, invalidando sus tokens implícitamente.

### Perfil (01_ESTUDIANTES)
- `FechaRegistro`: la más **antigua** entre duplicados.
- `Estado`: `activo` si alguna fila era activa; de lo contrario, el de la primaria.
- `Nombre`, `Nickname`, `Avatar`, `Grupo`, `Seccion`: los de la fila **primaria**.

---

## Respaldos creados

Formato: `BACKUP_{fecha}_{clave}_{nombre_hoja}`

| Hoja | Nombre del respaldo |
|---|---|
| 01_ESTUDIANTES | `BACKUP_2026-07-20_01_01_ESTUDIANTES` |
| 02_PROGRESO    | `BACKUP_2026-07-20_02_02_PROGRESO`    |
| 03_INSIGNIAS   | `BACKUP_2026-07-20_03_03_INSIGNIAS`   |
| 04_RANKING     | `BACKUP_2026-07-20_04_04_RANKING`     |
| 05_EVENTOS     | `BACKUP_2026-07-20_05_05_EVENTOS`     |
| 06_ANALITICA   | `BACKUP_2026-07-20_06_06_ANALITICA`   |
| 08_CALENDARIO  | `BACKUP_2026-07-20_08_08_CALENDARIO`  |

---

## Resultados de ejecución

> Esta sección se completa después de ejecutar `migracionEstudiantes()` desde el editor de Apps Script.
> Los valores exactos se generan en la hoja `DATA01_REPORTE_2026-07-20`.

| Métrica | Valor |
|---|---|
| Estudiantes analizados | — |
| Correos únicos | — |
| Duplicados encontrados | — |
| Perfiles consolidados | — |
| Registros eliminados (ESTUDIANTES) | — |
| Registros eliminados (PROGRESO) | — |
| Registros eliminados (INSIGNIAS) | — |
| Registros eliminados (EVENTOS) | — |
| XP recuperado | — |
| Desafíos recuperados | — |
| Microretos recuperados | — |
| Insignias recuperadas | — |
| Eventos recuperados | — |

---

## Validaciones ejecutadas

- [ ] Cada correo aparece exactamente una vez en `01_ESTUDIANTES`
- [ ] Sin registros huérfanos en `02_PROGRESO`
- [ ] Sin registros huérfanos en `03_INSIGNIAS`
- [ ] Sin microretos `(correo, semana, microreto)` duplicados en `02_PROGRESO`
- [ ] Sin insignias `(correo, insignia)` duplicadas en `03_INSIGNIAS`
- [ ] RANKING reconstruido desde datos consolidados
- [ ] ANALÍTICA reconstruida desde datos consolidados

---

## Inconsistencias encontradas

> Completar después de la ejecución. El script detiene la migración y reporta cualquier
> inconsistencia que pueda provocar pérdida de información.

Ninguna detectada en planificación.

---

## Confirmación de integridad de datos

> Completar después de la ejecución.

**Estado:** Pendiente de ejecución.

---

## Notas de idempotencia

La migración es segura de ejecutar múltiples veces:

- **Respaldos:** si `BACKUP_2026-07-20_XX_...` ya existe, se omite (no se sobreescribe ni se duplica).
- **Consolidación:** si no existen duplicados al segundo intento, el script genera solo el informe de validación y termina sin modificar datos.
- **Resultado:** ejecutar dos veces produce el mismo estado final que ejecutar una vez.
