# Guía de Contenido — DESAFÍO: Método de Evaluación Psicológica II

Esta guía es para el equipo que construye el **Banco Maestro de Retos** (18 semanas, 54 microretos, variantes). No requiere tocar código — todo el contenido se produce como archivos JSON siguiendo las plantillas de `/content/plantillas/`.

**Antes de empezar, lee la sección "Qué ejecuta realmente la plataforma hoy"** — evita construir contenido que se vea perfecto en el papel pero no se pueda jugar todavía.

---

## 1. Qué ejecuta realmente la plataforma hoy (léelo primero)

La plataforma tiene 13 "componentes" visuales de interacción (Matrix, Visual Memory, Drag & Drop, Timeline, Case Card, Observation, Analogies, Escape Room, Instrument Selector, Protocol Review, Speed Challenge, Verbal Fluency, Visual Search), documentados y demostrados en `ComponentLibrary.dc.html`.

**De esos 13, hoy solo `Visual Memory` corre con su propio motor dedicado (`memory`).** Todos los demás — sin importar cuál "componente" los inspiró — se ejecutan actualmente como una pregunta de **opción múltiple genérica**: se muestra un texto, 2 a 4 opciones, y se compara la respuesta elegida contra `correctEs`/`correctEn`. Esto es una limitación real y conocida de la versión actual del motor (`challenge-engine.js`), congelada por decisión del proyecto — no es algo que este Content SDK resuelva ni deba resolver.

**Qué significa esto para ti, en la práctica:**

- Cada microreto que crees, **sin importar el componente que elijas como inspiración visual**, debe tener un arreglo `questions[]` completo y válido (texto, opciones, respuesta correcta, retroalimentación) — es lo único que el motor realmente ejecuta y califica hoy.
- El campo `componentConfig` de cada plantilla (grid de figuras del Matrix, salas del Escape Room, palabras válidas de Fluidez Verbal, etc.) es **información preparada para el futuro** — captura fielmente la interacción visual de ese componente para cuando el motor la soporte de forma nativa, pero **hoy no se ejecuta ni se muestra al estudiante**. Complétala igual (es información valiosa y no se pierde), pero nunca dejes `questions[]` vacío pensando que `componentConfig` "va a bastar".
- La única excepción real es `Visual Memory`: ahí sí existen `memorizeTime` e `items[]` como campos que el motor lee de verdad (además de `questions[]`).

Si mientras construyen contenido notan que esta limitación bloquea algo importante (por ejemplo, Verbal Fluency realmente necesita contar palabras escritas, no elegir una opción), avisen al Arquitecto Técnico — conectar un componente nuevo al motor es un cambio de arquitectura y requiere una decisión explícita, no algo que el equipo de contenido deba resolver por su cuenta.

### Tabla de tipos (`type`) por componente

| Componente | `type` a usar | ¿Aparece en el dropdown del Editor de Author Studio? |
|---|---|---|
| Matrix | `reasoning` | Sí |
| Visual Memory | `memory` | Sí |
| Drag & Drop | `classification` | Sí |
| Timeline | `reasoning` | Sí (sin módulo dedicado de ordenamiento) |
| Case Card | `case_analysis` | Sí |
| Observation | `observation` | Sí |
| Analogies | `analogy` | Sí |
| Escape Room | `escape_room` | Sí |
| Instrument Selector | `instrument_selection` | No — el motor lo reconoce, pero hay que escribirlo directamente en el JSON (el dropdown del Editor no lo lista todavía) |
| Protocol Review | `protocol_review` | Sí |
| Speed Challenge | `reaction` | Sí |
| Verbal Fluency | `verbal_fluency` | Sí |
| Visual Search | `visual_search` | No — mismo caso que Instrument Selector |

---

## 2. Estructura de un reto (semana)

Un **reto** = una semana = un archivo `weekNN.json`. Contiene metadatos generales y 3 **microretos**.

```json
{
  "week": 5,
  "titleEs": "Nombre del desafío",
  "titleEn": "Challenge name",
  "type": "analogy",
  "skillEs": "Habilidad principal que entrena",
  "skillEn": "Main skill trained",
  "descEs": "Descripción breve para el estudiante.",
  "descEn": "Short description for the student.",
  "microretos": [ /* exactamente 3 microretos — ver sección 3 */ ]
}
```

Campos obligatorios: `week` (entero, único, 1–18), `titleEs`, `type`, `skillEs`, `microretos` (arreglo de exactamente 3). El validador (sección 6) los revisa automáticamente.

## 3. Estructura de un microreto

Cada microreto vive dentro de `microretos[]` de su reto. Usa la plantilla de tu componente en `/content/plantillas/` como punto de partida — ya trae todos los campos, vacíos.

Campos obligatorios de todo microreto:

