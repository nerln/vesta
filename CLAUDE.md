# Nota sull'ambiente, 10 agosto 2026

Durante una pulizia del disco sono stati tolti da questo progetto file pesanti
che si riscaricano. **Il codice e la cronologia git non sono stati toccati.**

## Cosa manca e come si rimette

| Cosa | Peso | Come si ripristina |
|---|---|---|
| `backend/.hf-cache/` | 3,8 GB | cache HuggingFace del backend: contiene i pesi di `booksforcharlie/stable-diffusion-inpainting` (3,2 GB) e `stabilityai/sd-vae-ft-mse` (319 MB). Si riscaricano da soli al primo avvio del backend. |
| `backend/.venv/` | 1,2 GB | `cd backend && python3 -m venv .venv && pip install -r requirements.txt` |

## Attenzione al Python

Il venv del backend **puntava a pyenv**, non al Python di sistema:

```
home = /Users/eugenionerelli/.pyenv/versions/3.11.13/bin
```

`~/.pyenv` non e' stato toccato ed e' ancora al suo posto. Se ricrei il venv,
usa la stessa versione (`pyenv local 3.11.13`) o il backend potrebbe non partire
con le dipendenze bloccate.

## Cosa non e' stato toccato

`backend/CatVTON` e il resto del codice sono intatti. La cache HuggingFace
scaricata dentro il progetto e' esclusa dai backup Time Machine, quindi se
sparisce non c'e' modo di recuperarla se non riscaricandola.
