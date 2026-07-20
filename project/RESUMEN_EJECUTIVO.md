# RESUMEN EJECUTIVO — Auditoría de Integridad de la Plataforma

**Fecha:** 2026-07-20  
**Auditado por:** Revisión técnica AUDIT-01, previa a migración DATA-01

---

## Estado general

La plataforma funciona correctamente en condiciones de uso normal (estudiantes usando el navegador). Se identificó un **hallazgo crítico** en el backend que permite, en teoría, que un estudiante técnicamente hábil registre progreso fuera del calendario académico. No hay evidencia de que esto haya ocurrido, pero debe verificarse antes de ejecutar la migración.

---

## Hallazgos principales

### CRÍTICO — Sin validación de calendario en el backend

`guardarProgreso()` y `guardarXP()` (Code.gs) aceptan registros para cualquier semana sin verificar `08_CALENDARIO`. El bloqueo de semanas es **solo frontend**. Un estudiante que llame la API directamente puede completar semanas no habilitadas.

**Impacto real:** Solo afecta a quien tenga conocimiento técnico para hacer llamadas HTTP directas al endpoint de Apps Script. La mayoría de los estudiantes no tienen este conocimiento ni motivación.

**Corrección disponible en:** `REPORTE_CORRECCIONES.md` — Sección C1.

---

### MODERADO — XP incremental sin recálculo

`guardarXP()` suma XP al total existente en lugar de recalcular desde cero. Si un estudiante llama la función dos veces (fuera de la ventana de 6 horas de deduplicación), el XP se acreditaría dos veces. El frontend previene esto para uso normal.

---

### VERIFICADO Y CORRECTO

- **Calendario:** lógica de `parseSVDate()` correcta para UTC−6 (El Salvador, sin DST)
- **Autenticación:** email + token requeridos en todas las rutas mutantes
- **Anticoncurrencia:** `LockService` en `guardarXP()` previene race conditions
- **Insignias:** deduplicadas por query explícita — no hay duplicados posibles
- **Replay de microretos:** `wasAlreadyCompleted` previene doble XP en reanudaciones
- **XP máximo:** techo de 400 XP por evento aplicado en backend
- **Idempotencia:** ventana de 6 horas activa para `guardarProgreso` y `guardarXP`
- **Recuperación de sesión:** reconstruye correctamente desde el historial de PROGRESO

---

## Pasos antes de ejecutar DATA-01

1. **Ejecutar `auditarIntegridad()`** (AUDITORIA_DATA01.gs) desde el editor de Apps Script.
   - Revisa si hay registros de progreso fuera de ventana de calendario
   - Revisa si hay estudiantes que excedan los límites académicos actuales (9 microretos / 6 desafíos)
   - Revisa consistencia de XP

2. **Revisar la hoja `AUDITORIA_2026-07-20`** generada por el script.
   - Si hay alertas de tipo `FUERA_DE_VENTANA` o `EXCEDE_LIMITE_*`: investigar causa antes de continuar.
   - Si no hay alertas: los datos son íntegros y se puede proceder con DATA-01.

3. **Implementar C1** (validación de calendario en backend) después de la migración, en el sprint siguiente.

4. **Ejecutar `migracionEstudiantes()`** (MIGRACION_DATA01.gs) solo cuando los pasos anteriores estén completados.

---

## Archivos generados en esta auditoría

| Archivo | Descripción |
|---|---|
| `AUDITORIA_INTEGRIDAD_PLATAFORMA.md` | Análisis técnico completo — un hallazgo por componente |
| `AUDITORIA_DATA01.gs` | Script de Apps Script para verificar los datos actuales en el spreadsheet |
| `REPORTE_CORRECCIONES.md` | Correcciones propuestas con código y procedimientos |
| `RESUMEN_EJECUTIVO.md` | Este documento |
