# Guía de Contribución

Gracias por tu interés en contribuir a este proyecto. Esta guía aplica para el equipo interno de UPES durante el período del piloto.

## Arquitectura congelada

**La arquitectura de la plataforma está congelada en v1.0-rc.** No se aceptan contribuciones que modifiquen:

- `support.js` (generado por Claude Design — no editar)
- `challenge-engine.js` y sus módulos (`modules/`)
- `event-bus.js`
- `DESAFIO.dc.html` (navegación, gamificación, flujo de registro)
- `AdminPanel.dc.html`, `AuthorStudio.dc.html`, `ComponentLibrary.dc.html`
- `Code.gs` (backend)
- `api-client.js`
- Identidad visual y diseño de UI

## Lo que sí se puede contribuir

- **Contenido del Banco Maestro**: archivos JSON en `challenge-bank/weekNN.json`
- **Nuevas plantillas de componentes**: en `content/plantillas/`
- **Nuevos ejemplos**: en `content/examples/`
- **Documentación de competencias**: en `content/competencias/`
- **Assets de media**: SVGs en `content/media/svg/`, iconos en `content/media/icons/`
- **Correcciones de documentación**: cualquier archivo `.md`
- **Correcciones críticas de seguridad** (ver proceso abajo)

## Proceso para contenido (flujo normal)

1. Crea una rama desde `main`:
   ```bash
   git checkout -b contenido/semana-NN-nombre
   ```

2. Genera el microreto con el SDK:
   ```bash
   node content/sdk/generate.js --component matrix --week 5 --microreto 1
   ```

3. Edita el JSON generado con el contenido real.

4. Valida antes de hacer commit:
   ```bash
   node content/sdk/validate.js content/challenge-bank/week05.json
   ```
   El validador debe salir con código 0 (sin errores).

5. Haz commit con un mensaje descriptivo:
   ```bash
   git commit -m "contenido: semana 5 microreto 1 - memoria visual de instrumentos"
   ```

6. Abre un Pull Request hacia `main`.

## Proceso para correcciones críticas

Si detectas un bug crítico de seguridad o funcionalidad:

1. Abre un issue describiendo el problema (sin revelar detalles sensibles en público si es seguridad — ver `SECURITY.md`)
2. El responsable técnico revisa y aprueba la corrección antes de que se implemente
3. Las correcciones van en ramas `fix/descripcion-breve`

## Estilo de commits

Prefijos estándar:
- `contenido:` — nuevos microretos o ediciones de JSON
- `docs:` — cambios en documentación
- `fix:` — correcciones de bugs
- `media:` — nuevos assets (SVG, iconos, imágenes)

## Validación previa al merge

Todo PR debe pasar:
```bash
node content/sdk/validate.js content/challenge-bank/
node content/sdk/validate.js content/examples/
```

Sin errores (warnings son aceptables si están documentados).

## Código de conducta

Ver `CODE_OF_CONDUCT.md`.
