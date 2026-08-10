"""Le figure salvate: piu' foto di se stessi, non una sola.

Graswald vende ai marchi "i loro avatar", cioe' modelle coerenti su tutto il
catalogo. La traduzione onesta per una persona sola e' questa: tieni piu' foto
tue (in piedi, seduta, di tre quarti, con luci diverse), scegli quale usare, e
il guardaroba resta lo stesso. Stanno sul server e non nel browser, cosi' le
ritrovi dal telefono senza rifotografarti.

Insieme alla foto salvo gli appigli gia' calcolati e l'analisi colore: sono i
due conti lenti, e rifarli a ogni cambio di figura si sente.
"""
from __future__ import annotations

import json
import os
import time
import uuid

from PIL import Image

LATO_MAX = 1280


class ArchivioFigure:
    def __init__(self, cartella: str):
        self.cartella = cartella
        self.indice = os.path.join(cartella, "figure.json")
        os.makedirs(cartella, exist_ok=True)

    # ---------------------------------------------------------------- lettura
    def tutte(self) -> list[dict]:
        if not os.path.exists(self.indice):
            return []
        try:
            with open(self.indice, encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []

    def una(self, fid: str) -> dict | None:
        return next((f for f in self.tutte() if f["id"] == fid), None)

    def percorso(self, fid: str) -> str:
        return os.path.join(self.cartella, f"{fid}.jpg")

    def immagine(self, fid: str) -> Image.Image | None:
        p = self.percorso(fid)
        return Image.open(p).convert("RGB") if os.path.exists(p) else None

    def attiva(self) -> dict | None:
        tutte = self.tutte()
        return next((f for f in tutte if f.get("attiva")), tutte[0] if tutte else None)

    # ---------------------------------------------------------------- scrittura
    def _scrivi(self, righe: list[dict]) -> None:
        with open(self.indice, "w", encoding="utf-8") as f:
            json.dump(righe, f, ensure_ascii=False, indent=1)

    def aggiungi(self, img: Image.Image, nome: str = "") -> dict:
        fid = uuid.uuid4().hex[:10]
        img = img.convert("RGB")
        s = min(1.0, LATO_MAX / max(img.size))
        if s < 1.0:
            img = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
        img.save(self.percorso(fid), "JPEG", quality=92)

        righe = self.tutte()
        riga = {
            "id": fid,
            "nome": (nome or f"Figura {len(righe) + 1}").strip()[:40],
            "w": img.width, "h": img.height,
            "creata": int(time.time()),
            "attiva": not righe,          # la prima diventa attiva da sola
        }
        righe.append(riga)
        self._scrivi(righe)
        return riga

    def aggiorna(self, fid: str, **campi) -> dict | None:
        righe = self.tutte()
        for r in righe:
            if r["id"] == fid:
                r.update({k: v for k, v in campi.items() if v is not None})
                self._scrivi(righe)
                return r
        return None

    def rendi_attiva(self, fid: str) -> dict | None:
        righe = self.tutte()
        trovata = None
        for r in righe:
            r["attiva"] = (r["id"] == fid)
            if r["attiva"]:
                trovata = r
        if trovata:
            self._scrivi(righe)
        return trovata

    def elimina(self, fid: str) -> bool:
        righe = self.tutte()
        restano = [r for r in righe if r["id"] != fid]
        if len(restano) == len(righe):
            return False
        era_attiva = any(r["id"] == fid and r.get("attiva") for r in righe)
        if era_attiva and restano:
            restano[0]["attiva"] = True
        self._scrivi(restano)
        p = self.percorso(fid)
        if os.path.exists(p):
            os.remove(p)
        return True
