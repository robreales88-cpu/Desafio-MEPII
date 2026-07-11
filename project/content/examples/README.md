# Ejemplos

Tres ejemplos por componente — **mínimo**, **intermedio** y **avanzado** — con contenido ficticio (herramientas cotidianas, frutas, figuras geométricas, un jardín encantado). Ninguno usa contenido académico real; son solo para mostrar la forma esperada del JSON en distintos niveles de completitud.

```
examples/
  matrix/{minimo,intermedio,avanzado}.json
  visual_memory/{minimo,intermedio,avanzado}.json
  drag_drop/{minimo,intermedio,avanzado}.json
  timeline/{minimo,intermedio,avanzado}.json
  case_card/{minimo,intermedio,avanzado}.json
  observation/{minimo,intermedio,avanzado}.json
  analogies/{minimo,intermedio,avanzado}.json
  escape_room/{minimo,intermedio,avanzado}.json
  instrument_selector/{minimo,intermedio,avanzado}.json
  protocol_review/{minimo,intermedio,avanzado}.json
  speed_challenge/{minimo,intermedio,avanzado}.json
  verbal_fluency/{minimo,intermedio,avanzado}.json
  visual_search/{minimo,intermedio,avanzado}.json
```

Diferencia entre niveles:
- **mínimo** — 1 pregunta, `componentConfig` con el mínimo de elementos necesarios, sin variantes.
- **intermedio** — 2 preguntas, `componentConfig` más completo.
- **avanzado** — 3 preguntas, `componentConfig` completo, listo como referencia para un microreto real.

Todos pasan `node content/sdk/validate.js content/examples/` sin errores — úsalos como referencia de "cómo se ve un archivo válido" si algo no queda claro en `CONTENT_GUIDE.md`.
