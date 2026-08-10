"""A/B misurato: generazione su tutta la foto contro generazione sul ritaglio stretto.

Non passa dal server: chiama la pipeline in-process, cosi' misura solo il modello.
Salva le due immagini affiancate e stampa tempi e nitidezza sull'area del capo.

    .venv/bin/python confronto_ritaglio.py
"""
import os
import sys
import time

CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".hf-cache")
os.environ.setdefault("HF_HOME", CACHE)

import numpy as np
import torch
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "CatVTON"))

from mask_from_person import garment_mask  # noqa: E402
from tight_crop import riquadro_di_lavoro, ricomponi, guadagno  # noqa: E402

OUT = os.path.join(HERE, "outputs", "confronto")


def nitidezza(img: Image.Image, mask: Image.Image) -> float:
    """Varianza del laplaciano dentro la maschera: piu' alta = piu' dettaglio."""
    g = np.asarray(img.convert("L"), dtype=np.float32)
    k = np.array([[0, 1, 0], [1, -4, 1], [0, 1, 0]], dtype=np.float32)
    from numpy.lib.stride_tricks import sliding_window_view
    v = sliding_window_view(g, (3, 3))
    lap = (v * k).sum(axis=(-1, -2))
    m = np.asarray(mask.convert("L").crop((1, 1, mask.width - 1, mask.height - 1))) > 127
    return float(lap[m].var()) if m.any() else 0.0


def main():
    os.makedirs(OUT, exist_ok=True)
    from model.pipeline import CatVTONPipeline

    paths = dict(l.strip().split("=", 1) for l in open(os.path.join(HERE, "weights_paths.txt")))
    pipe = CatVTONPipeline(
        base_ckpt=paths["BASE"], attn_ckpt=paths["MIX"], attn_ckpt_version="mix",
        weight_dtype=torch.bfloat16, device="mps", skip_safety_check=True,
    )

    person = Image.open(os.path.join(HERE, "..", "web", "person_sample.jpg")).convert("RGB")
    capi = sorted(f for f in os.listdir(os.path.join(HERE, "..", "web", "garments"))
                  if f.lower().endswith((".png", ".jpg", ".jpeg")))
    cloth = Image.open(os.path.join(HERE, "..", "web", "garments", capi[0])).convert("RGB")
    print(f"persona {person.size}  capo {capi[0]} {cloth.size}")

    mask = garment_mask(person, "upper")
    box = riquadro_di_lavoro(mask, person.size)
    print(f"riquadro di lavoro {box}, guadagno {guadagno(mask, person.size):.1f}x\n")

    risultati = {}
    for nome, (p_in, m_in) in [("intera", (person, mask)),
                               ("stretto", (person.crop(box), mask.crop(box)))]:
        gen = torch.Generator(device="cpu").manual_seed(42)
        t0 = time.perf_counter()
        out = pipe(p_in, cloth, m_in, num_inference_steps=30, guidance_scale=2.5,
                   height=512, width=384, generator=gen)[0]
        dt = time.perf_counter() - t0
        finale = ricomponi(person, out, mask, box) if nome == "stretto" else out
        finale.save(f"{OUT}/{nome}.png")
        # per la nitidezza confronto entrambi riportati alla stessa scala della foto
        conf = finale.resize(person.size, Image.LANCZOS)
        n = nitidezza(conf, mask)
        risultati[nome] = (dt, n)
        print(f"{nome:8s} {dt:5.1f} s   nitidezza sul capo {n:8.1f}")
        try:
            torch.mps.empty_cache()
        except Exception:
            pass

    a, b = risultati["intera"], risultati["stretto"]
    print(f"\ntempo   {b[0]/a[0]:.2f}x")
    print(f"dettaglio sul capo  {b[1]/max(a[1], 1e-6):.2f}x")
    print(f"immagini in {OUT}")


if __name__ == "__main__":
    main()
