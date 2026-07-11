# Competencias

Organización del Banco Maestro **por habilidad entrenada**, complementaria a `challenge-bank/` (que organiza por semana). Esta carpeta no duplica contenido — cada competencia es solo un índice de referencias.

## Cómo crear una competencia nueva

1. Crea una carpeta con el nombre de la habilidad, en minúsculas y con guiones (ver convención de nombres en `CONTENT_GUIDE.md`, sección 9). Ejemplos: `memoria-visual/`, `razonamiento-abstracto/`, `atencion-selectiva/`, `observacion-clinica/`, `analisis-de-caso/`.
2. Dentro, un `README.md` corto con:
   - una línea describiendo la habilidad;
   - la lista de microretos que la entrenan, referenciados por `id` (ej. `w5m2`, `w12m1`) — nunca copies el JSON del microreto aquí, solo referencia su id.

## Por qué existe esta carpeta

Permite responder "¿cuántos retos de atención selectiva ya tenemos?" o "¿qué semanas cubren observación clínica?" sin tener que abrir las 18 semanas una por una. Es una herramienta de planeación para el equipo de contenido, no una fuente de verdad — la fuente de verdad de cada microreto siempre es su archivo en `challenge-bank/weekNN.json`.

Esta carpeta se deja vacía a propósito en esta entrega — el Content SDK prepara la infraestructura; el equipo de contenido decide cómo nombrar y agrupar las competencias reales.
