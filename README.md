# Conversor de Monedas VE — versión standalone (PWA / APK)

Esta es la versión **100% independiente** del [Conversor de Monedas VE](../README.md):
no necesita ningún servidor propio ni que tu PC esté prendida. Corre entera en
el navegador (o dentro del APK instalado en Android) y consulta las tasas
directo desde las APIs públicas.

- Las tasas y el historial se guardan en el propio dispositivo (`localStorage`),
  no en la nube ni en esta carpeta.
- Funciona sin internet para consultar/convertir con los últimos valores
  guardados; para traer tasas **nuevas** sí necesita conexión.
- Es una [PWA](https://web.dev/progressive-web-apps/) instalable: se puede
  empaquetar como APK de Android con [PWABuilder](https://www.pwabuilder.com/)
  una vez publicada en una URL pública (ver instrucciones en el README
  principal del proyecto).

## Probar en local

No requiere instalar nada especial, solo un servidor estático (para que el
service worker y el manifest funcionen; abrir el `index.html` con doble clic
no es suficiente porque los navegadores restringen `fetch` y `serviceWorker`
en `file://`):

```bash
python -m http.server 5500
```

Y abre `http://localhost:5500` en el navegador.

## Regenerar los íconos

Los íconos (`icons/*.png`) se generan con Pillow, sin depender de ningún
diseño externo:

```bash
python gen_icons.py
```

## Estructura

```
conversor-ve-pwa/
├── index.html
├── style.css
├── app.js              Toda la lógica: fetch a las APIs, conversión, localStorage
├── manifest.json        Metadatos de la PWA (nombre, íconos, colores)
├── service-worker.js    Cachea la app para que abra sin internet
├── icons/                Íconos generados con gen_icons.py
└── vendor/
    └── chart.umd.min.js  Chart.js empaquetado localmente (sin depender de un CDN)
```
