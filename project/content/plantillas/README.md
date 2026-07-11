# Plantillas

Una plantilla JSON vacía por cada componente interactivo existente en la plataforma (ver `ComponentLibrary.dc.html`). Todos los campos están presentes pero vacíos (`""`, `null`, `[]`) — no contienen preguntas, respuestas ni ningún contenido académico.

| Archivo | Componente | `type` (motor) |
|---|---|---|
| `matrix.template.json` | Matrix | `reasoning` |
| `visual_memory.template.json` | Visual Memory | `memory` |
| `drag_drop.template.json` | Drag & Drop | `classification` |
| `timeline.template.json` | Timeline | `reasoning` |
| `case_card.template.json` | Case Card | `case_analysis` |
| `observation.template.json` | Observation | `observation` |
| `analogies.template.json` | Analogies | `analogy` |
| `escape_room.template.json` | Escape Room | `escape_room` |
| `instrument_selector.template.json` | Instrument Selector | `instrument_selection` |
| `protocol_review.template.json` | Protocol Review | `protocol_review` |
| `speed_challenge.template.json` | Speed Challenge | `reaction` |
| `verbal_fluency.template.json` | Verbal Fluency | `verbal_fluency` |
| `visual_search.template.json` | Visual Search | `visual_search` |

Cada plantilla trae dos partes:
- **`componentConfig`** — la interacción visual propia de ese componente (figuras del Matrix, salas del Escape Room, palabras válidas de Verbal Fluency…). Informativo/preparado para el futuro; el motor actual todavía no lo ejecuta.
- **`questions[]`** — el formato de opción múltiple que el motor SÍ ejecuta hoy, sin importar el componente. Siempre debe completarse para que el microreto sea jugable en la versión actual.

No copies y pegues estas plantillas directamente para crear contenido nuevo — usa `node content/sdk/generate.js` (ver `/content/docs/CONTENT_GUIDE.md`, sección 12), que además asigna los identificadores correctos y evita ids duplicados.