| Campo | Tipo | Notas |
|---|---|---|
| `id` | string | único dentro del banco, ver convención de nombres (sección 8) |
| `type` | string | uno de la tabla de la sección 1 |
| `titleEs` / `titleEn` | string | título visible del microreto |
| `difficulty` | `"basic"` \| `"intermediate"` \| `"advanced"` | |
| `answerTime` | número (segundos) | tiempo para responder; 5–120 |
| `memorizeTime` | número (segundos) | **solo** si `type === "memory"** |
| `maxAttempts` | número | normalmente `3` (regla del juego: 3 intentos, luego bloqueo permanente) |
| `xp.base` | número | XP por respuesta correcta |
| `xp.speedMax` | número | bono máximo por velocidad |
| `xp.perfectBonus` | número | bono por acertar todas las preguntas del microreto |
| `xp.challengeComplete` | número | bono por completar las 3 microretos de la semana (normalmente igual en los 3 microretos de una misma semana) |
| `questions` | arreglo | ver sección 5 — **nunca vacío** |

Opcionales: `badge` (id de una insignia existente si este microreto la otorga), `tags` (arreglo de strings para clasificar por habilidad/dificultad/competencia), `items` (solo `memory`), `componentConfig` (ver sección 1), `variants` (ver sección 4).

## 4. Cómo agregar variantes

Cada microreto puede tener un arreglo `variants[]` — versiones alternas del mismo microreto con preguntas distintas, para rotación. Se editan visualmente desde **Author Studio → Variantes** (seleccionando primero el microreto en Biblioteca): crear, duplicar, editar, reordenar y eliminar ya están disponibles ahí, no hace falta escribir el JSON a mano.

Si prefieres escribirlas directamente en el archivo, cada variante tiene esta forma:

```json
{
  "id": "v1",
  "titleEs": "Variante 1",
  "titleEn": "",
  "questions": [ /* mismo formato que las preguntas del microreto principal */ ]
}
```

**Importante:** al día de hoy el motor **siempre ejecuta el `questions[]` principal del microreto**, nunca elige una variante al azar en tiempo de juego — eso requiere un cambio al Challenge Engine que está fuera de esta etapa del proyecto. Las variantes que construyan hoy quedan guardadas y listas, pero no rotan automáticamente todavía. Constrúyanlas igual si el plan de contenido las necesita — no se pierde el trabajo — pero no asuman que ya están en producción.

## 5. Cómo crear retroalimentación

Cada pregunta dentro de `questions[]` tiene esta forma:

```json
{
  "id": "q1",
  "textEs": "¿Pregunta en español?",
  "textEn": "Question in English?",
  "options": ["Opción A", "Opción B", "Opción C", "Opción D"],
  "correctEs": "Opción B",
  "correctEn": "Option B",
  "skillEs": "Habilidad puntual que ejercita esta pregunta",
  "skillEn": "Specific skill this question exercises",
  "explanEs": "Explicación de por qué esa es la respuesta correcta.",
  "explanEn": "Explanation of why that is the correct answer."
}
```

Reglas:
- `correctEs` debe ser **exactamente igual** (carácter por carácter) a una de las cadenas en `options` — si no coincide exactamente, el motor nunca podrá marcar la respuesta como correcta. El validador (sección 6) detecta esto.
- No repitas el mismo texto en dos opciones de la misma pregunta — si dos opciones son idénticas, la marca de "correcta" se vuelve ambigua en el Editor de Author Studio (comportamiento conocido y documentado, no se resuelve en esta etapa).
- `explanEs` es obligatorio y no debe ser genérico ("correcto"/"incorrecto") — la especificación del producto exige que la retroalimentación explique **qué habilidad se entrenó**, no solo si acertaste.
- Evita que dos preguntas del mismo microreto compartan `id`.

## 6. Cómo agregar SVG

- Coloca el archivo `.svg` en `/content/media/svg/`.
- Nombra el archivo en minúsculas, con guiones (`figura-triangulo-verde.svg`, no `Figura Triángulo Verde.svg`).
- Referéncialo desde el JSON con una ruta relativa a `media/svg/`, por ejemplo: `"svgRef": "media/svg/figura-triangulo-verde.svg"`.
- El validador confirma que todo `svgRef`/`imageRef` mencionado en un JSON exista realmente en disco — un microreto con una referencia rota no pasa la validación.
- Mantén los SVG simples (formas, iconos) — nada de imágenes fotográficas incrustadas como SVG.

## 7. Cómo agregar imágenes (PNG/JPG)

- Colócalas directamente en `/content/media/` (protocolos, tarjetas de caso, capturas) o en `/content/media/icons/` (iconos rasterizados de instrumentos).
- Mismo criterio de nombres que los SVG: minúsculas, guiones, sin espacios ni acentos en el nombre de archivo (los acentos sí van dentro del contenido del JSON, nunca en el nombre del archivo).
- Referéncialas igual que un SVG, con ruta relativa: `"imageRef": "media/protocolo-caso-04.png"`.
- Optimiza el peso antes de subir (no se necesita una imagen de 5MB para un ícono de 40×40).

## 8. Cómo organizar competencias

`/content/competencias/` organiza el contenido por la habilidad que entrena, no por semana — es la vista "por tema" que complementa la vista "por semana" de `challenge-bank/`. Cada competencia es una carpeta:

```
/content/competencias/
  memoria-visual/
  razonamiento-abstracto/
  atencion-selectiva/
  observacion-clinica/
  analisis-de-caso/
  ...
