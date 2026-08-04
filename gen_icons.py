"""Genera los íconos PNG de la PWA a partir de formas simples (sin assets externos).
Ejecutar una sola vez: python gen_icons.py
"""

from PIL import Image, ImageDraw, ImageFont

BG = (15, 17, 21, 255)        # var(--bg)
ACCENT = (79, 140, 255, 255)  # var(--accent)
ACCENT2 = (47, 208, 138, 255) # var(--accent2)
TEXT = (230, 232, 236, 255)


def draw_icon(size, maskable=False):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    pad = int(size * 0.08) if maskable else 0
    d.rounded_rectangle([pad, pad, size - pad, size - pad],
                         radius=int(size * 0.22), fill=BG)

    # Círculo de acento
    margin = size * (0.20 if maskable else 0.14)
    d.ellipse([margin, margin, size - margin, size - margin],
              outline=ACCENT, width=max(2, size // 28))

    # Texto "Bs" centrado
    try:
        font = ImageFont.truetype("arialbd.ttf", int(size * 0.30))
    except Exception:
        font = ImageFont.load_default()
    text = "Bs"
    bbox = d.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text(((size - tw) / 2 - bbox[0], (size - th) / 2 - bbox[1] - size * 0.03),
           text, font=font, fill=TEXT)

    # Flecha doble (símbolo de conversión) abajo
    cy = size * 0.72
    cx = size / 2
    w = size * 0.16
    d.line([cx - w, cy, cx + w, cy], fill=ACCENT2, width=max(2, size // 30))
    d.polygon([(cx + w - size * 0.05, cy - size * 0.05),
               (cx + w + size * 0.05, cy),
               (cx + w - size * 0.05, cy + size * 0.05)], fill=ACCENT2)

    return img


for size, name, maskable in [
    (192, "icon-192.png", False),
    (512, "icon-512.png", False),
    (512, "icon-512-maskable.png", True),
]:
    draw_icon(size, maskable).save(f"icons/{name}")
    print("Generado", name)
