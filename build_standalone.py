"""Genera dist/conversor-ve.html: un único archivo HTML autocontenido
(CSS, JS, Chart.js e ícono incrustados) que se abre en cualquier navegador
sin servidor. Uso: python build_standalone.py"""
import base64
import os
import re

RAIZ = os.path.dirname(os.path.abspath(__file__))


def leer(ruta):
    with open(os.path.join(RAIZ, ruta), encoding="utf-8") as f:
        return f.read()


def script_seguro(js):
    # Evita que un "</script" dentro del código cierre la etiqueta antes de tiempo.
    return js.replace("</script", "<\\/script")


html = leer("index.html")
css = leer("style.css")
app = leer("app.js")
chart = leer("vendor/chart.umd.min.js")
with open(os.path.join(RAIZ, "icons/icon-192.png"), "rb") as f:
    icono = "data:image/png;base64," + base64.b64encode(f.read()).decode()

html = html.replace('<link rel="manifest" href="manifest.json">\n', "")
html = re.sub(r'href="icons/icon-192\.png"', f'href="{icono}"', html)
html = html.replace('<link rel="stylesheet" href="style.css">', f"<style>\n{css}\n</style>")
html = html.replace(
    '<script src="vendor/chart.umd.min.js"></script>',
    f"<script>\n{script_seguro(chart)}\n</script>",
)
html = html.replace('<script src="app.js"></script>', f"<script>\n{script_seguro(app)}\n</script>")

os.makedirs(os.path.join(RAIZ, "dist"), exist_ok=True)
salida = os.path.join(RAIZ, "dist", "conversor-ve.html")
with open(salida, "w", encoding="utf-8") as f:
    f.write(html)
print("Generado:", salida, f"({os.path.getsize(salida) // 1024} KB)")
