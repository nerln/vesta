"""Genera sul ritaglio stretto invece che su tutta la foto, poi ricompone.

Misurato su `web/person_sample.jpg` (768x1024) con la maschera della maglia:
il capo occupa il 9,7% della foto, quindi su una tela 384x512 riceve circa
42.000 pixel su 196.608. Ritagliando sul riquadro della maschera la stessa
tela e' tutta per il capo: 4,6 volte i pixel utili, a parita' di calcolo.

La ricomposizione non rimette l'intero riquadro generato: rimette solo la
zona della maschera, sfumata sul bordo. Cosi' viso, capelli e sfondo restano
i pixel originali a piena risoluzione, e la perdita di nitidezza del giro
384x512 resta dentro l'area che volevamo comunque riscrivere.
"""
from __future__ import annotations

from PIL import Image, ImageFilter
import numpy as np

# margine attorno al capo: serve al modello per capire dove finisce il corpo
MARGINE = 0.18
# la tela di CatVTON e' 3:4; dando gia' 3:4 il suo resize_and_crop non taglia nulla
RAPPORTO = 3 / 4
# quanto sfumare il bordo della maschera in ricomposizione, in frazione del lato
SFUMATURA = 0.012


def riquadro_maschera(mask: Image.Image) -> tuple[int, int, int, int] | None:
    m = np.array(mask.convert("L")) > 127
    if not m.any():
        return None
    ys, xs = np.where(m)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def riquadro_di_lavoro(mask: Image.Image, dim: tuple[int, int]) -> tuple[int, int, int, int] | None:
    """Il riquadro da ritagliare: la maschera piu' margine, portata a 3:4 e dentro la foto."""
    bb = riquadro_maschera(mask)
    if bb is None:
        return None
    W, H = dim
    x0, y0, x1, y1 = bb
    mx, my = (x1 - x0) * MARGINE, (y1 - y0) * MARGINE
    x0, y0, x1, y1 = x0 - mx, y0 - my, x1 + mx, y1 + my

    # porta a 3:4 allargando il lato corto, mai stringendo
    w, h = x1 - x0, y1 - y0
    if w / h > RAPPORTO:
        nh = w / RAPPORTO
        cy = (y0 + y1) / 2
        y0, y1 = cy - nh / 2, cy + nh / 2
    else:
        nw = h * RAPPORTO
        cx = (x0 + x1) / 2
        x0, x1 = cx - nw / 2, cx + nw / 2

    # rientra nella foto traslando, e solo se non basta stringe
    if x0 < 0:
        x1 -= x0; x0 = 0
    if y0 < 0:
        y1 -= y0; y0 = 0
    if x1 > W:
        x0 -= x1 - W; x1 = W
    if y1 > H:
        y0 -= y1 - H; y1 = H
    x0, y0 = max(0.0, x0), max(0.0, y0)
    x1, y1 = min(float(W), x1), min(float(H), y1)

    box = (int(round(x0)), int(round(y0)), int(round(x1)), int(round(y1)))
    if box[2] - box[0] < 64 or box[3] - box[1] < 64:
        return None
    return box


def guadagno(mask: Image.Image, dim: tuple[int, int]) -> float:
    """Quante volte in piu' la tela viene spesa sul capo. 1.0 = nessun guadagno."""
    box = riquadro_di_lavoro(mask, dim)
    if not box:
        return 1.0
    W, H = dim
    area_riquadro = (box[2] - box[0]) * (box[3] - box[1])
    return (W * H) / max(1, area_riquadro)


def ricomponi(originale: Image.Image, generato: Image.Image, mask: Image.Image,
              box: tuple[int, int, int, int]) -> Image.Image:
    """Rimette il generato nella foto, ma solo dentro la maschera e con bordo sfumato."""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    pezzo = generato.convert("RGB").resize((w, h), Image.LANCZOS)

    # la maschera ritagliata sullo stesso riquadro, sfumata: niente cuciture dure
    m = mask.convert("L").crop(box)
    raggio = max(1, int(round(min(w, h) * SFUMATURA)))
    m = m.filter(ImageFilter.GaussianBlur(raggio))

    out = originale.convert("RGB").copy()
    finestra = out.crop(box)
    out.paste(Image.composite(pezzo, finestra, m), box)
    return out
