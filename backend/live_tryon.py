"""Try-on con avanzamento e anteprime dal vivo.

Una generazione locale dura circa settantacinque secondi. Una barra che si
riempie e' una bugia gentile: qui invece si vede davvero il capo formarsi,
perche' ogni tot passi il latente viene decodificato e spedito al client.

CatVTONPipeline non espone una callback, e non voglio toccare il codice di
terzi dentro CatVTON/. Quindi avvolgo `noise_scheduler.step`, che il ciclo
chiama esattamente una volta per passo, e da li' leggo il latente corrente.
Il costo e' una decodifica VAE per anteprima, misurata in 2,8 secondi su MPS
a 384x512, quindi ne faccio quattro e non di piu'.
"""
from __future__ import annotations

import base64
import io
import threading
import time
import uuid
from dataclasses import dataclass, field

import torch
from PIL import Image

# Quante anteprime spedire. Ogni decodifica VAE su MPS a 384x512 costa circa
# 2,8 secondi misurati, quindi ognuna e' il 3% del tempo totale: poche e messe
# dove servono.
ANTEPRIME = 4
DA_FRAZIONE = 0.18          # con x0 l'immagine e' leggibile presto, si puo' partire prima
LARGHEZZA_ANTEPRIMA = 220


@dataclass
class Lavoro:
    id: str
    passi: int
    fatto: int = 0
    stato: str = "in coda"          # in coda | genera | finito | errore
    avviato: float = field(default_factory=time.time)
    anteprima: str | None = None    # data URL dell'ultimo latente decodificato
    anteprima_v: int = 0            # sale solo quando l'anteprima e' nuova
    risultato: Image.Image | None = None
    errore: str | None = None
    guadagno: float = 1.0
    versione: int = 0               # sale a ogni cambiamento: il client sa se e' nuovo

    @property
    def secondi(self) -> float:
        return time.time() - self.avviato

    @property
    def stima(self) -> float:
        """Secondi mancanti, dal ritmo vero dei passi gia' fatti."""
        if self.fatto < 2:
            return float(self.passi) * 2.5
        return (self.secondi / self.fatto) * (self.passi - self.fatto)

    def istantanea(self, con_anteprima: bool = False) -> dict:
        d = {
            "id": self.id, "stato": self.stato, "passo": self.fatto, "passi": self.passi,
            "secondi": round(self.secondi, 1), "restano": round(self.stima, 1),
            "errore": self.errore, "guadagno": round(self.guadagno, 1),
            "v": self.versione, "av": self.anteprima_v,
        }
        if con_anteprima and self.anteprima:
            d["anteprima"] = self.anteprima   # solo quando e' cambiata: pesa 30 KB
        return d


_lavori: dict[str, Lavoro] = {}
_lock = threading.Lock()


def lavoro(job_id: str) -> Lavoro | None:
    return _lavori.get(job_id)


def _decodifica(pipe, latents, concat_dim: int) -> str | None:
    """Un latente intermedio diventa una miniatura in data URL.

    Non decodifico `prev_sample`, che a meta' corsa e' ancora rumore colorato e
    in interfaccia sembra un guasto. Decodifico `pred_original_sample`, cioe'
    l'immagine pulita che il modello stima in quel momento: e' sfocata all'inizio
    e si mette a fuoco, che e' esattamente il racconto giusto.
    """
    try:
        with torch.no_grad():
            x = latents.split(latents.shape[concat_dim] // 2, dim=concat_dim)[0]
            x = 1 / pipe.vae.config.scaling_factor * x
            img = pipe.vae.decode(x.to(pipe.device, dtype=pipe.weight_dtype)).sample
            img = (img / 2 + 0.5).clamp(0, 1)[0].permute(1, 2, 0).float().cpu().numpy()
        im = Image.fromarray((img * 255).astype("uint8"))
        h = int(im.height * LARGHEZZA_ANTEPRIMA / im.width)
        im = im.resize((LARGHEZZA_ANTEPRIMA, h), Image.BILINEAR)
        buf = io.BytesIO()
        im.save(buf, format="JPEG", quality=72)
        return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
    except Exception:
        return None   # un'anteprima persa non deve far fallire la generazione


class _Contapassi:
    """Avvolge scheduler.step: conta i passi e ogni tanto decodifica il latente."""

    def __init__(self, pipe, job: Lavoro, concat_dim: int):
        self.pipe, self.job, self.concat_dim = pipe, job, concat_dim
        self.vero = pipe.noise_scheduler.step
        primo = int(job.passi * DA_FRAZIONE)
        ultimo = job.passi - 2
        if ANTEPRIME <= 1 or ultimo <= primo:
            self.tappe = {ultimo}
        else:
            passo = (ultimo - primo) / (ANTEPRIME - 1)
            self.tappe = {int(round(primo + i * passo)) for i in range(ANTEPRIME)}

    def __enter__(self):
        def step(*a, **k):
            out = self.vero(*a, **k)
            j = self.job
            j.fatto += 1
            j.versione += 1
            if (j.fatto - 1) in self.tappe and j.fatto < j.passi:
                stima = getattr(out, "pred_original_sample", None)
                p = _decodifica(self.pipe, stima if stima is not None else out.prev_sample,
                                self.concat_dim)
                if p:
                    j.anteprima = p
                    j.anteprima_v += 1
                    j.versione += 1
            return out
        self.pipe.noise_scheduler.step = step
        return self

    def __exit__(self, *exc):
        self.pipe.noise_scheduler.step = self.vero
        return False


def avvia(esegui, passi: int, guadagno: float = 1.0) -> Lavoro:
    """Mette in moto `esegui(job, contapassi)` in un thread e restituisce il lavoro."""
    j = Lavoro(id=uuid.uuid4().hex[:12], passi=passi, guadagno=guadagno)
    with _lock:
        _lavori[j.id] = j
        # tieni corta la lista: i lavori vecchi non servono piu' a nessuno
        if len(_lavori) > 24:
            for vecchio in sorted(_lavori.values(), key=lambda x: x.avviato)[:8]:
                _lavori.pop(vecchio.id, None)

    def corri():
        j.stato = "genera"
        j.versione += 1
        try:
            j.risultato = esegui(j, _Contapassi)
            j.stato = "finito"
        except Exception as exc:
            j.errore = str(exc)
            j.stato = "errore"
        j.fatto = j.passi
        j.versione += 1

    threading.Thread(target=corri, daemon=True).start()
    return j
