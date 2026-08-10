"""Guarda cosa la pipeline fa alla foto PRIMA di accusare il modello.

La ricerca del 10 agosto 2026 indica due sospetti a monte del generatore:
il ritaglio centrale al rapporto 3:4 dentro CatVTON, e la maschera dilatata
due volte con un kernel da 9. Questo script li rende visibili invece che
ipotetici: salva il ritaglio, la maschera sovrapposta in rosso, e misura
quanta foto viene buttata via.

    .venv/bin/python diagnosi_pipeline.py ../web/person_sample.jpg
"""
import os
import sys

CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".hf-cache")
os.environ.setdefault("HF_HOME", CACHE)

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "CatVTON"))
from utils import resize_and_crop  # noqa: E402
from mask_from_person import garment_mask, CATEGORY_CLASSES  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "outputs", "diagnosi")


def rosso_su(foto: Image.Image, maschera: Image.Image, forza: float = 0.55) -> Image.Image:
    """La maschera sovrapposta in rosso: e' l'unico modo di vedere se e' gonfia."""
    base = foto.convert("RGB")
    velo = Image.new("RGB", base.size, (214, 66, 48))
    a = maschera.convert("L").point(lambda v: int(v * forza))
    return Image.composite(velo, base, a).convert("RGB")


def bbox_maschera(maschera: Image.Image):
    m = np.array(maschera.convert("L")) > 127
    if not m.any():
        return None
    ys, xs = np.where(m)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def main(path: str, categoria: str = "upper"):
    os.makedirs(OUT, exist_ok=True)
    foto = Image.open(path).convert("RGB")
    W, H = foto.size
    print(f"foto            {W}x{H}  rapporto {W/H:.3f}")

    # --- sospetto 1: il ritaglio centrale 3:4 ------------------------------
    for nome, (tw, th) in [("fast", (384, 512)), ("balanced", (576, 768)), ("high", (768, 1024))]:
        target = tw / th
        if W / H < target:
            nw, nh = W, W * th // tw
        else:
            nh, nw = H, H * tw // th
        persi = 100 * (1 - (nw * nh) / (W * H))
        print(f"  {nome:9s} ritaglio {nw}x{nh}, butta via {persi:5.1f}% della foto")
    ritagliata = resize_and_crop(foto, (384, 512))
    ritagliata.save(f"{OUT}/1-ritaglio-384x512.png")

    # --- sospetto 2: la maschera -------------------------------------------
    grezza = garment_mask(foto, categoria, dilate=0)
    for giri in (0, 1, 2, 3):
        m = grezza
        for _ in range(giri):
            m = m.filter(ImageFilter.MaxFilter(9))
        area = 100 * (np.array(m) > 127).mean()
        bb = bbox_maschera(m)
        largo = (bb[2] - bb[0]) / W * 100 if bb else 0
        alto = (bb[3] - bb[1]) / H * 100 if bb else 0
        print(f"  dilate={giri}  area {area:5.1f}% della foto, riquadro {largo:.0f}%x{alto:.0f}%")
        rosso_su(foto, m).save(f"{OUT}/2-maschera-dilate{giri}.png")

    # --- quanto guadagnerebbe il ritaglio stretto ---------------------------
    bb = bbox_maschera(grezza.filter(ImageFilter.MaxFilter(9)))
    if bb:
        x0, y0, x1, y1 = bb
        # margine del 12% attorno alla maschera, poi al rapporto 3:4
        mx, my = int((x1 - x0) * 0.12), int((y1 - y0) * 0.12)
        x0, y0 = max(0, x0 - mx), max(0, y0 - my)
        x1, y1 = min(W, x1 + mx), min(H, y1 + my)
        stretto = foto.crop((x0, y0, x1, y1))
        stretto.save(f"{OUT}/3-ritaglio-stretto.png")
        area_capo_intera = (x1 - x0) * (y1 - y0) / (W * H)
        # pixel utili sul capo, a parita' di tela 384x512
        prima = area_capo_intera * 384 * 512
        dopo = 384 * 512
        print(f"\nritaglio stretto {x1-x0}x{y1-y0} sul riquadro della maschera")
        print(f"  pixel di tela spesi sul capo: {prima:.0f} -> {dopo:.0f}  ({dopo/prima:.1f}x)")

    print(f"\nimmagini in {OUT}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "../web/person_sample.jpg",
         sys.argv[2] if len(sys.argv) > 2 else "upper")
