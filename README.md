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

## Archivo único para descargar

`dist/conversor-ve.html` es la app completa en **un solo archivo HTML**
(estilos, código, Chart.js e ícono incrustados). Se abre con doble clic en
cualquier navegador, sin servidor; solo no incluye el modo offline del
service worker. Para regenerarlo tras cambiar el código:

```bash
python build_standalone.py
```

## Funciones

- 🧹 **Limpiar**: borra todos los montos (también con la tecla `Esc`).
- 📋 **Copiar** en cada moneda: copia el monto, la tasa y su equivalente en Bs.
- La zona de montos tiene fondo y tipografía propios; el monto que escribes
  queda resaltado y los calculados se ven atenuados.
- **Historial diario automático**: al abrir la app (y cada 30 min mientras
  esté abierta, al volver a ella o al recuperar conexión) se consultan las
  tasas si todavía no hay un registro automático del día.

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