```

Dentro de cada carpeta de competencia, un archivo `README.md` corto describe qué habilidad cubre y qué semanas/microretos la usan (una lista de referencias a `week05m2`, por ejemplo — no dupliques el JSON, solo referencia el id). Esto le da al equipo de contenido una forma de planear cobertura ("¿ya tenemos suficientes retos de atención selectiva?") sin tener que abrir las 18 semanas una por una.

## 9. Cómo nombrar archivos

| Elemento | Convención | Ejemplo |
|---|---|---|
| Archivo de semana | `weekNN.json` (NN con dos dígitos) | `week07.json` |
| Id de microreto | `w{semana}m{microreto}` | `w7m2` |
| Id de pregunta | `q{n}` dentro de su microreto | `q3` |
| Id de variante | `v{n}` dentro de su microreto | `v2` |
| Archivo SVG/imagen | minúsculas, guiones, sin acentos ni espacios | `matriz-patron-03.svg` |
| Carpeta de competencia | minúsculas, guiones | `razonamiento-abstracto/` |

## 10. Buenas prácticas

- **Nunca dejes `explanEs` vacío** — es lo que convierte una pregunta de opción múltiple en una experiencia de entrenamiento real (spec del producto, sección 13: "no solo indicar si la respuesta fue correcta").
- **Varía las opciones correctas** — no pongas siempre la respuesta correcta en la misma posición (A, B, C o D); revisa esto al terminar cada microreto.
- **No dupliques preguntas entre semanas** distintas salvo que sea intencional (variantes explícitas).
- **Usa el validador antes de cargar a Author Studio** — te ahorra un viaje de ida y vuelta si falta un campo o una imagen.
- **Genera el archivo base con el generador** (sección 12) en vez de copiar y pegar un microreto existente — copiar y pegar es la fuente más común de ids duplicados.
- **Completa `componentConfig` igual, aunque no se ejecute todavía** — es trabajo real que no se pierde, y evita que alguien tenga que reconstruirlo desde cero el día que el motor lo soporte.
- **No mezcles idiomas dentro del mismo campo** (`textEs` en español, `textEn` en inglés — nunca al revés ni mezclado).
- **Cuidado con timers muy cortos** en microretos de dificultad `basic` — revisa que `answerTime` sea razonable para el número de opciones y la longitud del texto.

## 11. Estructura de carpetas de este SDK

```
/content
  /competencias    → organización de contenido por habilidad (ver sección 8)
  /plantillas      → 13 plantillas JSON vacías, una por componente
  /media
    /svg           → gráficos vectoriales reutilizables
    /icons         → iconos rasterizados
  /examples        → 3 ejemplos ficticios por componente (mínimo/intermedio/avanzado)
  /docs            → esta guía
  /sdk             → validate.js y generate.js (ver secciones 12–13)
```

## 12. Cómo generar un archivo base (sin escribir contenido a mano)

```bash
node content/sdk/generate.js --component analogies --week 7 --microreto 2 --out content/borradores/w7m2.json
```

Esto copia la plantilla de `analogies`, llena automáticamente `id`, referencias de semana/microreto y deja **todos los campos de contenido vacíos** — nunca genera preguntas, respuestas ni texto pedagógico. Ejecuta `node content/sdk/generate.js --help` para ver todas las opciones (lista de componentes válidos, flags disponibles).

## 13. Cómo validar antes de cargar a Author Studio

```bash
node content/sdk/validate.js content/examples/analogies/avanzado.json
node content/sdk/validate.js challenge-bank/week05.json
node content/sdk/validate.js content/borradores/          # valida una carpeta completa
```

El validador revisa (ver detalle completo en el propio script):
- campos obligatorios presentes en el reto y en cada microreto;
- estructura general del JSON (tipos correctos, arreglos donde se esperan arreglos);
- que cada `svgRef`/`imageRef` mencionado exista realmente en `/content/media/`;
- que `answerTime`/`memorizeTime` estén en rangos razonables;
- que `correctEs`/`correctEn` de cada pregunta coincida exactamente con una de sus `options`;
- que `type` sea uno de los valores reconocidos por el motor (tabla de la sección 1).

Un archivo con errores se lista con el número de línea/campo aproximado y una descripción del problema — corrígelo antes de subirlo a Author Studio.

---

*Esta guía cubre la infraestructura de contenido (Content SDK). No describe cómo desplegar la plataforma ni cómo configurar el backend — eso lo cubre el Arquitecto Técnico en la fase de despliegue.*
