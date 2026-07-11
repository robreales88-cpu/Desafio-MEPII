# Content SDK — DESAFÍO

Infraestructura para construir el Banco Maestro de Retos (18 semanas, 54 microretos, variantes) sin volver a tocar el código de la plataforma.

**Empieza aquí:** [`docs/CONTENT_GUIDE.md`](docs/CONTENT_GUIDE.md) — explica cómo crear un reto, un microreto, variantes, retroalimentación, SVG/imágenes, organización por competencia y convenciones de nombres. Léela antes de escribir el primer archivo.

## Estructura

| Carpeta | Contenido |
|---|---|
| `plantillas/` | 13 plantillas JSON vacías, una por componente interactivo existente |
| `examples/` | 3 ejemplos ficticios por componente (mínimo / intermedio / avanzado) — contenido de muestra, no académico |
| `competencias/` | Organización del banco por habilidad entrenada (vista complementaria a `challenge-bank/`, que organiza por semana) |
| `media/svg/`, `media/icons/`, `media/` | Assets reutilizables referenciados desde los JSON (`svgRef`, `imageRef`) |
| `docs/` | `CONTENT_GUIDE.md` |
| `sdk/` | `validate.js` (validador) y `generate.js` (generador de archivos base) |

## Uso rápido

```bash
# Generar un archivo base para un microreto nuevo (sin contenido)
node content/sdk/generate.js --component analogies --week 7 --microreto 2 --out content/borradores/w7m2.json

# Validar antes de cargar a Author Studio
node content/sdk/validate.js content/borradores/w7m2.json
```

Este SDK no genera contenido pedagógico (preguntas, respuestas, competencias) — solo la estructura, la documentación y las herramientas para construirlo de forma consistente. La producción de contenido académico es responsabilidad del equipo de contenido.
