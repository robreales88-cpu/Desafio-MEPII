# Media

Assets reutilizables referenciados desde los JSON de contenido vía `svgRef`/`imageRef`.

- **`svg/`** — gráficos vectoriales (figuras del Matrix, iconos de proceso, patrones). Ver `CONTENT_GUIDE.md` sección 6.
- **`icons/`** — iconos rasterizados de instrumentos/herramientas. Ver `CONTENT_GUIDE.md` sección 7.
- **Raíz de `media/`** — imágenes PNG/JPG que no son iconos (protocolos escaneados, tarjetas de caso, capturas). Referéncialas como `"imageRef": "media/nombre-del-archivo.png"`.

Convención de nombres: minúsculas, guiones, sin espacios ni acentos en el nombre del archivo (ver `CONTENT_GUIDE.md` sección 9). `node content/sdk/validate.js` confirma que cada referencia mencionada en un JSON exista realmente aquí antes de cargar el contenido a Author Studio.
